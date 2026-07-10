// Verifies P1-1: progressive PDF import + per-page OCR cache resume.
//
// Test A (progressive): a 60-page text PDF publishes the first pages early
// (subtitle shows "后续章节解析中"), appends the rest in the background,
// finishes with "已全部解析完成", and survives a reload with all sections.
//
// Test B (OCR cache): a 2-page image-only PDF runs real Tesseract OCR on first
// import and stores per-page results; re-importing the same file hits the
// cache (subtitle shows "沿用上次识别缓存") and is dramatically faster.
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

const targetUrl = process.env.TARGET_URL || "http://127.0.0.1:4173/";
const textPdf = path.join(__dirname, "fixtures", "progressive-test.pdf");
const scanPdf = path.join(__dirname, "fixtures", "scan-test.pdf");

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error("PAGEERROR", error.message));

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=iStone Reader");

  // --- Test A: progressive import of a 60-page text PDF ---
  await page.evaluate(() => {
    window.__subtitleLog = [];
    const target = document.querySelector("#book-subtitle");
    new MutationObserver(() => window.__subtitleLog.push(target.textContent)).observe(target, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    window.__chapterCounts = [];
    const counter = document.querySelector("#chapter-count");
    new MutationObserver(() => window.__chapterCounts.push(Number(counter.textContent))).observe(counter, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });

  await page.setInputFiles("#book-file-input", textPdf);
  await page.waitForFunction(
    () => document.querySelector("#status-chip")?.textContent?.includes("已全部解析完成"),
    null,
    { timeout: 120000 },
  );

  const progressive = await page.evaluate(() => ({
    subtitles: window.__subtitleLog,
    chapterCounts: window.__chapterCounts,
    finalSubtitle: document.querySelector("#book-subtitle")?.textContent || "",
    chapterCount: Number(document.querySelector("#chapter-count")?.textContent || 0),
    optionCount: document.querySelectorAll("#chapter-select option").length,
    selectedChapter: document.querySelector("#chapter-select")?.value,
    title: document.querySelector("#book-title")?.textContent || "",
  }));

  assert.ok(
    progressive.subtitles.some((text) => text.includes("后续章节解析中")),
    `subtitle never showed progressive state: ${JSON.stringify(progressive.subtitles)}`,
  );
  assert.ok(
    progressive.finalSubtitle.includes("PDF 共 60 页"),
    `final subtitle should mention 60 pages: ${progressive.finalSubtitle}`,
  );
  const grewOverTime = progressive.chapterCounts.some(
    (count, index) => index > 0 && count > progressive.chapterCounts[index - 1],
  );
  assert.ok(grewOverTime, `chapter count never grew during import: ${JSON.stringify(progressive.chapterCounts)}`);
  assert.ok(progressive.chapterCount >= 8, `expected many chapters, got ${progressive.chapterCount}`);
  assert.equal(progressive.optionCount, progressive.chapterCount, "chapter select should match chapter count");
  assert.equal(progressive.selectedChapter, "0", "appends must not move the current chapter selection");
  console.log(
    `Test A passed: ${progressive.chapterCount} chapters, growth ${JSON.stringify(progressive.chapterCounts.slice(0, 6))}...`,
  );

  // Reload: the fully appended book must be restored from the shelf.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => (document.querySelector("#book-title")?.textContent || "").includes("progressive-test"),
    null,
    { timeout: 20000 },
  );
  const restoredCount = await page.evaluate(() => Number(document.querySelector("#chapter-count")?.textContent || 0));
  assert.equal(restoredCount, progressive.chapterCount, "restored book must contain all appended sections");
  console.log("Test A reload passed: all sections persisted");

  // --- Test B: OCR per-page cache resume on a scanned (image-only) PDF ---
  const firstStart = Date.now();
  await page.setInputFiles("#book-file-input", scanPdf);
  await page.waitForFunction(
    () => document.querySelector("#status-chip")?.textContent?.includes("scan-test.pdf 已载入"),
    null,
    { timeout: 300000 },
  );
  const firstDuration = Date.now() - firstStart;
  const firstSubtitle = await page.evaluate(() => document.querySelector("#book-subtitle")?.textContent || "");
  assert.ok(firstSubtitle.includes("扫描识别"), `first import should have used OCR: ${firstSubtitle}`);
  assert.ok(!firstSubtitle.includes("沿用上次识别缓存"), "first import must not be served from cache");

  const cacheEntries = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("istone-reader-library");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("ocrPages", "readonly");
          const req = tx.objectStore("ocrPages").getAll();
          req.onsuccess = () => resolve(req.result.map((r) => ({ page: r.pageNumber, chars: r.text.length })));
          req.onerror = () => reject(req.error);
        };
      }),
  );
  assert.equal(cacheEntries.length, 2, `expected 2 cached OCR pages, got ${JSON.stringify(cacheEntries)}`);
  assert.ok(cacheEntries.every((entry) => entry.chars > 40), `cached pages look empty: ${JSON.stringify(cacheEntries)}`);
  console.log(`Test B first import passed in ${Math.round(firstDuration / 1000)}s, cache: ${JSON.stringify(cacheEntries)}`);

  // Re-import the same file: OCR must come from the cache.
  const secondStart = Date.now();
  await page.setInputFiles("#book-file-input", scanPdf);
  await page.waitForFunction(
    () => (document.querySelector("#book-subtitle")?.textContent || "").includes("沿用上次识别缓存"),
    null,
    { timeout: 60000 },
  );
  const secondDuration = Date.now() - secondStart;
  assert.ok(
    secondDuration < Math.max(10000, firstDuration / 2),
    `cached re-import should be much faster (first ${firstDuration}ms, second ${secondDuration}ms)`,
  );
  console.log(`Test B re-import passed in ${Math.round(secondDuration / 1000)}s (first run ${Math.round(firstDuration / 1000)}s)`);

  await browser.close();
  console.log("Progressive import verification passed");
})().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  process.exit(1);
});
