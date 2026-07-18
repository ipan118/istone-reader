#!/usr/bin/env node
// 组装官方神经语音包（istone-voice-pack format 1，引擎 sherpa-onnx WASM）。
//
// 用法：
//   node scripts/build-voice-pack.mjs --source <目录或HF空间ID> [--out dist/pack.zip]
//     [--id vits-zh-aishell3] [--label "中文多音色（AISHELL-3）"]
//     [--voices voices.json]
//
// --source 两种取值：
//   1) 本地目录：已包含 sherpa-onnx-tts.js / sherpa-onnx-wasm-main*.{js,wasm,data}；
//   2) Hugging Face 空间 ID（如 k2-fsa/web-assembly-tts-sherpa-onnx-zh）：
//      自动列出并下载上述文件（需要网络，通常在 GitHub Actions 里跑）。
// --voices 指向 JSON 数组：[{ "id":"male-1","name":"男声一","lang":"zh-CN","sid":10 }, ...]
//   sid 为 sherpa-onnx 多说话人模型的说话人编号（可用 voice-pack-lab.cjs scan 挑选）。
//
// 产物：pack.zip + pack.zip.sha256。zip 使用 STORE（不压缩）——模型本身已高度
// 压缩，STORE 让手机端导入解压快得多。

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNTIME_FILE_PATTERNS = [
  /(^|\/)sherpa-onnx-tts\.js$/,
  /(^|\/)sherpa-onnx-wasm-main[^/]*\.js$/,
  /(^|\/)sherpa-onnx-wasm-main[^/]*\.wasm$/,
  /(^|\/)sherpa-onnx-wasm-main[^/]*\.data$/,
];

function parseArgs(argv) {
  const args = { out: "dist/voice-pack.zip", id: "vits-zh-aishell3", label: "中文多音色（AISHELL-3）" };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--source") args.source = argv[++i];
    else if (key === "--out") args.out = argv[++i];
    else if (key === "--id") args.id = argv[++i];
    else if (key === "--label") args.label = argv[++i];
    else if (key === "--voices") args.voices = argv[++i];
    else throw new Error(`未知参数：${key}`);
  }
  if (!args.source) throw new Error("必须提供 --source（本地目录或 HF 空间 ID）");
  return args;
}

const DEFAULT_VOICES = [
  { id: "male-1", name: "男声一 · 沉稳", lang: "zh-CN", sid: 0 },
  { id: "male-2", name: "男声二 · 清朗", lang: "zh-CN", sid: 1 },
  { id: "female-1", name: "女声一 · 温润", lang: "zh-CN", sid: 2 },
  { id: "female-2", name: "女声二 · 明快", lang: "zh-CN", sid: 3 },
];

async function collectRuntimeFiles(source) {
  const isLocal = existsSync(source) && statSync(source).isDirectory();
  if (isLocal) {
    const files = new Map();
    for (const name of readdirSync(source)) {
      if (RUNTIME_FILE_PATTERNS.some((pattern) => pattern.test(name))) {
        files.set(name, readFileSync(join(source, name)));
      }
    }
    return files;
  }

  // Hugging Face 空间：列文件 → 下载运行时文件。
  const listUrl = `https://huggingface.co/api/spaces/${source}/tree/main`;
  const listing = await fetchJson(listUrl);
  const names = listing
    .filter((entry) => entry.type === "file")
    .map((entry) => entry.path)
    .filter((path) => RUNTIME_FILE_PATTERNS.some((pattern) => pattern.test(path)));
  if (!names.length) {
    throw new Error(`在空间 ${source} 里没有找到 sherpa-onnx wasm 运行时文件`);
  }
  const files = new Map();
  for (const path of names) {
    const url = `https://huggingface.co/spaces/${source}/resolve/main/${path}`;
    process.stderr.write(`下载 ${path} ...\n`);
    files.set(basename(path), await fetchBinary(url));
  }
  return files;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "istone-reader-pack-builder" } });
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  return response.json();
}

async function fetchBinary(url) {
  const response = await fetch(url, { headers: { "User-Agent": "istone-reader-pack-builder" } });
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

// 最小 zip 写入器（STORE，无压缩依赖）。
function buildZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };

  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // STORE
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, data);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(0, 10);
    dir.writeUInt16LE(0, 12);
    dir.writeUInt16LE(0, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([dir, nameBuf]));
    offset += 30 + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, end]);
}

async function main() {
  const args = parseArgs(process.argv);
  const voices = args.voices ? JSON.parse(readFileSync(resolve(args.voices), "utf8")) : DEFAULT_VOICES;
  if (!Array.isArray(voices) || !voices.length) throw new Error("--voices 必须是非空数组");

  const runtimeFiles = await collectRuntimeFiles(args.source);
  const missing = RUNTIME_FILE_PATTERNS.filter(
    (pattern) => ![...runtimeFiles.keys()].some((name) => pattern.test(name)),
  );
  if (missing.length) {
    throw new Error(`运行时文件不齐（找到：${[...runtimeFiles.keys()].join(", ") || "无"}）`);
  }

  const manifest = {
    format: "istone-voice-pack",
    version: 1,
    id: args.id,
    label: args.label,
    engine: "worker-js",
    entry: "engine.js",
    voices,
  };

  const entries = [
    ["istone-voice-pack.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8")],
    ["engine.js", readFileSync(join(HERE, "pack-src", "engine-sherpa-onnx.js"))],
    ...[...runtimeFiles.entries()].sort(([a], [b]) => a.localeCompare(b)),
  ];
  const zip = buildZip(entries);

  const outPath = resolve(args.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, zip);
  const sha256 = createHash("sha256").update(zip).digest("hex");
  writeFileSync(`${outPath}.sha256`, `${sha256}  ${basename(outPath)}\n`);

  console.log(`语音包已生成：${outPath}`);
  console.log(`大小：${(zip.length / 1024 / 1024).toFixed(1)} MB · SHA-256：${sha256}`);
  console.log(`音色：${voices.map((voice) => `${voice.name}(sid=${voice.sid})`).join(" / ")}`);
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});
