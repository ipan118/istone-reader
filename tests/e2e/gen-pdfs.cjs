// Generates the two fixture PDFs for the progressive-import verification:
//  - progressive-test.pdf: 60 text-layer pages with "Chapter N" headings
//  - scan-test.pdf: 2 image-only pages (forces the OCR path)
const fs = require("node:fs");
const path = require("node:path");
const { PDFDocument, StandardFonts } = require("pdf-lib");
const { chromium } = require("playwright");

const outDir = require("node:path").join(__dirname, "fixtures");

async function genTextPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pageCount = 60;
  for (let p = 1; p <= pageCount; p += 1) {
    const page = doc.addPage([595, 842]);
    let y = 800;
    const lines = [];
    if (p % 6 === 1) {
      lines.push(`Chapter ${Math.floor((p - 1) / 6) + 1}`);
    }
    for (let i = 0; i < 28; i += 1) {
      lines.push(
        `Page ${p} sentence ${i + 1}. The quick brown fox jumps over the lazy dog near the river at dawn.`,
      );
    }
    for (const line of lines) {
      page.drawText(line, { x: 40, y, size: 11, font });
      y -= 26;
    }
  }
  fs.writeFileSync(path.join(outDir, "progressive-test.pdf"), await doc.save());
  console.log("progressive-test.pdf written");
}

async function genScanPdf() {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
  const doc = await PDFDocument.create();

  // Every line must be unique: the app's OCR cleanup drops lines that repeat
  // across a page (running header/footer detection) after digit-normalizing.
  const pageTexts = [
    [
      "The lighthouse keeper climbed the narrow stairs before sunrise.",
      "A warm cup of coffee waited beside the old brass telescope.",
      "Ships passed the rocky shoreline while gulls circled overhead.",
      "He wrote careful notes about the weather in a leather journal.",
      "By afternoon the fog had lifted and the harbor turned busy.",
      "Fishing boats returned with silver nets shining in the light.",
    ],
    [
      "In the village market, bakers stacked fresh bread on wooden shelves.",
      "Children hurried past carrying kites shaped like orange dragons.",
      "An old musician tuned his violin near the stone fountain.",
      "Travelers exchanged stories about mountain roads and river ferries.",
      "The evening bell rang softly as lanterns began to glow.",
      "Everyone agreed the festival would begin at noon tomorrow.",
    ],
  ];
  for (let p = 1; p <= 2; p += 1) {
    const paragraphs = pageTexts[p - 1].map((line) => `<p>${line}</p>`);
    await page.setContent(
      `<body style="margin:0;background:#fff;"><div style="font:32px Arial;color:#111;padding:48px;line-height:1.9;">${paragraphs.join("")}</div></body>`,
    );
    const png = await page.screenshot();
    const image = await doc.embedPng(png);
    const pdfPage = doc.addPage([500, 700]);
    pdfPage.drawImage(image, { x: 0, y: 0, width: 500, height: 700 });
  }

  await browser.close();
  fs.writeFileSync(path.join(outDir, "scan-test.pdf"), await doc.save());
  console.log("scan-test.pdf written");
}

(async () => {
  await genTextPdf();
  await genScanPdf();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
