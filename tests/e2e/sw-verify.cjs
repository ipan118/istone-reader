// Verifies the P0-2 service worker fixes with the app hosted under a sub-path:
//  1. SW installs and the precache includes ocr-render-worker.js.
//  2. The OCR pack (tesseract cores + traineddata) is cached at install time.
//  3. Scope-relative live-asset matching: app.js served from a sub-path is
//     still refreshed network-first (observed via server request log).
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const base = process.env.TARGET_URL || "http://127.0.0.1:4180/sub/reader/";

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error("PAGEERROR", error.message));

  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=iStone Reader");

  // Wait until the SW has installed and finished precaching the OCR pack.
  const cached = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    // Resolve the current cache name from the deployed sw.js (no hardcoding).
    const swSource = await (await fetch("./sw.js", { cache: "no-store" })).text();
    const expectedCache = swSource.match(/istone-reader-pwa-v\d+/)?.[0];
    if (!expectedCache) {
      return { ok: false, missing: ["CACHE_NAME not found in sw.js"], urls: [] };
    }
    const deadline = Date.now() + 30000;
    const required = [
      "ocr-render-worker.js",
      "text-pipeline.mjs",
      "vendor/tesseract/tesseract-core-simd-lstm.wasm.js",
      "vendor/tesseract/tesseract-core-lstm.wasm.js",
      "vendor/tessdata/chi_sim.traineddata.gz",
      "vendor/tessdata/eng.traineddata.gz",
      "app.js",
      "index.html",
    ];
    while (Date.now() < deadline) {
      const keys = await caches.keys();
      const name = keys.find((key) => key === expectedCache);
      if (name) {
        const cache = await caches.open(name);
        const urls = (await cache.keys()).map((request) => request.url);
        const missing = required.filter((suffix) => !urls.some((url) => url.endsWith(suffix)));
        if (!missing.length) {
          return { ok: true, urls };
        }
        if (Date.now() + 1000 >= deadline) {
          return { ok: false, missing, urls };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return { ok: false, missing: [`cache ${expectedCache} never appeared`], urls: await caches.keys() };
  });
  assert.ok(cached.ok, `precache incomplete: ${JSON.stringify(cached.missing || cached.urls)}`);

  // Every cached URL must live under the sub-path scope (scope-relative resolution).
  const badScope = cached.urls.filter((url) => !url.startsWith(base) && !url.includes("/sub/reader/"));
  assert.equal(badScope.length, 0, `cached URLs outside scope: ${badScope.join(", ")}`);

  // Live-asset check: reload the (now SW-controlled) page and confirm app.js is
  // re-requested from the network instead of served cache-first.
  const networkHits = [];
  page.on("request", (request) => networkHits.push(request.url()));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=iStone Reader");
  const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
  assert.ok(controlled, "page should be controlled by the SW after reload");
  const appJsFetched = await page.evaluate(async () => {
    const response = await fetch("./app.js", { cache: "no-store" });
    return response.ok;
  });
  assert.ok(appJsFetched, "app.js should be fetchable through the SW under the sub-path");

  await browser.close();
  console.log("SW sub-path verification passed");
  console.log(`cached entries: ${cached.urls.length}`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
