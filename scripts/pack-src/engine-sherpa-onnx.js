// istone-voice-pack 引擎适配层：sherpa-onnx WASM TTS（worker-js / format 1）。
//
// 语音包 zip 里应包含上游 sherpa-onnx wasm TTS 构建的三件套 + API 辅助脚本：
//   sherpa-onnx-tts.js           —— createOfflineTts(Module) 等 JS API
//   sherpa-onnx-wasm-main*.js    —— Emscripten 胶水
//   sherpa-onnx-wasm-main*.wasm  —— 运行时
//   sherpa-onnx-wasm-main*.data  —— file_packager 打进的模型文件
//
// 兼容两代构建：
//   · 经典构建：全局 Module + onRuntimeInitialized；
//   · ES Module 构建（MODULARIZE + EXPORT_ES6，新版默认）：`export default 工厂`。
//     经典 Worker 不能 importScripts ES 模块，因此先把脚本文本做保守归一化
//     （剥 export 前缀、把 import.meta.url 换成 self.location.href），再以
//     blob 方式 importScripts；工厂存在时 `await 工厂({locateFile})` 取实例。
//
// 音色映射：manifest.voices[].sid 指定 sherpa-onnx 的说话人 id（多说话人
// 模型如 AISHELL-3 用 sid 区分男声/女声）。
//
// 协议（与应用 neural-voice.js 对应）：
//   init → ready / error；synthesize{id,text,voiceId,speed} → audio / error。

let tts = null;
let manifest = null;

function findFile(files, pattern) {
  const name = Object.keys(files).find((key) => pattern.test(key));
  return name ? { name, url: files[name] } : null;
}

function postError(message, id) {
  postMessage({ type: "error", id: id || undefined, message: String(message || "unknown-error") });
}

// 把 ES Module 脚本归一化成经典脚本（保守文本变换，只动模块语法本身）。
function normalizeModuleScript(source) {
  return source
    .replace(/\bimport\.meta\.url\b/g, "self.location.href")
    .replace(/^\s*export\s*\{\s*([A-Za-z_$][\w$]*)\s+as\s+default\s*\}\s*;?\s*$/m, "self.__sherpaModuleFactory = $1;")
    .replace(/^\s*export\s+default\s+/m, "self.__sherpaModuleFactory = ")
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, "")
    .replace(/^(\s*)export\s+(async\s+function|function|class|const|let|var)\b/gm, "$1$2");
}

async function importScriptNormalized(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`加载脚本失败：${response.status}`);
  }
  const source = await response.text();
  const isModule = /^\s*export\s/m.test(source) || /\bimport\.meta\b/.test(source);
  const finalSource = isModule ? normalizeModuleScript(source) : source;
  const blobUrl = URL.createObjectURL(new Blob([finalSource], { type: "text/javascript" }));
  try {
    importScripts(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

async function initEngine(files) {
  const api = findFile(files, /(^|\/)sherpa-onnx-tts\.js$/);
  const glue = findFile(files, /(^|\/)sherpa-onnx-wasm-main[^/]*\.js$/);
  if (!api || !glue) {
    throw new Error("语音包缺少 sherpa-onnx 运行时文件。");
  }

  const locateFile = (path) => {
    const base = String(path).split("/").pop();
    const match = Object.keys(files).find((key) => key === path || key.split("/").pop() === base);
    return match ? files[match] : path;
  };

  // 经典构建在 importScripts 时读取全局 Module；先备好。
  const classicReady = new Promise((resolve, reject) => {
    self.Module = {
      locateFile,
      print: () => {},
      printErr: () => {},
      onRuntimeInitialized: () => resolve(self.Module),
      onAbort: (reason) => reject(new Error(`引擎中止：${reason}`)),
    };
  });

  await importScriptNormalized(api.url);
  await importScriptNormalized(glue.url);

  let moduleInstance;
  if (typeof self.__sherpaModuleFactory === "function") {
    // ES Module 构建：工厂 resolve 时运行时与 .data 均已就绪。
    moduleInstance = await self.__sherpaModuleFactory({
      locateFile,
      print: () => {},
      printErr: () => {},
    });
  } else {
    moduleInstance = await classicReady;
  }

  /* global createOfflineTts */
  if (typeof createOfflineTts !== "function") {
    throw new Error("运行时里没有 createOfflineTts 接口。");
  }
  return createOfflineTts(moduleInstance);
}

onmessage = (event) => {
  const message = event.data || {};

  if (message.type === "init") {
    if (tts) {
      postMessage({ type: "ready" });
      return;
    }
    manifest = message.manifest || null;
    initEngine(message.files || {})
      .then((engine) => {
        tts = engine;
        postMessage({ type: "ready" });
      })
      .catch((error) => postError(`引擎初始化失败：${error?.message || error}`));
    return;
  }

  if (message.type === "synthesize") {
    if (!tts) {
      postError("引擎尚未初始化。", message.id);
      return;
    }
    const text = String(message.text || "").trim();
    if (!text) {
      postError("空文本。", message.id);
      return;
    }
    const voice = manifest?.voices?.find((item) => item.id === message.voiceId) || null;
    const sid = Number.isInteger(voice?.sid) ? voice.sid : 0;
    const speed = Math.min(3, Math.max(0.5, Number(message.speed) > 0 ? Number(message.speed) : 1));
    try {
      const result = tts.generate({ text, sid, speed });
      const source = result?.samples instanceof Float32Array ? result.samples : null;
      if (!source || !source.length || !(result?.sampleRate > 0)) {
        postError("引擎没有产出音频。", message.id);
        return;
      }
      // 拷贝成独立缓冲后再 transfer：sherpa 返回的常是 WASM 堆的子视图，直接
      // transfer 它的 buffer 会把整块引擎堆 detach 掉，后续合成即报 detached。
      const samples = new Float32Array(source.length);
      samples.set(source);
      postMessage(
        { type: "audio", id: message.id, sampleRate: result.sampleRate, samples },
        [samples.buffer],
      );
    } catch (error) {
      postError(`合成失败：${error?.message || error}`, message.id);
    }
  }
};
