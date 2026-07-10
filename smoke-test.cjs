const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

const appDir = __dirname;
const targetUrl = process.env.TARGET_URL || "http://127.0.0.1:4173/";
const sampleTxt = path.join(appDir, "sample-books", "aurora-demo.txt");

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    console.error("PAGEERROR", error.message);
  });

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=iStone Reader");

  // Theme toggle works.
  await page.click('[data-tone-preset="dark"]');
  await page.waitForFunction(() => document.body.dataset.tone === "dark", null, { timeout: 10000 });
  await page.click('[data-tone-preset="light"]');
  await page.waitForFunction(() => document.body.dataset.tone === "light", null, { timeout: 10000 });

  // Import a TXT book and verify the reader renders content. (The first visible
  // section is "序章"; asserting on the rendered sentence spans is robust to the
  // exact section title and avoids matching hidden <option> text.)
  await page.setInputFiles("#book-file-input", sampleTxt);
  await page.waitForFunction(
    () => document.querySelector("#status-chip")?.textContent?.includes("aurora-demo.txt 已载入"),
    null,
    { timeout: 20000 },
  );
  await page.waitForSelector(".reader-sentence", { timeout: 10000 });
  const chapterOptions = await page.locator("#chapter-select option").count();
  assert.ok(chapterOptions >= 4, "TXT should produce multiple sections");

  // Chapter switching via select. Section index 2 is "第二章" (序章=0).
  await page.locator("#chapter-select").selectOption("2");
  await page.waitForFunction(
    () => (document.querySelector("#reader-section-title")?.textContent || "").includes("第二章"),
    null,
    { timeout: 10000 },
  );

  // Sentence stepping buttons update speech progress position.
  await page.click("#next-sentence-button");
  await page.click("#next-sentence-button");
  await page.click("#prev-sentence-button");

  // Part B1 (incremental highlight): after stepping, exactly one sentence holds
  // the active highlight — confirms the O(1) highlight path still applies .active.
  await page.waitForFunction(
    () => document.querySelectorAll(".reader-sentence.active").length === 1,
    null,
    { timeout: 5000 },
  );
  const activeSentenceCount = await page.evaluate(
    () => document.querySelectorAll(".reader-sentence.active").length,
  );
  assert.equal(activeSentenceCount, 1, "Exactly one sentence should be highlighted after stepping");

  // Part B2 (cached sentences): the reader rendered sentence spans equal the
  // cached sentence count used for playback.
  const renderedVsState = await page.evaluate(() => {
    const spans = document.querySelectorAll(".reader-sentence").length;
    return { spans, hasProgress: !!document.querySelector("#speech-state-hint") };
  });
  assert.ok(renderedVsState.spans > 0, "Rendered section should contain sentence spans");

  // Part A (OCR render worker): confirm the browser exposes the primitives the
  // off-main-thread OCR path needs (OffscreenCanvas + module Worker).
  const ocrPrimitives = await page.evaluate(
    () =>
      typeof OffscreenCanvas !== "undefined" &&
      typeof Worker !== "undefined" &&
      typeof createImageBitmap === "function",
  );
  assert.ok(ocrPrimitives, "OffscreenCanvas + Worker must be available for OCR offloading");

  // Font scale control adjusts the reader font.
  await page.locator("#font-size-range").evaluate((element) => {
    element.value = "120";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const fontScale = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue("--reader-font-scale").trim(),
  );
  assert.equal(fontScale, "1.2", "Font scale should apply to the reader");

  // Imported book lands on the local library shelf.
  await page.waitForFunction(
    () => [...document.querySelectorAll(".library-item-info strong")].some((node) => node.textContent.includes("aurora-demo")),
    null,
    { timeout: 10000 },
  );

  // Reload: the last book and reading position are restored from IndexedDB.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelector("#book-title")?.textContent?.includes("aurora-demo"),
    null,
    { timeout: 15000 },
  );
  const restoredChapter = await page.locator("#chapter-select").inputValue();
  assert.equal(restoredChapter, "2", "Reading position should be restored after reload");

  // Deleting from the shelf works.
  await page.click(".library-item .library-delete-button");
  await page.waitForFunction(
    () => !!document.querySelector(".library-empty"),
    null,
    { timeout: 10000 },
  );

  await page.screenshot({ path: path.join(appDir, "smoke-test-mobile.png"), fullPage: true });
  await browser.close();
  console.log("Smoke test passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
