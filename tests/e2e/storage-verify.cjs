// Verifies DB v3: legacy v2 records migrate (sections move to bookContents),
// shelf/progress writes are metadata-only, and per-book rate memory works.
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

const targetUrl = process.env.TARGET_URL || "http://127.0.0.1:4173/";
const sampleTxt = path.join(__dirname, "..", "..", "sample-books", "aurora-demo.txt");

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => { console.error("PAGEERROR", e.message); process.exitCode = 1; });

  // --- Seed a legacy v2 database on the same origin (before the app runs) ---
  await page.goto(new URL("./test.html", targetUrl).toString(), { waitUntil: "domcontentloaded" });
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("istone-reader-library", 2);
        req.onupgradeneeded = () => {
          const db = req.result;
          const books = db.createObjectStore("books", { keyPath: "id" });
          books.createIndex("lastOpenedAt", "lastOpenedAt");
          const ocr = db.createObjectStore("ocrPages", { keyPath: "key" });
          ocr.createIndex("updatedAt", "updatedAt");
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("books", "readwrite");
          tx.objectStore("books").put({
            id: "book-legacy-1",
            title: "迁移测试书",
            subtitle: "",
            format: "TXT",
            sourceHint: "",
            sections: [
              {
                id: "section-1",
                title: "第一章 迁移验证",
                text: "这是迁移测试的第一章正文，内容需要足够长以便验证升级后的完整性。旧版本把全文存在元数据记录里，升级后应移动到独立的正文表，同时元数据保留章节数。",
                sourceHint: "",
              },
            ],
            totalCharacters: 100,
            totalParagraphs: 1,
            progress: { sectionIndex: 0, paragraphIndex: 0, sentenceIndex: 0, updatedAt: Date.now() },
            addedAt: Date.now() - 1000,
            lastOpenedAt: Date.now(),
          });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
  console.log("legacy v2 database seeded");

  // --- Load the app: upgrade to v3 + auto-restore the legacy book ---
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => (document.querySelector("#book-title")?.textContent || "").includes("迁移测试书"),
    null,
    { timeout: 20000 },
  );
  await page.waitForSelector(".reader-sentence", { timeout: 10000 });
  const bodyText = await page.evaluate(() => document.querySelector("#reader-body")?.textContent || "");
  assert.ok(bodyText.includes("迁移测试的第一章正文"), "migrated book text must render");
  console.log("legacy book restored and readable after migration");

  const dbShape = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("istone-reader-library");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["books", "bookContents"], "readonly");
          const metaReq = tx.objectStore("books").get("book-legacy-1");
          const contentReq = tx.objectStore("bookContents").get("book-legacy-1");
          tx.oncomplete = () => {
            resolve({
              version: db.version,
              metaHasSections: Array.isArray(metaReq.result?.sections),
              sectionCount: metaReq.result?.sectionCount,
              contentSections: contentReq.result?.sections?.length || 0,
            });
            db.close();
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
  assert.equal(dbShape.version, 3, "db must be at v3");
  assert.equal(dbShape.metaHasSections, false, "meta record must not carry sections");
  assert.equal(dbShape.sectionCount, 1, "meta must keep sectionCount");
  assert.equal(dbShape.contentSections, 1, "bookContents must hold the sections");
  console.log("v3 shape OK:", JSON.stringify(dbShape));

  // --- Per-book rate memory ---
  const setRate = async (value) => {
    await page.evaluate((v) => {
      const slider = document.querySelector("#rate-range");
      slider.value = v;
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    await page.waitForTimeout(1500); // debounce persist
  };
  await setRate("1.7"); // book A (迁移测试书) → 1.7x

  await page.setInputFiles("#book-file-input", sampleTxt); // book B
  await page.waitForFunction(
    () => document.querySelector("#status-chip")?.textContent?.includes("aurora-demo.txt 已载入"),
    null,
    { timeout: 20000 },
  );
  await setRate("1.0"); // book B → 1.0x

  const openFromShelf = async (title) => {
    await page.evaluate((t) => {
      const item = [...document.querySelectorAll(".library-item")].find((li) =>
        li.querySelector("strong")?.textContent.includes(t),
      );
      item.querySelector(".library-open-button").click();
    }, title);
    await page.waitForFunction(
      (t) => (document.querySelector("#book-title")?.textContent || "").includes(t),
      title,
      { timeout: 10000 },
    );
    await page.waitForTimeout(300);
    return page.evaluate(() => document.querySelector("#rate-value").textContent);
  };

  const rateA = await openFromShelf("迁移测试书");
  assert.equal(rateA, "1.7x", `book A must restore 1.7x, got ${rateA}`);
  const rateB = await openFromShelf("aurora-demo");
  assert.equal(rateB, "1.0x", `book B must restore 1.0x, got ${rateB}`);
  console.log(`per-book rate memory OK: A=${rateA}, B=${rateB}`);

  // --- Backup / restore roundtrip ---
  const [backupDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 10000 }),
    page.click("#export-library-button"),
  ]);
  const backupPath = await backupDownload.path();
  const backup = JSON.parse(require("node:fs").readFileSync(backupPath, "utf-8"));
  assert.equal(backup.format, "istone-reader-backup");
  assert.equal(backup.books.length, 2, `backup must contain both books, got ${backup.books.length}`);
  const backupA = backup.books.find((book) => book.title === "迁移测试书");
  assert.ok(backupA.sections.length >= 1 && backupA.progress?.rate === 1.7, "backup must carry text and progress");

  // Delete book A, then restore it from the backup file.
  await page.evaluate(() => {
    const item = [...document.querySelectorAll(".library-item")].find((li) =>
      li.querySelector("strong")?.textContent.includes("迁移测试书"),
    );
    item.querySelector(".library-delete-button").click();
  });
  await page.waitForFunction(
    () => ![...document.querySelectorAll(".library-item-info strong")].some((n) => n.textContent.includes("迁移测试书")),
    null,
    { timeout: 10000 },
  );
  await page.setInputFiles("#restore-library-input", backupPath);
  await page.waitForFunction(
    () => document.querySelector("#status-chip")?.textContent?.includes("已恢复"),
    null,
    { timeout: 15000 },
  );
  await page.waitForFunction(
    () => [...document.querySelectorAll(".library-item-info strong")].some((n) => n.textContent.includes("迁移测试书")),
    null,
    { timeout: 10000 },
  );
  const rateARestored = await openFromShelf("迁移测试书");
  assert.equal(rateARestored, "1.7x", `restored book A must keep its 1.7x rate, got ${rateARestored}`);
  console.log("backup/restore roundtrip OK: delete -> restore -> text and rate intact");

  await browser.close();
  console.log("Storage v3 verification passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
