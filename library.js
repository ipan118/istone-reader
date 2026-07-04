const DB_NAME = "istone-reader-library";
const DB_VERSION = 2;
const STORE_BOOKS = "books";
const STORE_OCR_PAGES = "ocrPages";

let dbPromise = null;

function isLibrarySupported() {
  return typeof indexedDB !== "undefined";
}

function openLibraryDb() {
  if (!isLibrarySupported()) {
    return Promise.reject(new Error("indexeddb-unavailable"));
  }
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_BOOKS)) {
        const store = db.createObjectStore(STORE_BOOKS, { keyPath: "id" });
        store.createIndex("lastOpenedAt", "lastOpenedAt");
      }
      if (!db.objectStoreNames.contains(STORE_OCR_PAGES)) {
        const store = db.createObjectStore(STORE_OCR_PAGES, { keyPath: "key" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error("indexeddb-open-failed"));
    };
  });
  return dbPromise;
}

function runTransaction(mode, executor, storeName = STORE_BOOKS) {
  return openLibraryDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        let result;
        try {
          result = executor(store);
        } catch (error) {
          reject(error);
          return;
        }
        transaction.oncomplete = () => {
          if (result && typeof result.then !== "function" && "result" in result) {
            resolve(result.result);
            return;
          }
          resolve(result);
        };
        transaction.onerror = () => reject(transaction.error || new Error("indexeddb-transaction-failed"));
        transaction.onabort = () => reject(transaction.error || new Error("indexeddb-transaction-aborted"));
      }),
  );
}

export async function saveBookToLibrary(record) {
  if (!record?.id) {
    return;
  }
  const existing = await getLibraryBook(record.id).catch(() => null);
  const payload = {
    ...record,
    addedAt: existing?.addedAt || record.addedAt || Date.now(),
    lastOpenedAt: Date.now(),
    progress: record.progress || existing?.progress || null,
  };
  await runTransaction("readwrite", (store) => store.put(payload));
}

export async function getLibraryBook(id) {
  if (!id) {
    return null;
  }
  return runTransaction("readonly", (store) => store.get(id));
}

export async function listLibraryBooks() {
  const records = await runTransaction("readonly", (store) => store.getAll());
  return (records || [])
    .map((record) => ({
      id: record.id,
      title: record.title,
      format: record.format,
      sectionCount: Array.isArray(record.sections) ? record.sections.length : 0,
      totalCharacters: record.totalCharacters || 0,
      addedAt: record.addedAt || 0,
      lastOpenedAt: record.lastOpenedAt || 0,
      progress: record.progress || null,
    }))
    .sort((left, right) => (right.lastOpenedAt || 0) - (left.lastOpenedAt || 0));
}

export async function deleteLibraryBook(id) {
  if (!id) {
    return;
  }
  await runTransaction("readwrite", (store) => store.delete(id));
}

export async function updateLibraryProgress(id, progress) {
  if (!id || !progress) {
    return;
  }
  const record = await getLibraryBook(id).catch(() => null);
  if (!record) {
    return;
  }
  record.progress = progress;
  record.lastOpenedAt = Date.now();
  await runTransaction("readwrite", (store) => store.put(record));
}

// --- Per-page OCR result cache ---
// Recognized text is stored per (file fingerprint, page, OCR language), so an
// interrupted import of a big scanned PDF can resume without redoing pages.

function ocrPageKey(fileKey, pageNumber, lang) {
  return `${fileKey}::${lang}::${pageNumber}`;
}

export async function getCachedOcrPage(fileKey, pageNumber, lang) {
  if (!fileKey || !pageNumber || !lang) {
    return null;
  }
  return runTransaction("readonly", (store) => store.get(ocrPageKey(fileKey, pageNumber, lang)), STORE_OCR_PAGES);
}

export async function saveCachedOcrPage({ fileKey, pageNumber, lang, text }) {
  if (!fileKey || !pageNumber || !lang || typeof text !== "string") {
    return;
  }
  const record = {
    key: ocrPageKey(fileKey, pageNumber, lang),
    fileKey,
    pageNumber,
    lang,
    text,
    updatedAt: Date.now(),
  };
  await runTransaction("readwrite", (store) => store.put(record), STORE_OCR_PAGES);
}

export async function pruneOcrPageCache(maxAgeMs) {
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    return;
  }
  const cutoff = Date.now() - maxAgeMs;
  await runTransaction(
    "readwrite",
    (store) => {
      const range = IDBKeyRange.upperBound(cutoff);
      const request = store.index("updatedAt").openCursor(range);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      return request;
    },
    STORE_OCR_PAGES,
  );
}
