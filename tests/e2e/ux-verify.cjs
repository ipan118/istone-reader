// Verifies two listening-QoL features:
//  1. Batch import: selecting multiple files imports them sequentially and
//     all land on the shelf.
//  2. Sleep-timer fade-out: inside the final minute, newly started speech
//     units get progressively lower volume, and the timer stops playback.
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

const targetUrl = process.env.TARGET_URL || "http://127.0.0.1:4173/";
const sampleTxt = path.join(__dirname, "..", "..", "sample-books", "aurora-demo.txt");
const secondTxt = path.join(__dirname, "fixtures", "batch-second.txt");

const MOCK = `(() => {
  window.__spoken = [];
  const synth = { speaking:false, pending:false, paused:false, _q:[], _cur:null, _t:[],
    getVoices(){ return [{ name:"Mock zh", lang:"zh-CN", voiceURI:"mock-zh", localService:true, default:true }]; },
    onvoiceschanged:null,
    speak(u){ this._q.push(u); this.pending=true; this._pump(); },
    _pump(){ if(this._cur||!this._q.length) return; const u=this._q.shift(); this._cur=u; this.speaking=true;
      window.__spoken.push({ text: u.text, volume: u.volume });
      this.pending=this._q.length>0; const ms=25+(u.text||"").length*30/(u.rate||1);
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

  // --- 1. Batch import (real time) ---
  {
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    page.on("pageerror", (e) => { console.error("PAGEERROR", e.message); process.exitCode = 1; });
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".reader-sentence", { timeout: 15000 });

    await page.setInputFiles("#book-file-input", [sampleTxt, secondTxt]);
    await page.waitForFunction(
      () => document.querySelector("#status-chip")?.textContent?.includes("批量导入完成，共 2 个文件"),
      null,
      { timeout: 30000 },
    );
    // Shelf refresh is asynchronous after the status flips — wait for it.
    await page.waitForFunction(
      () => document.querySelectorAll(".library-item-info strong").length >= 2,
      null,
      { timeout: 10000 },
    );
    const batch = await page.evaluate(() => ({
      title: document.querySelector("#book-title")?.textContent || "",
      shelf: [...document.querySelectorAll(".library-item-info strong")].map((n) => n.textContent),
    }));
    assert.ok(batch.title.includes("batch-second"), `reader should end on the last file, got ${batch.title}`);
    assert.equal(batch.shelf.length, 2, `shelf should hold both books, got ${JSON.stringify(batch.shelf)}`);
    assert.ok(batch.shelf.some((t) => t.includes("aurora-demo")) && batch.shelf.some((t) => t.includes("batch-second")));
    console.log("batch import OK:", JSON.stringify(batch.shelf));
    await page.close();
  }

  // --- 2. Sleep-timer fade-out (faked clock) ---
  {
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    page.on("pageerror", (e) => { console.error("PAGEERROR", e.message); process.exitCode = 1; });
    await page.clock.install();
    await page.addInitScript(MOCK);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    await page.clock.runFor(3000); // flush boot timers (voice catalog wait etc.)
    await page.waitForSelector(".reader-sentence", { timeout: 15000 });

    // Arm a 15-minute sleep timer, jump to 50 seconds before it ends.
    await page.locator("#sleep-timer-select").selectOption("15");
    await page.clock.fastForward(15 * 60_000 - 50_000);

    await page.click("#speak-button");
    await page.clock.runFor(4000); // let startSpeech + mock onstart fire
    const faded = await page.evaluate(() => window.__spoken[window.__spoken.length - 1]);
    assert.ok(faded, "an utterance should have been spoken");
    assert.ok(
      faded.volume >= 0.15 && faded.volume < 0.95,
      `volume inside the final minute must be faded, got ${faded.volume}`,
    );
    console.log(`sleep fade OK: volume=${faded.volume.toFixed(2)} within the last minute`);

    // Cross the deadline: the timer must stop playback.
    await page.clock.fastForward(70_000);
    await page.clock.runFor(500);
    const stopped = await page.evaluate(() => ({
      hint: document.querySelector("#speech-state-hint")?.textContent || "",
      icon: document.getElementById("mini-play")?.textContent,
    }));
    assert.ok(stopped.hint.includes("定时关闭"), `sleep timer should stop playback, hint: ${stopped.hint}`);
    assert.equal(stopped.icon, "▶", "player must show stopped state after the sleep timer fires");
    console.log("sleep stop OK:", stopped.hint);
    await page.close();
  }

  await browser.close();
  console.log("UX verification passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
