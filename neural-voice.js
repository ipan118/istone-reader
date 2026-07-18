// 神经语音包（试验）：把开源 TTS 引擎 + 音色模型打包成 .zip 语音包，导入后
// 在 Web Worker 里本机合成真实音频（真男声/女声），全程离线、不联网。
//
// 语音包格式（zip 根目录）：
//   istone-voice-pack.json —— 清单：
//     { "format": "istone-voice-pack", "version": 1,
//       "id": "kokoro-zh", "label": "Kokoro 中文", "engine": "worker-js",
//       "entry": "engine.js",
//       "voices": [{ "id": "yunjian", "name": "云健 · 男声", "lang": "zh-CN" }] }
//   engine.js —— 合成引擎（Worker 脚本），协议见下；
//   其余文件 —— 模型数据，init 时以 blob URL 交给引擎。
//
// Worker 协议：
//   收 { type:"init", manifest, files:{名:blobURL} } → 发 { type:"ready" } 或 { type:"error", message }
//   收 { type:"synthesize", id, text, voiceId, speed } →
//     发 { type:"audio", id, sampleRate, samples:Float32Array } 或 { type:"error", id, message }

const PACK_DB_NAME = "istone-voice-packs";
const PACK_DB_VERSION = 1;
const PACK_STORE = "packs";
const MANIFEST_NAME = "istone-voice-pack.json";
const INIT_TIMEOUT_MS = 25000;
const SYNTH_TIMEOUT_MS = 30000;
const MAX_PACK_FILES = 200;
const MAX_PACK_BYTES = 800 * 1024 * 1024;

export const NEURAL_VOICE_PREFIX = "istone-neural:";

const runtime = {
  packs: new Map(), // id -> { manifest, files: {name: Blob} }
  workers: new Map(), // id -> { worker, ready: Promise, fileUrls: [] }
  requestSeq: 0,
};

function openPackDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PACK_DB_NAME, PACK_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PACK_STORE)) {
        db.createObjectStore(PACK_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("voice-pack-db-open"));
  });
}

async function runPackStore(mode, executor) {
  const db = await openPackDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PACK_STORE, mode);
      const store = tx.objectStore(PACK_STORE);
      const request = executor(store);
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error || new Error("voice-pack-db-tx"));
      tx.onabort = () => reject(tx.error || new Error("voice-pack-db-abort"));
    });
  } finally {
    db.close();
  }
}

function validateManifest(manifest, fileNames) {
  if (!manifest || manifest.format !== "istone-voice-pack") {
    throw new Error("不是有效的语音包：缺少 istone-voice-pack 清单。");
  }
  if (manifest.version !== 1) {
    throw new Error(`不支持的语音包版本：${manifest.version}，当前应用支持版本 1。`);
  }
  if (manifest.engine !== "worker-js") {
    throw new Error(`不支持的引擎类型：${manifest.engine}。`);
  }
  if (typeof manifest.id !== "string" || !/^[\w-]{1,64}$/.test(manifest.id)) {
    throw new Error("语音包 id 无效。");
  }
  if (typeof manifest.entry !== "string" || !fileNames.includes(manifest.entry)) {
    throw new Error("语音包缺少引擎入口文件。");
  }
  if (!Array.isArray(manifest.voices) || !manifest.voices.length) {
    throw new Error("语音包没有声明任何音色。");
  }
  manifest.voices.forEach((voice) => {
    if (typeof voice?.id !== "string" || !voice.id || typeof voice?.name !== "string" || !voice.name) {
      throw new Error("语音包音色声明不完整。");
    }
  });
}

// 导入 .zip 语音包（依赖页面已加载的全局 JSZip）。
export async function importVoicePackZip(file) {
  if (typeof JSZip === "undefined") {
    throw new Error("解压组件未就绪，请刷新后重试。");
  }
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (!entries.length || entries.length > MAX_PACK_FILES) {
    throw new Error("语音包内容为空或文件过多。");
  }
  const manifestEntry = zip.file(MANIFEST_NAME);
  if (!manifestEntry) {
    throw new Error(`不是语音包：zip 根目录缺少 ${MANIFEST_NAME}。`);
  }
  const manifest = JSON.parse(await manifestEntry.async("string"));
  const fileNames = entries.map((entry) => entry.name);
  validateManifest(manifest, fileNames);

  const files = {};
  let totalBytes = 0;
  for (const entry of entries) {
    const blob = await entry.async("blob");
    totalBytes += blob.size;
    if (totalBytes > MAX_PACK_BYTES) {
      throw new Error("语音包超过大小上限。");
    }
    files[entry.name] = blob;
  }

  await disposePackWorker(manifest.id);
  await runPackStore("readwrite", (store) => store.put({ id: manifest.id, manifest, files }));
  runtime.packs.set(manifest.id, { manifest, files });
  return manifest;
}

export async function deleteVoicePack(packId) {
  await disposePackWorker(packId);
  runtime.packs.delete(packId);
  await runPackStore("readwrite", (store) => store.delete(packId));
}

// 启动时把已安装语音包读进内存目录（模型 Blob 仍留在 IndexedDB，按需取用）。
export async function initNeuralVoicePacks() {
  try {
    const records = (await runPackStore("readonly", (store) => store.getAll())) || [];
    runtime.packs.clear();
    records.forEach((record) => {
      if (record?.id && record?.manifest) {
        runtime.packs.set(record.id, { manifest: record.manifest, files: record.files || {} });
      }
    });
  } catch {
    // 数据库不可用时静默降级：应用照常运行，只是没有神经语音。
  }
  return listNeuralVoicePacks();
}

export function listNeuralVoicePacks() {
  return [...runtime.packs.values()].map(({ manifest }) => manifest);
}

// 供语音目录合并的伪 voice 条目（与系统 SpeechSynthesisVoice 同形）。
export function getNeuralVoiceCatalogEntries() {
  const entries = [];
  runtime.packs.forEach(({ manifest }) => {
    manifest.voices.forEach((voice) => {
      entries.push({
        name: voice.name,
        lang: voice.lang || "zh-CN",
        voiceURI: `${NEURAL_VOICE_PREFIX}${manifest.id}:${voice.id}`,
        default: false,
        localService: true,
        source: "neural-pack",
      });
    });
  });
  return entries;
}

export function isNeuralVoiceURI(voiceURI) {
  return String(voiceURI || "").startsWith(NEURAL_VOICE_PREFIX);
}

function parseNeuralVoiceURI(voiceURI) {
  const raw = String(voiceURI || "").slice(NEURAL_VOICE_PREFIX.length);
  const separator = raw.indexOf(":");
  if (separator <= 0) {
    return null;
  }
  return { packId: raw.slice(0, separator), voiceId: raw.slice(separator + 1) };
}

async function ensurePackWorker(packId) {
  const existing = runtime.workers.get(packId);
  if (existing) {
    await existing.ready;
    return existing;
  }
  const pack = runtime.packs.get(packId);
  if (!pack) {
    throw new Error("语音包不存在或已删除。");
  }
  const entryBlob = pack.files[pack.manifest.entry];
  if (!entryBlob) {
    throw new Error("语音包引擎入口文件缺失。");
  }

  const fileUrls = [];
  const fileUrlMap = {};
  Object.entries(pack.files).forEach(([name, blob]) => {
    const url = URL.createObjectURL(blob);
    fileUrls.push(url);
    fileUrlMap[name] = url;
  });
  const entryUrl = URL.createObjectURL(entryBlob);
  fileUrls.push(entryUrl);
  const worker = new Worker(entryUrl);
  const handle = { worker, fileUrls, pending: new Map() };

  handle.ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("语音包引擎初始化超时。")), INIT_TIMEOUT_MS);
    worker.onmessage = (event) => {
      const message = event.data || {};
      if (message.type === "ready") {
        clearTimeout(timer);
        worker.onmessage = (dataEvent) => dispatchWorkerMessage(handle, dataEvent);
        resolve();
        return;
      }
      if (message.type === "error" && !message.id) {
        clearTimeout(timer);
        reject(new Error(message.message || "语音包引擎初始化失败。"));
      }
    };
    worker.onerror = (error) => {
      clearTimeout(timer);
      reject(new Error(error?.message || "语音包引擎加载失败。"));
    };
    worker.postMessage({ type: "init", manifest: pack.manifest, files: fileUrlMap });
  });

  runtime.workers.set(packId, handle);
  try {
    await handle.ready;
  } catch (error) {
    await disposePackWorker(packId);
    throw error;
  }
  return handle;
}

function dispatchWorkerMessage(handle, event) {
  const message = event.data || {};
  const pending = message.id ? handle.pending.get(message.id) : null;
  if (!pending) {
    return;
  }
  handle.pending.delete(message.id);
  clearTimeout(pending.timer);
  if (message.type === "audio" && message.samples instanceof Float32Array === false && message.samples?.buffer) {
    message.samples = new Float32Array(message.samples.buffer);
  }
  if (message.type === "audio" && message.samples?.length && message.sampleRate > 0) {
    pending.resolve({ samples: message.samples, sampleRate: message.sampleRate });
  } else {
    pending.reject(new Error(message.message || "语音包合成失败。"));
  }
}

async function disposePackWorker(packId) {
  const handle = runtime.workers.get(packId);
  if (!handle) {
    return;
  }
  runtime.workers.delete(packId);
  try {
    handle.worker.terminate();
  } catch {
    // Ignore terminate races.
  }
  handle.pending?.forEach((pending) => {
    clearTimeout(pending.timer);
    pending.reject(new Error("语音包已卸载。"));
  });
  handle.fileUrls.forEach((url) => URL.revokeObjectURL(url));
}

// 合成一句话 → WAV Blob（16-bit 单声道）。
export async function synthesizeNeuralSpeech(voiceURI, text, options = {}) {
  const target = parseNeuralVoiceURI(voiceURI);
  if (!target) {
    throw new Error("神经语音标识无效。");
  }
  const handle = await ensurePackWorker(target.packId);
  const id = `synth-${(runtime.requestSeq += 1)}`;
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      handle.pending.delete(id);
      reject(new Error("语音合成超时，可能是设备算力不足。"));
    }, SYNTH_TIMEOUT_MS);
    handle.pending.set(id, { resolve, reject, timer });
    handle.worker.postMessage({
      type: "synthesize",
      id,
      text: String(text || ""),
      voiceId: target.voiceId,
      speed: Number(options.speed) > 0 ? Number(options.speed) : 1,
    });
  });
  return encodeWavBlob(result.samples, result.sampleRate);
}

function encodeWavBlob(samples, sampleRate) {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const dataBytes = pcm.length * 2;
  const writeString = (offset, value) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataBytes, true);
  return new Blob([header, pcm.buffer], { type: "audio/wav" });
}
