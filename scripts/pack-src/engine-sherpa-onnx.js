// istone-voice-pack 引擎适配层：sherpa-onnx WASM TTS（worker-js / format 1）。
//
// 语音包 zip 里应包含上游 sherpa-onnx wasm TTS 构建的三件套 + API 辅助脚本：
//   sherpa-onnx-tts.js           —— createOfflineTts(Module) 等 JS API
//   sherpa-onnx-wasm-main*.js    —— Emscripten 胶水
//   sherpa-onnx-wasm-main*.wasm  —— 运行时
//   sherpa-onnx-wasm-main*.data  —— file_packager 打进的模型文件
// 本 Worker 在 init 时拿到全部文件的 blob URL，用 Module.locateFile 把胶水
// 对 .wasm/.data 的相对路径请求重定向到 blob URL，然后 createOfflineTts。
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

onmessage = (event) => {
  const message = event.data || {};

  if (message.type === "init") {
    if (tts) {
      postMessage({ type: "ready" });
      return;
    }
    manifest = message.manifest || null;
    const files = message.files || {};
    const api = findFile(files, /(^|\/)sherpa-onnx-tts\.js$/);
    const glue = findFile(files, /(^|\/)sherpa-onnx-wasm-main[^/]*\.js$/);
    if (!api || !glue) {
      postError("语音包缺少 sherpa-onnx 运行时文件。");
      return;
    }
    try {
      self.Module = {
        // 胶水与 file_packager 按相对文件名请求 .wasm/.data —— 全部重定向到
        // 包内文件的 blob URL；未知路径原样返回（会 404，便于暴露缺文件）。
        locateFile: (path) => {
          const base = String(path).split("/").pop();
          const match = Object.keys(files).find((key) => key === path || key.split("/").pop() === base);
          return match ? files[match] : path;
        },
        print: () => {},
        printErr: () => {},
        onRuntimeInitialized: () => {
          try {
            /* global createOfflineTts */
            tts = createOfflineTts(self.Module);
            postMessage({ type: "ready" });
          } catch (error) {
            postError(`引擎初始化失败：${error?.message || error}`);
          }
        },
        onAbort: (reason) => postError(`引擎中止：${reason}`),
      };
      importScripts(api.url, glue.url);
    } catch (error) {
      postError(`引擎加载失败：${error?.message || error}`);
    }
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
      const samples = result?.samples instanceof Float32Array ? result.samples : new Float32Array(0);
      if (!samples.length || !(result?.sampleRate > 0)) {
        postError("引擎没有产出音频。", message.id);
        return;
      }
      postMessage(
        { type: "audio", id: message.id, sampleRate: result.sampleRate, samples },
        [samples.buffer],
      );
    } catch (error) {
      postError(`合成失败：${error?.message || error}`, message.id);
    }
  }
};
