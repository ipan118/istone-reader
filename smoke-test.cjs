const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

const appDir = __dirname;
const targetUrl = process.env.TARGET_URL || "http://127.0.0.1:4173/";
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const sampleTxt = path.join(appDir, "sample-books", "aurora-demo.txt");
const samplePdf = "D:\\Codex\\coding\\projects\\microsoft__markitdown__main__20260422_235735\\source\\markitdown-main\\packages\\markitdown\\tests\\test_files\\movie-theater-booking-2024.pdf";
const sampleScanPdf = "D:\\Codex\\coding\\projects\\microsoft__markitdown__main__20260422_235735\\source\\markitdown-main\\packages\\markitdown\\tests\\test_files\\MEDRPT-2024-PAT-3847_medical_report_scan.pdf";
const sampleEpub = "D:\\Codex\\coding\\projects\\microsoft__markitdown__main__20260422_235144\\source\\markitdown-main\\packages\\markitdown\\tests\\test_files\\test.epub";

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: edgePath });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  page.on("pageerror", (error) => {
    console.error("PAGEERROR", error.message);
  });

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Vivid Reader");

  await page.click('[data-tone-preset="sunset"]');
  await page.waitForFunction(() => document.querySelector("#tone-pill")?.textContent?.includes("落日汽水"), null, {
    timeout: 10000,
  });

  await page.setInputFiles("#book-file-input", sampleTxt);
  await page.waitForFunction(() => document.querySelector("#status-chip")?.textContent?.includes("aurora-demo.txt 已载入"), null, {
    timeout: 20000,
  });
  await page.waitForSelector("text=第一章 把书变成会说话的朋友");
  const txtCount = await page.locator(".chapter-chip").count();
  assert.ok(txtCount >= 4, "TXT should produce multiple sections");
  const jumpCount = await page.locator("#section-jump-row .jump-button").count();
  assert.ok(jumpCount >= 3, "Section quick points should render");

  await page.click("#voice-test-button");
  await page.waitForFunction(() => {
    const text = document.querySelector("#speech-diagnostic-title")?.textContent || "";
    return text.includes("浏览器已开始发声") || text.includes("测试语音已结束");
  }, null, {
    timeout: 12000,
  });

  await page.locator("#rate-range").evaluate((element) => {
    element.value = "0.7";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.click("#speak-button");
  await page.waitForFunction(() => {
    const text = document.querySelector("#speech-state-hint")?.textContent || "";
    return text.includes("正在朗读") || text.includes("本章朗读结束");
  }, null, {
    timeout: 12000,
  });
  await page.click("#stop-button");

  await page.locator("#section-range").evaluate((element) => {
    element.value = "2";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForSelector("text=第三章 声音决定陪伴感");
  await page.click("#paragraph-jump-row .jump-button:last-child");
  await page.waitForFunction(() => document.querySelector("#paragraph-range-label")?.textContent?.trim().length > 0, null, {
    timeout: 8000,
  });

  await page.setInputFiles("#book-file-input", samplePdf);
  await page.waitForFunction(
    () => document.querySelector("#status-chip")?.textContent?.includes("movie-theater-booking-2024.pdf 已载入"),
    null,
    { timeout: 40000 },
  );
  const pdfFormat = await page.locator("#book-format-pill").textContent();
  assert.equal(pdfFormat, "PDF");
  const pdfCount = Number(await page.locator("#chapter-count").textContent());
  assert.ok(pdfCount >= 1, "PDF should produce at least one section");

  await page.setInputFiles("#book-file-input", sampleScanPdf);
  await page.waitForFunction(
    () =>
      document.querySelector("#status-chip")?.textContent?.includes("MEDRPT-2024-PAT-3847_medical_report_scan.pdf 已载入") &&
      document.querySelector("#book-subtitle")?.textContent?.includes("扫描识别"),
    null,
    { timeout: 180000 },
  );
  const scanCount = Number(await page.locator("#chapter-count").textContent());
  assert.ok(scanCount >= 1, "Scanned PDF should produce at least one section");

  await page.setInputFiles("#book-file-input", sampleEpub);
  await page.waitForFunction(() => document.querySelector("#status-chip")?.textContent?.includes("test.epub 已载入"), null, {
    timeout: 40000,
  });
  const epubFormat = await page.locator("#book-format-pill").textContent();
  assert.equal(epubFormat, "EPUB");
  const epubCount = Number(await page.locator("#chapter-count").textContent());
  assert.ok(epubCount >= 1, "EPUB should produce at least one section");

  await page.screenshot({ path: path.join(appDir, "smoke-test-mobile.png"), fullPage: true });
  await browser.close();
  console.log("Smoke test passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
