#!/usr/bin/env node
// 语音包实验台（需要 playwright + Chromium，通常在 CI 或本机跑）：
//
//   scan   —— 扫描 sherpa-onnx 多说话人模型的说话人，估算基频（F0）区分
//             男声/女声，输出建议的 voices.json：
//             node scripts/voice-pack-lab.cjs scan --runtime <目录> [--max-sid 40]
//   verify —— 对打好的语音包 zip 做全链路验证（引擎协议直测 + 应用导入实测）：
//             node scripts/voice-pack-lab.cjs verify --pack dist/voice-pack.zip
//
// scan 的 --runtime 目录需包含 sherpa-onnx-tts.js / sherpa-onnx-wasm-main*.{js,wasm,data}。

const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const ROOT = path.resolve(__dirname, "..");
const SCAN_TEXT = "今天的天气很好。";
const VERIFY_TEXT = "旧书架的第三层放着一本没有署名的诗集。";
const MIME = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript",
  ".wasm": "application/wasm", ".data": "application/octet-stream", ".zip": "application/zip",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png",
};

function parseArgs(argv) {
  const args = { maxSid: 40 };
  args.command = argv[2];
  for (let i = 3; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--runtime") args.runtime = argv[++i];
    else if (key === "--pack") args.pack = argv[++i];
    else if (key === "--max-sid") args.maxSid = Number(argv[++i]);
    else if (key === "--out") args.out = argv[++i];
    else throw new Error(`未知参数：${key}`);
  }
  return args;
}

function serveDir(dir, port) {
  const server = http.createServer((req, res) => {
    let pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (pathname === "/") pathname = "/index.html";
    const file = path.join(dir, pathname);
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      if (pathname === "/index.html") {
        // 运行时目录没有页面文件：给实验台一个可落脚的同源空白页。
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<!doctype html><title>voice lab</title><body>lab</body>");
        return;
      }
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

async function launch() {
  return chromium.launch({
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"],
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
}

// 页面内驱动：以 blob URL 集合直接启动引擎 Worker（与应用 neural-voice.js 同
// 协议），并就地计算时长/响度/基频，只把标量传回 Node。
const DRIVER_SNIPPET = `
  window.__startEngineWorker = (fileUrls, manifest) => new Promise((resolve, reject) => {
    const worker = new Worker(fileUrls["engine.js"]);
    const timer = setTimeout(() => reject(new Error("init timeout")), 180000);
    worker.onmessage = (event) => {
      const m = event.data || {};
      if (m.type === "ready") { clearTimeout(timer); window.__worker = worker; resolve(); }
      else if (m.type === "error" && !m.id) { clearTimeout(timer); reject(new Error(m.message)); }
    };
    worker.onerror = (e) => { clearTimeout(timer); reject(new Error(e.message || "worker error")); };
    worker.postMessage({ type: "init", manifest, files: fileUrls });
  });

  let __seq = 0;
  const __pending = new Map();
  window.__attachDispatcher = () => {
    window.__worker.onmessage = (event) => {
      const m = event.data || {};
      const entry = __pending.get(m.id);
      if (!entry) return;
      __pending.delete(m.id);
      clearTimeout(entry.timer);
      if (m.type === "audio") entry.resolve(m);
      else entry.reject(new Error(m.message || "synthesize failed"));
    };
  };

  // 基频估计：逐帧去直流 + 归一化互相关（80–400Hz 搜索窗），对真实语音有效；
  // 取浊音帧的中位数，另报浊音帧占比用于诊断。
  function estimatePitch(samples, sampleRate) {
    const frame = Math.floor(sampleRate * 0.04);
    const hop = Math.floor(sampleRate * 0.02);
    const minLag = Math.floor(sampleRate / 400);
    const maxLag = Math.floor(sampleRate / 80);
    let total = 0;
    for (let i = 0; i < samples.length; i += 1) total += samples[i] * samples[i];
    const clipRms = Math.sqrt(total / Math.max(1, samples.length));
    const gate = Math.max(1e-5, clipRms * 0.2);
    const pitches = [];
    let frames = 0;
    for (let start = 0; start + frame + maxLag < samples.length; start += hop) {
      frames += 1;
      let mean = 0;
      for (let i = 0; i < frame; i += 1) mean += samples[start + i];
      mean /= frame;
      let e0 = 0;
      for (let i = 0; i < frame; i += 1) { const v = samples[start + i] - mean; e0 += v * v; }
      if (Math.sqrt(e0 / frame) < gate) continue;
      let bestLag = 0;
      let bestR = 0;
      for (let lag = minLag; lag <= maxLag; lag += 1) {
        let num = 0;
        let e1 = 0;
        for (let i = 0; i < frame; i += 1) {
          const a = samples[start + i] - mean;
          const b = samples[start + i + lag] - mean;
          num += a * b;
          e1 += b * b;
        }
        const r = num / Math.sqrt(e0 * e1 + 1e-12);
        if (r > bestR) { bestR = r; bestLag = lag; }
      }
      if (bestLag > 0 && bestR > 0.5) pitches.push(sampleRate / bestLag);
    }
    if (!pitches.length) return { pitch: 0, voicedRatio: 0 };
    pitches.sort((a, b) => a - b);
    return { pitch: pitches[Math.floor(pitches.length / 2)], voicedRatio: pitches.length / Math.max(1, frames) };
  }

  window.__synthStats = (voiceId, text) => new Promise((resolve, reject) => {
    const id = "lab-" + (__seq += 1);
    const started = performance.now();
    const timer = setTimeout(() => { __pending.delete(id); reject(new Error("synthesize timeout")); }, 180000);
    __pending.set(id, {
      timer,
      reject,
      resolve: (m) => {
        const samples = m.samples instanceof Float32Array ? m.samples : new Float32Array(m.samples.buffer);
        let sumSquares = 0;
        for (let i = 0; i < samples.length; i += 1) sumSquares += samples[i] * samples[i];
        const f0 = estimatePitch(samples, m.sampleRate);
        resolve({
          seconds: Number((samples.length / m.sampleRate).toFixed(2)),
          rms: Number(Math.sqrt(sumSquares / Math.max(1, samples.length)).toFixed(4)),
          pitch: Math.round(f0.pitch),
          voicedRatio: Number(f0.voicedRatio.toFixed(2)),
          sampleRate: m.sampleRate,
          synthMs: Math.round(performance.now() - started),
        });
      },
    });
    window.__worker.postMessage({ type: "synthesize", id, text, voiceId, speed: 1 });
  });
`;

async function commandScan(args) {
  if (!args.runtime) throw new Error("scan 需要 --runtime <目录>");
  const runtimeDir = path.resolve(args.runtime);
  const engineSource = fs.readFileSync(path.join(__dirname, "pack-src", "engine-sherpa-onnx.js"), "utf8");
  const runtimeNames = fs
    .readdirSync(runtimeDir)
    .filter((name) => /sherpa-onnx-(tts\.js|wasm-main[^/]*\.(js|wasm|data))$/.test(name));
  if (!runtimeNames.length) throw new Error("运行时目录里没有 sherpa-onnx wasm 文件");

  const server = await serveDir(runtimeDir, 4455);
  const browser = await launch();
  try {
    const page = await browser.newPage();
    page.on("console", (m) => { if (m.type() === "error") console.error("[page]", m.text()); });
    // 先落到本地服务的源上，blob Worker 与文件 fetch 才同源。
    await page.goto("http://127.0.0.1:4455/", { waitUntil: "domcontentloaded" });
    await page.addScriptTag({ content: DRIVER_SNIPPET });

    const candidateVoices = Array.from({ length: args.maxSid + 1 }, (_, sid) => ({ id: `sid-${sid}`, name: `sid-${sid}`, sid }));
    await page.evaluate(
      async ({ names, engine, voices, port }) => {
        const fileUrls = { "engine.js": URL.createObjectURL(new Blob([engine], { type: "text/javascript" })) };
        for (const name of names) {
          const response = await fetch(`http://127.0.0.1:${port}/${name}`);
          if (!response.ok) throw new Error(`fetch ${name} -> ${response.status}`);
          fileUrls[name] = URL.createObjectURL(await response.blob());
        }
        await window.__startEngineWorker(fileUrls, { voices });
        window.__attachDispatcher();
      },
      { names: runtimeNames, engine: engineSource, voices: candidateVoices, port: 4455 },
    );
    console.error("引擎已就绪，开始扫描说话人……");

    const rows = [];
    for (let sid = 0; sid <= args.maxSid; sid += 1) {
      try {
        const stats = await page.evaluate(
          ({ voiceId, text }) => window.__synthStats(voiceId, text),
          { voiceId: `sid-${sid}`, text: SCAN_TEXT },
        );
        rows.push({ sid, ...stats });
        console.error(
          `sid=${sid} F0≈${stats.pitch}Hz 浊音占比=${stats.voicedRatio} 响度=${stats.rms} 时长=${stats.seconds}s 合成=${stats.synthMs}ms`,
        );
      } catch (error) {
        console.error(`sid=${sid} 失败：${error?.message || error}`);
      }
    }
    if (!rows.length) throw new Error("没有任何说话人合成成功");

    const byPitch = rows.filter((row) => row.pitch > 0 && row.rms >= 0.01).sort((a, b) => a.pitch - b.pitch);
    const males = byPitch.filter((row) => row.pitch < 165).slice(0, 2);
    const females = byPitch.filter((row) => row.pitch >= 165).slice(-2).reverse();
    let suggestion = [
      ...males.map((row, index) => ({ id: `male-${index + 1}`, name: `${index ? "男声二" : "男声一"} · 沉稳`, lang: "zh-CN", sid: row.sid })),
      ...females.map((row, index) => ({ id: `female-${index + 1}`, name: `${index ? "女声二" : "女声一"} · 清亮`, lang: "zh-CN", sid: row.sid })),
    ];
    if (!suggestion.length) {
      // 分类兜底：基频不可用时，从合成成功的说话人里均匀取 4 个（听感自选）。
      const usable = rows.filter((row) => row.rms >= 0.01);
      const labels = ["音色一", "音色二", "音色三", "音色四"];
      const picks = [...new Set([0, Math.floor(usable.length / 3), Math.floor((usable.length * 2) / 3), usable.length - 1])]
        .filter((index) => index >= 0 && index < usable.length)
        .slice(0, 4);
      suggestion = picks.map((index, order) => ({
        id: `voice-${order + 1}`,
        name: labels[order],
        lang: "zh-CN",
        sid: usable[index].sid,
      }));
      console.error("基频分类失败，回退为均匀选取 4 个说话人（名称为通用音色，可试听后调整 sid 重打包）");
    }
    if (!suggestion.length) throw new Error("没有可用的说话人（全部近乎无声）");
    const output = args.out || "dist/voices.json";
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(suggestion, null, 2));
    console.log(JSON.stringify({ scanned: rows.length, males, females }, null, 2));
    console.log(`建议音色已写入 ${output}（名称可再人工润色）`);
  } finally {
    await browser.close();
    server.close();
  }
}

async function commandVerify(args) {
  if (!args.pack) throw new Error("verify 需要 --pack <zip>");
  const packPath = path.resolve(args.pack);
  const packBuffer = fs.readFileSync(packPath);
  const server = await serveDir(ROOT, 4456);
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 880 } });
    page.on("pageerror", (e) => { console.error("PAGEERROR", e.message); process.exitCode = 1; });
    await page.goto("http://127.0.0.1:4456/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".reader-sentence", { timeout: 20000 });
    await page.addScriptTag({ content: DRIVER_SNIPPET });

    // 1) 引擎协议直测：解包 → 起 Worker → 逐音色合成 → 断言时长/响度。
    const direct = await page.evaluate(async ({ packBase64, text }) => {
      const binary = Uint8Array.from(atob(packBase64), (c) => c.charCodeAt(0));
      const zip = await JSZip.loadAsync(binary);
      const manifest = JSON.parse(await zip.file("istone-voice-pack.json").async("string"));
      const fileUrls = {};
      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        fileUrls[entry.name] = URL.createObjectURL(await entry.async("blob"));
      }
      await window.__startEngineWorker(fileUrls, manifest);
      window.__attachDispatcher();
      const results = [];
      for (const voice of manifest.voices) {
        const stats = await window.__synthStats(voice.id, text);
        results.push({ voice: voice.name, sid: voice.sid, ...stats });
      }
      return { label: manifest.label, results };
    }, { packBase64: packBuffer.toString("base64"), text: VERIFY_TEXT });

    for (const row of direct.results) {
      if (row.seconds < 1 || row.seconds > 30) throw new Error(`时长异常：${JSON.stringify(row)}`);
      if (row.rms < 0.01) throw new Error(`近乎无声：${JSON.stringify(row)}`);
    }
    console.log("引擎直测通过：", JSON.stringify(direct, null, 2));

    // 2) 应用实测：界面导入 zip → 选神经音色 → 自动试听成功发声。
    await page.setInputFiles("#neural-pack-input", {
      name: path.basename(packPath), mimeType: "application/zip", buffer: packBuffer,
    });
    await page.waitForFunction(
      () => (document.querySelector("#status-chip")?.textContent || "").includes("已安装"),
      null, { timeout: 120000 },
    );
    const firstNeural = await page.evaluate(() => {
      const option = [...document.querySelectorAll("#voice-select option")].find((item) => item.textContent.includes("神经语音"));
      return option ? option.value : null;
    });
    if (!firstNeural) throw new Error("导入后语音选择里没有神经音色");
    await page.selectOption("#voice-select", firstNeural);
    await page.waitForFunction(() => {
      const title = document.getElementById("speech-diagnostic-title")?.textContent || "";
      return title.includes("浏览器已开始发声") || title.includes("测试语音已结束");
    }, null, { timeout: 180000 });
    console.log("应用导入实测通过：试听已发声");
    console.log("VERIFY OK");
  } finally {
    await browser.close();
    server.close();
  }
}

(async () => {
  const args = parseArgs(process.argv);
  if (args.command === "scan") await commandScan(args);
  else if (args.command === "verify") await commandVerify(args);
  else throw new Error("用法：voice-pack-lab.cjs <scan|verify> ...");
})().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});
