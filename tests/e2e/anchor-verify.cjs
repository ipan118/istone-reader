// Verifies the lock-screen media anchor: clicking 朗读 starts a looping,
// near-silent <audio> element inside the user gesture; stop pauses it.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const targetUrl = process.env.TARGET_URL || "http://127.0.0.1:4173/";

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  page.on("pageerror", (error) => console.error("PAGEERROR", error.message));

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=iStone Reader");
  // Demo book auto-loads; wait for rendered sentences.
  await page.waitForSelector(".reader-sentence", { timeout: 15000 });

  // Before speaking: no anchor element yet.
  assert.equal(await page.locator("#media-anchor-audio").count(), 0, "anchor must not exist before speaking");

  await page.click("#speak-button");
  // The anchor is unlocked synchronously inside the click gesture, before the
  // (up to 1.8 s) voice wait — check quickly, before any headless TTS error.
  const anchorState = await page.evaluate(() => {
    const audio = document.getElementById("media-anchor-audio");
    if (!audio) return null;
    return { paused: audio.paused, loop: audio.loop, volume: audio.volume, duration: audio.duration };
  });
  assert.ok(anchorState, "anchor element should exist after clicking speak");
  assert.equal(anchorState.paused, false, "anchor should be playing during speech");
  assert.equal(anchorState.loop, true, "anchor should loop");
  assert.ok(anchorState.volume <= 0.1, `anchor volume should be near-silent, got ${anchorState.volume}`);

  // Media session should be marked as playing while the engine runs.
  // (Headless has no TTS voices, so speech itself may fail later — the anchor
  // and playbackState wiring is what we verify here.)
  const playbackState = await page.evaluate(() => navigator.mediaSession?.playbackState || "unsupported");
  console.log(`playbackState after speak: ${playbackState}`);

  await page.click("#stop-button");
  await page.waitForFunction(() => document.getElementById("media-anchor-audio")?.paused === true, null, {
    timeout: 5000,
  });
  const stoppedState = await page.evaluate(() => ({
    paused: document.getElementById("media-anchor-audio").paused,
    playbackState: navigator.mediaSession?.playbackState || "unsupported",
  }));
  assert.equal(stoppedState.paused, true, "anchor must pause on stop");
  console.log(`after stop: ${JSON.stringify(stoppedState)}`);

  // Speak again: the same element is reused and resumes.
  await page.click("#speak-button");
  const resumed = await page.evaluate(() => ({
    count: document.querySelectorAll("#media-anchor-audio").length,
    paused: document.getElementById("media-anchor-audio").paused,
  }));
  assert.equal(resumed.count, 1, "anchor element must be reused, not duplicated");
  assert.equal(resumed.paused, false, "anchor should resume on second speak");

  await browser.close();
  console.log("Media anchor verification passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
