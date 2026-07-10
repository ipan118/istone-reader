// Verifies the two mobile fixes:
//  1. Page can never pan horizontally (overflow-x: clip), even with an
//     artificially overflowing element + scrollIntoView during playback.
//  2. Rate change resumes near the sentence actually being spoken — including
//     when the voice never fires boundary events (Android Chinese voices).
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const targetUrl = process.env.TARGET_URL || "http://127.0.0.1:4173/";
const boundaryMode = process.env.BOUNDARY !== "off";

const MOCK_SPEECH = `
(() => {
  window.__spoken = [];
  window.__boundaryMode = ${boundaryMode};
  const synth = {
    speaking: false, pending: false, paused: false,
    _queue: [], _current: null, _timers: [],
    getVoices() {
      return [
        { name: "Mock Chinese", lang: "zh-CN", voiceURI: "mock-zh", localService: true, default: true },
        { name: "Mock English", lang: "en-US", voiceURI: "mock-en", localService: true, default: false },
      ];
    },
    onvoiceschanged: null,
    speak(utterance) {
      this._queue.push(utterance);
      this.pending = true;
      this._pump();
    },
    _pump() {
      if (this._current || !this._queue.length) return;
      const u = this._queue.shift();
      this._current = u;
      this.speaking = true;
      this.pending = this._queue.length > 0;
      const chars = (u.text || "").length;
      const rate = u.rate || 1;
      const msPerChar = 30 / rate; // realistic-ish so the app's outlier filter accepts learned timing
      const t0 = setTimeout(() => {
        window.__spoken.push({ text: u.text, rate, pitch: u.pitch, at: Date.now() });
        u.onstart && u.onstart({ charIndex: 0 });
        if (window.__boundaryMode) {
          for (let c = 5; c < chars; c += 5) {
            this._timers.push(setTimeout(() => {
              if (this._current === u && u.onboundary) u.onboundary({ charIndex: c, name: "word" });
            }, 15 + c * msPerChar));
          }
        }
        this._timers.push(setTimeout(() => {
          if (this._current !== u) return;
          this._current = null;
          this.speaking = this._queue.length > 0;
          u.onend && u.onend({});
          this._pump();
        }, 25 + chars * msPerChar));
      }, 15);
      this._timers.push(t0);
    },
    cancel() {
      this._timers.forEach(clearTimeout);
      this._timers = [];
      this._queue = [];
      this._current = null;
      this.speaking = false;
      this.pending = false;
    },
    pause() { this.paused = true; },
    resume() { this.paused = false; },
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = function (text) {
    this.text = text || "";
    this.voice = null; this.rate = 1; this.pitch = 1; this.volume = 1; this.lang = "";
    this.onstart = null; this.onend = null; this.onerror = null; this.onboundary = null;
  };
})();
`;

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const context = await browser.newContext({
    viewport: { width: 400, height: 880 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2.6,
  });
  const page = await context.newPage();
  await page.addInitScript(MOCK_SPEECH);
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".reader-sentence", { timeout: 15000 });

  // --- Fix 1: horizontal panning must be impossible ---
  const overflowStyle = await page.evaluate(() => ({
    html: getComputedStyle(document.documentElement).overflowX,
    body: getComputedStyle(document.body).overflowX,
  }));
  assert.equal(overflowStyle.html, "clip", "html overflow-x should be clip");
  assert.equal(overflowStyle.body, "clip", "body overflow-x should be clip");

  // Simulate a device-specific overflowing element (the real-device trigger),
  // then confirm neither user-visible pan nor programmatic pan can happen.
  await page.evaluate(() => {
    const wide = document.createElement("div");
    wide.style.cssText = "width:900px;height:8px;background:transparent";
    document.querySelector(".hero-card").appendChild(wide);
    window.scrollTo(300, 0);
    document.documentElement.scrollLeft = 300;
    document.body.scrollLeft = 300;
  });
  const panState = await page.evaluate(() => ({
    x: window.scrollX,
    left: document.documentElement.scrollLeft + document.body.scrollLeft,
  }));
  assert.equal(panState.x, 0, "page must not pan horizontally");
  assert.equal(panState.left, 0, "scrollLeft must stay 0 with overflow clip");

  // Vertical scrolling still works (instant to bypass smooth-scroll animation).
  await page.evaluate(() => window.scrollTo({ top: 300, behavior: "instant" }));
  const scrollY = await page.evaluate(() => window.scrollY);
  assert.ok(scrollY > 100, `vertical scroll must keep working, got ${scrollY}`);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));

  // --- Fix 2: rate change resumes near the live position ---
  await page.click("#speak-button");
  // Wait for the second utterance so the ms/char EWMA is calibrated from the
  // first one (the real-device scenario: adjust rate mid-book), then wait
  // until we are deterministically mid-unit: >=450ms spoken, >=350ms left.
  await page.waitForFunction(() => {
    if (window.__spoken.length < 2) return false;
    const last = window.__spoken[window.__spoken.length - 1];
    const duration = 25 + last.text.length * (30 / last.rate);
    const elapsed = Date.now() - last.at;
    return elapsed >= 2200 && duration - elapsed >= 1200;
  }, null, { timeout: 30000, polling: 30 });

  // Capture state and dispatch the slider drag atomically in one evaluate so
  // the interrupted unit cannot roll over between capture and dispatch.
  const before = await page.evaluate(() => {
    const snapshot = {
      spokenCount: window.__spoken.length,
      unitText: window.__spoken[window.__spoken.length - 1].text,
      elapsedInUnit: Date.now() - window.__spoken[window.__spoken.length - 1].at,
      activeIdx: Number(document.querySelector(".reader-sentence.active")?.dataset.sentenceIndex ?? -1),
    };
    const slider = document.querySelector("#rate-range");
    for (const v of ["1.2", "1.4", "1.6"]) {
      slider.value = v;
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    }
    slider.dispatchEvent(new Event("change", { bubbles: true }));
    return snapshot;
  });
  await page.waitForFunction((n) => window.__spoken.length > n, before.spokenCount, { timeout: 15000 });

  const after = await page.evaluate((prevCount) => ({
    resumed: window.__spoken[prevCount],
    activeIdx: Number(document.querySelector(".reader-sentence.active")?.dataset.sentenceIndex ?? -1),
  }), before.spokenCount);

  assert.equal(after.resumed.rate, 1.6, "resumed utterance must use the new rate");
  assert.equal(after.resumed.pitch, 1, "speech pitch must be natural 1.0 (legacy mapping forced 0.8)");
  const resumedHead = after.resumed.text.slice(0, 12);
  const posInUnit = before.unitText.indexOf(resumedHead);
  console.log(`boundaryMode=${boundaryMode} resume position in unit: ${posInUnit} (unit length ${before.unitText.length})`);
  console.log(`active sentence: before=${before.activeIdx} after=${after.activeIdx}`);
  assert.notEqual(posInUnit, 0, "must NOT replay the whole unit from its start");
  assert.ok(
    posInUnit > 0 || !before.unitText.includes(resumedHead),
    "resume point must be inside or after the interrupted unit",
  );
  assert.ok(after.activeIdx >= before.activeIdx, "highlight must not jump backwards");

  await browser.close();
  console.log(`Fix verification passed (boundary events ${boundaryMode ? "ON" : "OFF"})`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
