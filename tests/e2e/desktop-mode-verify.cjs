// Verifies the "desktop site on a phone" layout fix:
//  - a coarse-pointer device with a ~980px layout viewport (phone forced into
//    desktop mode, where the viewport meta is ignored) must get the
//    single-column phone layout;
//  - a real desktop (fine pointer, wide viewport) must keep the multi-column
//    desktop layout.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const targetUrl = process.env.TARGET_URL || "http://127.0.0.1:4173/";

async function cardLayout(page) {
  return page.evaluate(() => {
    const grid = getComputedStyle(document.querySelector(".control-grid")).gridTemplateColumns;
    const book = document.querySelector(".book-card")?.getBoundingClientRect();
    const voice = document.querySelector(".voice-card")?.getBoundingClientRect();
    return {
      gridTracks: grid.split(" ").length,
      sideBySide: Boolean(book && voice && Math.abs(book.top - voice.top) < 40 && voice.left > book.left + 50),
      stacked: Boolean(book && voice && voice.top >= book.bottom - 4 && Math.abs(book.left - voice.left) < 8),
    };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });

  // Phone forced into desktop mode: coarse pointer, wide layout viewport.
  const phoneDesktop = await browser.newContext({
    viewport: { width: 980, height: 1600 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2.6,
  });
  const page1 = await phoneDesktop.newPage();
  await page1.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page1.waitForSelector(".reader-sentence", { timeout: 15000 });
  const pointer1 = await page1.evaluate(() => matchMedia("(pointer: coarse)").matches);
  assert.equal(pointer1, true, "emulated phone must report a coarse pointer");
  const layout1 = await cardLayout(page1);
  assert.ok(
    layout1.stacked && !layout1.sideBySide,
    `desktop-mode phone must get single-column layout: ${JSON.stringify(layout1)}`,
  );
  console.log(`phone-in-desktop-mode: stacked single column ✓ ${JSON.stringify(layout1)}`);
  await phoneDesktop.close();

  // Real desktop keeps the two-column layout.
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page2 = await desktop.newPage();
  await page2.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page2.waitForSelector(".reader-sentence", { timeout: 15000 });
  const pointer2 = await page2.evaluate(() => matchMedia("(pointer: fine)").matches);
  assert.equal(pointer2, true, "desktop context must report a fine pointer");
  const layout2 = await cardLayout(page2);
  assert.ok(
    layout2.sideBySide && layout2.gridTracks > 1,
    `real desktop must keep multi-column layout: ${JSON.stringify(layout2)}`,
  );
  console.log(`real desktop: multi-column retained ✓ ${JSON.stringify(layout2)}`);
  await desktop.close();

  // Regular phone (normal mobile viewport) still gets the phone layout.
  const phone = await browser.newContext({
    viewport: { width: 400, height: 880 },
    isMobile: true,
    hasTouch: true,
  });
  const page3 = await phone.newPage();
  await page3.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page3.waitForSelector(".reader-sentence", { timeout: 15000 });
  const layout3 = await cardLayout(page3);
  assert.ok(layout3.stacked, `normal phone must stay single column: ${JSON.stringify(layout3)}`);
  console.log(`normal phone: single column ✓`);
  await phone.close();

  await browser.close();
  console.log("Desktop-mode layout verification passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
