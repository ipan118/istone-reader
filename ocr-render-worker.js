// OCR render worker — offloads pdf.js page rendering + canvas preprocessing
// from the main thread so the UI stays interactive during long PDF OCR runs.
//
// Architecture: this module worker owns pdf.js (an ES module, hence the module
// worker). Tesseract recognition still runs in its own worker (UMD bundle,
// incompatible with module workers); the main thread only shuttles the prepared
// image from here into Tesseract. That keeps both UI-blocking sources — pdf.js
// rendering and the JS pixel loop — off the main thread.
//
// Protocol (main ↔ worker):
//   load    { id, file<File> }  (or legacy buffer<ArrayBuffer, transferred>)
//                                                     →  loaded { id }
//   render  { id, pageNumber, mobile }                →  rendered { id, blob }
//   rebitmap{ id }  (PSM retry, same page)            →  rendered { id, blob }
//   release { id }                                    →  released { id }
//   any failure                                       →  error { id, message }
//
// The File handle is preferred: structured-cloning it is practically free
// (disk-backed), so the main thread never duplicates a huge scanned PDF.

import * as pdfjsLib from "./vendor/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", import.meta.url).toString();

// Tuning constants — kept in sync with app.js (stable values).
const OCR_RENDER_MIN_SCALE = 1.8;
const OCR_RENDER_MAX_SCALE = 3.2;
const OCR_TARGET_LONG_EDGE = 2800;
const OCR_MAX_PIXELS = 9_000_000;
const OCR_MOBILE_TARGET_LONG_EDGE = 2200;
const OCR_MOBILE_MAX_PIXELS = 5_500_000;

let pdfDoc = null;
let lastCanvas = null; // kept so a PSM retry can produce another bitmap
let lastPageKey = "";

self.onmessage = async (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") {
    return;
  }
  const { type, id } = message;
  try {
    if (type === "load") {
      await loadDocument(message.file || message.buffer);
      self.postMessage({ type: "loaded", id });
    } else if (type === "render") {
      const canvas = await renderAndPrepare(message.pageNumber, Boolean(message.mobile));
      lastCanvas = canvas;
      lastPageKey = pageKey(message.pageNumber, Boolean(message.mobile));
      // Tesseract.js accepts a Blob directly; a PNG Blob is far cheaper to move
      // across the worker boundary than raw ImageData and is universally handled
      // (ImageBitmap is NOT accepted by tesseract.js v5).
      const blob = await canvasToPngBlob(canvas);
      self.postMessage({ type: "rendered", id, blob });
    } else if (type === "rebitmap") {
      if (!lastCanvas || lastPageKey !== pageKey(message.pageNumber, Boolean(message.mobile))) {
        self.postMessage({ type: "rebitmap-unavailable", id });
      } else {
        const blob = await canvasToPngBlob(lastCanvas);
        self.postMessage({ type: "rendered", id, blob });
      }
    } else if (type === "release") {
      await releaseDocument();
      self.postMessage({ type: "released", id });
    }
  } catch (error) {
    self.postMessage({ type: "error", id, message: String(error?.message || error) });
  }
};

async function loadDocument(source) {
  await releaseDocument();
  if (!source) {
    throw new Error("ocr-worker: missing source");
  }
  // File/Blob: read the bytes here in the worker; ArrayBuffer: legacy path.
  const data = typeof source.arrayBuffer === "function" ? await source.arrayBuffer() : source;
  const loadingTask = pdfjsLib.getDocument({ data });
  pdfDoc = await loadingTask.promise;
}

async function releaseDocument() {
  lastCanvas = null;
  lastPageKey = "";
  const doc = pdfDoc;
  pdfDoc = null;
  if (doc) {
    try {
      doc.cleanup?.();
    } catch {
      // Ignore cleanup errors.
    }
    try {
      await doc.destroy();
    } catch {
      // Ignore destroy errors.
    }
  }
}

async function renderAndPrepare(pageNumber, mobile) {
  if (!pdfDoc) {
    throw new Error("ocr-worker: document not loaded");
  }
  const page = await pdfDoc.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = calculateOcrRenderScale(baseViewport, mobile);
  const viewport = page.getViewport({ scale });

  const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("ocr-worker: 2d context unavailable");
  }
  await page.render({ canvasContext: context, viewport }).promise;
  return prepareCanvasForOcr(canvas);
}

// Encode a canvas as a PNG Blob. tesseract.js accepts a Blob directly and its
// own ImageBitmap path is unreliable across versions, so a PNG Blob is the
// safest handoff. Encoding happens here in the worker, off the main thread.
async function canvasToPngBlob(canvas) {
  if (typeof canvas.convertToBlob === "function") {
    return canvas.convertToBlob({ type: "image/png" });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("ocr-worker: toBlob failed"))), "image/png");
  });
}

// Single-pass preprocessing: one loop over the pixels simultaneously
//   • writes contrast-stretched grayscale (Tesseract binarizes internally, but
//     we keep the mild stretch to match prior behaviour),
//   • accumulates per-row / per-column "darkness mass" (255 − luminance).
// The ink bounding box is then derived from the darkness projections, which is
// threshold-free and far more robust to uneven page lighting than a fixed
// luminance cutoff. This replaces the previous two-pass approach (one pass for
// the average, another for grayscale + threshold scan).
function prepareCanvasForOcr(sourceCanvas) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  if (!width || !height) {
    return sourceCanvas;
  }
  const context = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return sourceCanvas;
  }

  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const rowDark = new Float32Array(height);
  const colDark = new Float32Array(width);

  let index = 0;
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      const luminance = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
      const gray = clampByte(Math.round((luminance - 128) * 1.12 + 128));
      data[index] = gray;
      data[index + 1] = gray;
      data[index + 2] = gray;
      data[index + 3] = 255;
      const dark = 255 - luminance;
      rowSum += dark;
      colDark[x] += dark;
      index += 4;
    }
    rowDark[y] = rowSum;
  }
  context.putImageData(image, 0, 0);

  const crop = computeInkCrop(rowDark, colDark, width, height);
  if (!crop) {
    return sourceCanvas;
  }

  const prepared = new OffscreenCanvas(crop.width, crop.height);
  const preparedContext = prepared.getContext("2d");
  if (!preparedContext) {
    return sourceCanvas;
  }
  preparedContext.drawImage(sourceCanvas, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return prepared;
}

// Locates the text block bounding box from darkness-mass projections. A row or
// column counts as "ink" when its darkness mass exceeds a small fraction of the
// per-pixel average — this adapts to both sparse and dense pages without a hard
// luminance threshold. The useful-crop guard mirrors the original heuristics so
// we only crop real margins (and never over-crop a full-bleed page).
function computeInkCrop(rowDark, colDark, width, height) {
  let maxRow = 0;
  for (let y = 0; y < height; y += 1) {
    if (rowDark[y] > maxRow) {
      maxRow = rowDark[y];
    }
  }
  let maxCol = 0;
  for (let x = 0; x < width; x += 1) {
    if (colDark[x] > maxCol) {
      maxCol = colDark[x];
    }
  }
  // A line needs >6% of the densest line's darkness to count as ink. Tuned to
  // reject faint backgrounds while keeping genuine text rows/columns.
  const rowThreshold = maxRow * 0.06;
  const colThreshold = maxCol * 0.06;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    if (rowDark[y] > rowThreshold) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  for (let x = 0; x < width; x += 1) {
    if (colDark[x] > colThreshold) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  if (maxX < 0 || maxY < 0) {
    return null;
  }

  const padding = Math.round(Math.min(width, height) * 0.025);
  const cropX = clamp(minX - padding, 0, width - 1);
  const cropY = clamp(minY - padding, 0, height - 1);
  const cropRight = clamp(maxX + padding, 1, width);
  const cropBottom = clamp(maxY + padding, 1, height);
  const cropWidth = cropRight - cropX;
  const cropHeight = cropBottom - cropY;

  const hasUsefulCrop =
    cropWidth > width * 0.25 &&
    cropHeight > height * 0.25 &&
    cropWidth * cropHeight < width * height * 0.96;
  if (!hasUsefulCrop) {
    return null;
  }
  return { x: cropX, y: cropY, width: cropWidth, height: cropHeight };
}

function calculateOcrRenderScale(baseViewport, mobile) {
  const width = Math.max(1, baseViewport.width || 1);
  const height = Math.max(1, baseViewport.height || 1);
  const longEdge = Math.max(width, height);
  const targetLongEdge = mobile ? OCR_MOBILE_TARGET_LONG_EDGE : OCR_TARGET_LONG_EDGE;
  const maxPixels = mobile ? OCR_MOBILE_MAX_PIXELS : OCR_MAX_PIXELS;
  let scale = clamp(targetLongEdge / longEdge, OCR_RENDER_MIN_SCALE, OCR_RENDER_MAX_SCALE);
  const projectedPixels = width * height * scale * scale;
  if (projectedPixels > maxPixels) {
    scale *= Math.sqrt(maxPixels / projectedPixels);
  }
  return clamp(scale, 1.1, OCR_RENDER_MAX_SCALE);
}

function pageKey(pageNumber, mobile) {
  return `${pageNumber}:${mobile ? "m" : "d"}`;
}

function clampByte(value) {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
