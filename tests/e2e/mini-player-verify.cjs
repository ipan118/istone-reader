// Mini player + update toast verification (mock speech engine so playback runs).
const { chromium } = require("playwright");
const MOCK = `(() => {
  const synth = { speaking:false, pending:false, paused:false, _q:[], _cur:null, _t:[],
    getVoices(){ return [{ name:"Mock zh", lang:"zh-CN", voiceURI:"mock-zh", localService:true, default:true }]; },
    onvoiceschanged:null,
    speak(u){ this._q.push(u); this.pending=true; this._pump(); },
    _pump(){ if(this._cur||!this._q.length) return; const u=this._q.shift(); this._cur=u; this.speaking=true;
      (window.__spoken = window.__spoken || []).push({ text: u.text, voice: u.voice && u.voice.name });
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
  await page.click("#mini-play"); // resume
  await page.waitForFunction(() => document.getElementById("mini-play").textContent === "⏸", null, { timeout: 10000 });
  await page.click("#stop-button");
  await page.waitForFunction(() => document.getElementById("mini-play").textContent === "▶", null, { timeout: 5000 });
  console.log("play/pause/resume/stop icon OK");

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
