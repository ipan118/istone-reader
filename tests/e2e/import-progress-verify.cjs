// Verifies the import progress UI: visible with page counter while a PDF is
// being parsed, fill grows, hidden once the import completes.
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

const targetUrl = process.env.TARGET_URL || "http://127.0.0.1:4173/";
const textPdf = path.join(__dirname, "fixtures", "progressive-test.pdf");

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  page.on("pageerror", (e) => { console.error("PAGEERROR", e.message); process.exitCode = 1; });
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".reader-sentence", { timeout: 15000 });

  // Sample the progress element from inside the page during the import.
  await page.evaluate(() => {
    window.__progressSamples = [];
    const el = document.getElementById("import-progress");
    const fill = document.getElementById("import-progress-fill");
    const text = document.getElementById("import-progress-text");
    window.__progressTimer = setInterval(() => {
      if (!el.hidden) {
        window.__progressSamples.push({ text: text.textContent, width: fill.style.width });
      }
    }, 40);
  });

  await page.setInputFiles("#book-file-input", textPdf);
  await page.waitForFunction(
    () => document.querySelector("#status-chip")?.textContent?.includes("已全部解析完成"),
    null,
    { timeout: 120000 },
  );
  const result = await page.evaluate(() => {
    clearInterval(window.__progressTimer);
    return {
      samples: window.__progressSamples,
      hiddenAtEnd: document.getElementById("import-progress").hidden,
    };
  });

  assert.ok(result.samples.length >= 2, `expected progress samples during import, got ${result.samples.length}`);
  assert.ok(
    result.samples.some((s) => /解析进度 \d+\/60 页/.test(s.text)),
    `samples must show page counter: ${JSON.stringify(result.samples.slice(0, 3))}`,
  );
  const widths = result.samples.map((s) => parseFloat(s.width) || 0);
  assert.ok(Math.max(...widths) > Math.min(...widths), "progress fill must grow during import");
  assert.equal(result.hiddenAtEnd, true, "progress must hide when the import completes");
  console.log(
    `Import progress verification passed: ${result.samples.length} samples, ` +
      `first="${result.samples[0].text}", last="${result.samples[result.samples.length - 1].text}"`,
  );
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
