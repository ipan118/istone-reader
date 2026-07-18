// Neural voice pack verification: import a real (sine-engine) pack zip, see
// its voices in the catalog, and drive actual audio playback through the
// reader — synthesize -> WAV -> <audio> -> sentence chaining -> pause/resume.
// Runs WITHOUT a speechSynthesis mock: a device exposing zero system voices
// (the scenario that motivated the feature) must still get working voices.
const { chromium } = require("playwright");

const ENGINE_JS = `
onmessage = (event) => {
  const message = event.data || {};
  if (message.type === "init") {
    if (!message.files || !message.manifest) { postMessage({ type: "error", message: "missing init payload" }); return; }
    postMessage({ type: "ready" });
    return;
  }
  if (message.type === "synthesize") {
    const sampleRate = 16000;
    // Realistic pacing: ~50ms per character (real neural TTS speaks seconds
    // per sentence), so pause clicks land inside a clip, not between clips.
    const seconds = Math.min(3, Math.max(0.6, (message.text || "").length * 0.05));
    const length = Math.floor(sampleRate * seconds);
    const samples = new Float32Array(length);
    for (let i = 0; i < length; i += 1) {
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.2;
    }
    postMessage({ type: "audio", id: message.id, sampleRate, samples }, [samples.buffer]);
  }
};
`;

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"],
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 400, height: 880 } });
  page.on("pageerror", (e) => { console.error("PAGEERROR", e.message); process.exitCode = 1; });
  await page.goto(process.env.TARGET_URL || "http://127.0.0.1:4173/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".reader-sentence", { timeout: 15000 });

  // Build the pack zip inside the page (the app already ships JSZip).
  const zipBase64 = await page.evaluate(async (engineSource) => {
    const zip = new JSZip();
    zip.file("istone-voice-pack.json", JSON.stringify({
      format: "istone-voice-pack",
      version: 1,
      id: "test-sine",
      label: "测试语音包",
      engine: "worker-js",
      entry: "engine.js",
      voices: [
        { id: "male", name: "测试男声", lang: "zh-CN" },
        { id: "female", name: "测试女声", lang: "zh-CN" },
      ],
    }));
    zip.file("engine.js", engineSource);
    zip.file("model.bin", new Uint8Array([1, 2, 3, 4]));
    const blob = await zip.generateAsync({ type: "base64" });
    return blob;
  }, ENGINE_JS);

  await page.setInputFiles("#neural-pack-input", {
    name: "test-sine.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipBase64, "base64"),
  });
  await page.waitForFunction(
    () => (document.querySelector("#status-chip")?.textContent || "").includes("已安装"),
    null,
    { timeout: 15000 },
  );

  // Catalog: both pack voices listed and tagged, even with 0 system voices.
  const options = await page.evaluate(() =>
    [...document.querySelectorAll("#voice-select option")].map((option) => ({ value: option.value, text: option.textContent })),
  );
  const male = options.find((option) => option.text.includes("测试男声"));
  const female = options.find((option) => option.text.includes("测试女声"));
  if (!male || !female) throw new Error("pack voices missing from catalog: " + JSON.stringify(options));
  if (!male.text.includes("神经语音")) throw new Error("neural tag missing: " + male.text);
  if (!male.value.startsWith("istone-neural:test-sine:")) throw new Error("neural voiceURI: " + male.value);
  console.log("pack voices in catalog OK:", male.text, "/", female.text);

  // Selecting the neural voice must auto-preview through real audio.
  await page.selectOption("#voice-select", male.value);
  await page.waitForFunction(
    () => {
      const title = document.getElementById("speech-diagnostic-title")?.textContent || "";
      return title.includes("浏览器已开始发声") || title.includes("测试语音已结束");
    },
    null,
    { timeout: 15000 },
  );
  console.log("neural auto-preview OK");

  // Full playback: per-sentence synthesized audio must chain across sentences
  // AND section boundaries — reaching chapter 2 proves both.
  await page.click("#speak-button");
  const chainedHandle = await page.waitForFunction(() => {
    const progress = document.getElementById("mini-progress").textContent;
    if (!progress.includes("第 2/5 章")) {
      return null;
    }
    return {
      icon: document.getElementById("mini-play").textContent,
      engineIdle: !window.speechSynthesis || (!window.speechSynthesis.speaking && !window.speechSynthesis.pending),
    };
  }, null, { timeout: 30000 });
  const playing = await chainedHandle.jsonValue();
  if (playing.icon !== "⏸") throw new Error("mini play icon during neural playback: " + playing.icon);
  if (!playing.engineIdle) throw new Error("neural playback must not touch speechSynthesis");
  console.log("neural playback chains sentences + sections OK (audio path only)");

  // Pause = real audio pause; resume continues from the same position.
  await page.click("#pause-button");
  await page.waitForFunction(() => document.getElementById("mini-play").textContent === "▶", null, { timeout: 5000 });
  const pausedProgress = await page.evaluate(() => document.getElementById("mini-progress").textContent);
  await page.click("#pause-button");
  await page.waitForFunction(() => document.getElementById("mini-play").textContent === "⏸", null, { timeout: 10000 });
  await page.waitForFunction(
    (previous) => document.getElementById("mini-progress").textContent !== previous,
    pausedProgress,
    { timeout: 20000 },
  );
  console.log("neural pause/resume OK");
  await page.click("#stop-button");
  await page.waitForFunction(() => document.getElementById("mini-play").textContent === "▶", null, { timeout: 5000 });

  // Pack survives reload (IndexedDB) and the voice selection is restored.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".reader-sentence", { timeout: 15000 });
  await page.waitForFunction(
    () => [...document.querySelectorAll("#voice-select option")].some((option) => option.textContent.includes("测试男声")),
    null,
    { timeout: 15000 },
  );
  const restored = await page.evaluate(() => document.getElementById("voice-select").value);
  if (!restored.startsWith("istone-neural:test-sine:")) throw new Error("neural selection not restored: " + restored);
  console.log("pack + selection survive reload OK");

  // Delete removes the pack and its voices.
  await page.click(".neural-pack-item [data-delete-pack]");
  await page.waitForFunction(
    () => ![...document.querySelectorAll("#voice-select option")].some((option) => option.textContent.includes("测试男声")),
    null,
    { timeout: 15000 },
  );
  console.log("pack delete OK");

  await browser.close();
  console.log("Neural voice pack verification passed");
})().catch((e) => { console.error(e); process.exit(1); });
