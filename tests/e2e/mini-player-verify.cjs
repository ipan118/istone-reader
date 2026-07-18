// Mini player + update toast verification (mock speech engine so playback runs).
const { chromium } = require("playwright");
const MOCK = `(() => {
  const synth = { speaking:false, pending:false, paused:false, _q:[], _cur:null, _t:[],
    getVoices(){ return [
      { name:"Mock zh", lang:"zh-CN", voiceURI:"mock-zh", localService:true, default:true },
      { name:"Mock zh backup", lang:"zh-CN", voiceURI:"mock-zh-2", localService:true, default:false },
      { name:"Mock net cloud", lang:"zh-CN", voiceURI:"mock-net", localService:false, default:false },
    ]; },
    onvoiceschanged:null,
    speak(u){ this._q.push(u); this.pending=true; this._pump(); },
    _pump(){ if(this._cur||!this._q.length) return; const u=this._q.shift(); this._cur=u; this.speaking=true;
      (window.__spoken = window.__spoken || []).push({ text: u.text, voice: u.voice && u.voice.name, pitch: u.pitch, rate: u.rate });
      this.pending=this._q.length>0; const ms=25+(u.text||"").length*(30/(u.rate||1));
      this._t.push(setTimeout(()=>{ u.onstart&&u.onstart({charIndex:0});
        this._t.push(setTimeout(()=>{ if(this._cur!==u) return; this._cur=null; this.speaking=this._q.length>0; u.onend&&u.onend({}); this._pump(); }, ms)); },15)); },
    cancel(){ this._t.forEach(clearTimeout); this._t=[]; this._q=[]; this._cur=null; this.speaking=false; this.pending=false; },
    pause(){ this.paused=true; }, resume(){ this.paused=false; } };
  Object.defineProperty(window,"speechSynthesis",{ value:synth, configurable:true });
  window.SpeechSynthesisUtterance = function(t){ this.text=t||""; this.voice=null; this.rate=1; this.pitch=1; this.volume=1; this.lang="";
    this.onstart=null; this.onend=null; this.onerror=null; this.onboundary=null; };
})();`;

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 400, height: 880 } });
  await page.addInitScript(MOCK);
  page.on("pageerror", (e) => { console.error("PAGEERROR", e.message); process.exitCode = 1; });
  await page.goto(process.env.TARGET_URL || "http://127.0.0.1:4173/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".reader-sentence", { timeout: 15000 });

  const info = await page.evaluate(() => ({
    hidden: document.getElementById("mini-player").hidden,
    title: document.getElementById("mini-title").textContent,
    progress: document.getElementById("mini-progress").textContent,
    icon: document.getElementById("mini-play").textContent,
    bodyPad: document.body.classList.contains("has-mini-player"),
    toastHidden: document.getElementById("update-toast").hidden,
  }));
  if (info.hidden || !info.progress.includes("章") || info.icon !== "▶" || !info.bodyPad || !info.toastHidden)
    throw new Error("bad init: " + JSON.stringify(info));
  console.log("init OK:", JSON.stringify(info));

  // Step sentences from the bar (chapter 1 has 3 sentences).
  await page.locator("#chapter-select").selectOption("1");
  await page.waitForTimeout(250);
  await page.click("#mini-next");
  await page.click("#mini-next");
  const idx2 = await page.evaluate(() => Number(document.querySelector(".reader-sentence.active")?.dataset.sentenceIndex));
  if (idx2 !== 2) throw new Error("mini-next x2 -> " + idx2);
  await page.click("#mini-prev");
  const prog = await page.evaluate(() => document.getElementById("mini-progress").textContent);
  if (!prog.includes("句 2/")) throw new Error("progress: " + prog);
  console.log("stepping OK:", prog);

  // Play/pause/stop toggle the icon through the real playback lifecycle.
  await page.click("#mini-play");
  await page.waitForFunction(() => document.getElementById("mini-play").textContent === "⏸", null, { timeout: 10000 });
  await page.click("#mini-play"); // pause via the same button
  await page.waitForFunction(() => document.getElementById("mini-play").textContent === "▶", null, { timeout: 5000 });
  // Pause is cancel-based (engine-native resume() locks up on Android): the
  // synth must actually be cancelled, not engine-paused.
  const pausedEngine = await page.evaluate(() => ({
    speaking: window.speechSynthesis.speaking,
    spoken: window.__spoken.length,
  }));
  if (pausedEngine.speaking) throw new Error("pause must cancel the engine, not engine-pause it");
  await page.click("#mini-play"); // resume restarts from the tracked sentence
  await page.waitForFunction(() => document.getElementById("mini-play").textContent === "⏸", null, { timeout: 10000 });
  const resumedEngine = await page.evaluate(() => window.__spoken.length);
  if (resumedEngine <= pausedEngine.spoken) throw new Error("resume must speak a fresh utterance");
  await page.click("#stop-button");
  await page.waitForFunction(() => document.getElementById("mini-play").textContent === "▶", null, { timeout: 5000 });
  console.log("play/pause(cancel-based)/resume/stop OK");

  // Local-voice policy: network voices (localService === false) must never
  // reach the catalog — reading stays fully on-device.
  const voiceOptions = await page.evaluate(() =>
    [...document.querySelectorAll("#voice-select option")].map((option) => option.textContent),
  );
  if (voiceOptions.some((text) => text.includes("Mock net cloud")))
    throw new Error("network voice leaked into the catalog: " + JSON.stringify(voiceOptions));
  if (!voiceOptions.some((text) => text.includes("Mock zh")))
    throw new Error("local voices missing from the catalog: " + JSON.stringify(voiceOptions));
  console.log("local-only voice catalog OK:", JSON.stringify(voiceOptions));

  // Idle voice auto-preview: changing the voice while stopped speaks a short
  // sample in the chosen voice without flipping the player into playing state.
  const spokenBefore = await page.evaluate(() => (window.__spoken || []).length);
  await page.evaluate(() => {
    const select = document.querySelector("#voice-select");
    const other = [...select.options].find((option) => option.value && option.value !== select.value);
    select.value = other.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForFunction((n) => (window.__spoken || []).length > n, spokenBefore, { timeout: 10000 });
  const preview = await page.evaluate(() => ({
    last: window.__spoken[window.__spoken.length - 1],
    icon: document.getElementById("mini-play").textContent,
  }));
  if (!/iStone Reader/.test(preview.last.text)) throw new Error("preview sample text: " + preview.last.text);
  if (preview.icon !== "▶") throw new Error("preview must not flip the player into playing state");
  console.log("voice auto-preview OK:", JSON.stringify(preview.last));

  // Voice style: switching to 低沉 previews immediately with the derived
  // pitch (0.7) and persists; the default 标准 keeps natural pitch 1.
  const styleBefore = await page.evaluate(() => window.__spoken.length);
  await page.selectOption("#voice-style-select", "deep");
  await page.waitForFunction((n) => (window.__spoken || []).length > n, styleBefore, { timeout: 10000 });
  const styleSample = await page.evaluate(() => ({
    last: window.__spoken[window.__spoken.length - 1],
    saved: JSON.parse(localStorage.getItem("vivid-reader-settings-v2") || "{}").voiceStyle,
    icon: document.getElementById("mini-play").textContent,
  }));
  if (Math.abs(styleSample.last.pitch - 0.7) > 0.001) throw new Error("deep style pitch: " + JSON.stringify(styleSample.last));
  if (styleSample.saved !== "deep") throw new Error("voice style must persist, got " + styleSample.saved);
  if (styleSample.icon !== "▶") throw new Error("style preview must not flip the player into playing state");
  await page.selectOption("#voice-style-select", "standard");
  await page.waitForTimeout(400);
  const standardPitch = await page.evaluate(() => window.__spoken[window.__spoken.length - 1].pitch);
  if (standardPitch !== 1) throw new Error("standard style must keep pitch 1, got " + standardPitch);
  console.log("voice style presets OK:", JSON.stringify(styleSample.last));

  // Tap-to-read: while playing, tapping a sentence continues from it.
  await page.click("#mini-play");
  await page.waitForFunction(() => document.getElementById("mini-play").textContent === "⏸", null, { timeout: 10000 });
  const beforeTap = await page.evaluate(() => (window.__spoken || []).length);
  await page.click('.reader-sentence[data-sentence-index="2"]');
  await page.waitForFunction((n) => (window.__spoken || []).length > n, beforeTap, { timeout: 10000 });
  const tap = await page.evaluate(() => {
    const target = document.querySelector('.reader-sentence[data-sentence-index="2"]').textContent;
    const last = window.__spoken[window.__spoken.length - 1].text;
    return {
      match: last.includes(target.slice(0, 6)),
      hint: document.getElementById("speech-state-hint").textContent,
      artwork: navigator.mediaSession?.metadata?.artwork?.length || 0,
    };
  });
  if (!tap.match) throw new Error("tap-to-read must resume from the tapped sentence");
  // The tap hint is transient: the resumed utterance's onstart may already
  // have replaced it with the live 正在朗读 line — both prove the jump worked.
  if (!tap.hint.includes("已从所点的句子继续朗读") && !tap.hint.includes("正在朗读")) {
    throw new Error("tap hint: " + tap.hint);
  }
  if (tap.artwork < 2) throw new Error("media session artwork missing: " + tap.artwork);
  console.log("tap-to-read (playing) + artwork OK");
  await page.click("#stop-button");
  await page.waitForFunction(() => document.getElementById("mini-play").textContent === "▶", null, { timeout: 5000 });

  // Idle tap only positions the highlight, no speech starts.
  const idleBefore = await page.evaluate(() => window.__spoken.length);
  await page.click('.reader-sentence[data-sentence-index="0"]');
  await page.waitForTimeout(400);
  const idle = await page.evaluate(() => ({
    count: window.__spoken.length,
    active: document.querySelector(".reader-sentence.active")?.dataset.sentenceIndex,
    hint: document.getElementById("speech-state-hint").textContent,
  }));
  if (idle.count !== idleBefore) throw new Error("idle tap must not start speech");
  if (idle.active !== "0") throw new Error("idle tap must move the highlight, got " + idle.active);
  if (!idle.hint.includes("已定位到该句")) throw new Error("idle hint: " + idle.hint);
  console.log("tap-to-read (idle) OK");

  // Keep-awake toggle: default on, persisted when switched off.
  const awakeDefault = await page.evaluate(() => document.getElementById("keep-awake-toggle").checked);
  if (!awakeDefault) throw new Error("keep-awake must default to on");
  await page.click("#keep-awake-toggle");
  const awakeSaved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("vivid-reader-settings-v2") || "{}").keepScreenOn,
  );
  if (awakeSaved !== false) throw new Error("keep-awake off must persist, got " + awakeSaved);
  console.log("keep-awake toggle OK");

  // Chapter stepping from the bar (idle: position moves, no speech starts).
  await page.click("#mini-next-chapter");
  const chapAfter = await page.evaluate(() => document.getElementById("mini-progress").textContent);
  if (!chapAfter.includes("第 3/5 章")) throw new Error("mini-next-chapter: " + chapAfter);
  await page.click("#mini-prev-chapter");
  const chapBack = await page.evaluate(() => document.getElementById("mini-progress").textContent);
  if (!chapBack.includes("第 2/5 章")) throw new Error("mini-prev-chapter: " + chapBack);
  console.log("chapter stepping OK");

  // Info tap scrolls back to the active sentence.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.click("#mini-info");
  await page.waitForFunction(() => {
    const r = document.querySelector(".reader-sentence.active")?.getBoundingClientRect();
    return r && r.top > 0 && r.bottom < window.innerHeight;
  }, null, { timeout: 6000 });
  console.log("jump-back OK");

  const noPan = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
  if (!noPan) throw new Error("mini player widened the page");
  const badge = await page.evaluate(() => document.querySelector(".brand-badge").textContent);
  if (!/^iStone Reader v\d+$/.test(badge)) throw new Error("badge: " + badge);
  console.log("badge OK:", badge);
  await browser.close();
  console.log("Mini player verification passed");
})().catch((e) => { console.error(e); process.exit(1); });
