const DB_NAME = "istone-reader-library";
const DB_VERSION = 3;
// v3 splits book storage: "books" holds lightweight metadata (title, format,
// progress, …) while "bookContents" holds the full section text. The shelf
// list and the frequent progress writes no longer touch the heavy text blobs.
const STORE_BOOKS = "books";
const STORE_BOOK_CONTENTS = "bookContents";
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
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_BOOKS)) {
        const store = db.createObjectStore(STORE_BOOKS, { keyPath: "id" });
        store.createIndex("lastOpenedAt", "lastOpenedAt");
      }
      if (!db.objectStoreNames.contains(STORE_OCR_PAGES)) {
        const store = db.createObjectStore(STORE_OCR_PAGES, { keyPath: "key" });
        store.createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains(STORE_BOOK_CONTENTS)) {
        db.createObjectStore(STORE_BOOK_CONTENTS, { keyPath: "id" });
      }
      if (event.oldVersion > 0 && event.oldVersion < 3) {
        // v1/v2 stored the full section text inline in each book record;
        // move it into bookContents and keep only metadata behind.
        const books = request.transaction.objectStore(STORE_BOOKS);
        const contents = request.transaction.objectStore(STORE_BOOK_CONTENTS);
        books.openCursor().onsuccess = (cursorEvent) => {
          const cursor = cursorEvent.target.result;
          if (!cursor) {
            return;
          }
          const record = cursor.value;
          if (Array.isArray(record.sections)) {
            contents.put({ id: record.id, sections: record.sections });
            record.sectionCount = record.sections.length;
            delete record.sections;
            cursor.update(record);
          }
          cursor.continue();
        };
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

// Runs `executor(transaction)` over one or more stores. The executor may
// return a function, which is invoked at transaction completion (after all
// requests settled) to produce the resolved value.
function runStoresTransaction(mode, storeNames, executor) {
  return openLibraryDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeNames, mode);
        let result;
        try {
          result = executor(transaction);
        } catch (error) {
          reject(error);
          return;
        }
        transaction.oncomplete = () => resolve(typeof result === "function" ? result() : result);
        transaction.onerror = () => reject(transaction.error || new Error("indexeddb-transaction-failed"));
        transaction.onabort = () => reject(transaction.error || new Error("indexeddb-transaction-aborted"));
      }),
  );
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
  const { sections, ...metaFields } = record;
  await runStoresTransaction("readwrite", [STORE_BOOKS, STORE_BOOK_CONTENTS], (transaction) => {
    const books = transaction.objectStore(STORE_BOOKS);
    const getRequest = books.get(record.id);
    getRequest.onsuccess = () => {
      const existing = getRequest.result || null;
      const meta = {
        ...metaFields,
        sectionCount: Array.isArray(sections) ? sections.length : existing?.sectionCount || 0,
        addedAt: existing?.addedAt || record.addedAt || Date.now(),
        lastOpenedAt: Date.now(),
        progress: record.progress || existing?.progress || null,
      };
      books.put(meta);
    };
    if (Array.isArray(sections)) {
      transaction.objectStore(STORE_BOOK_CONTENTS).put({ id: record.id, sections });
    }
  });
}

export async function getLibraryBook(id) {
  if (!id) {
    return null;
  }
  return runStoresTransaction("readonly", [STORE_BOOKS, STORE_BOOK_CONTENTS], (transaction) => {
    const metaRequest = transaction.objectStore(STORE_BOOKS).get(id);
    const contentRequest = transaction.objectStore(STORE_BOOK_CONTENTS).get(id);
    return () => {
      const meta = metaRequest.result;
      if (!meta) {
        return null;
      }
      return { ...meta, sections: contentRequest.result?.sections || meta.sections || [] };
    };
  });
}

export async function listLibraryBooks() {
  // Metadata only — the shelf list never loads the heavy section text.
  const records = await runStoresTransaction("readonly", [STORE_BOOKS], (transaction) => {
    const request = transaction.objectStore(STORE_BOOKS).getAll();
    return () => request.result || [];
  });
  return records
    .map((record) => ({
      id: record.id,
      title: record.title,
      format: record.format,
      sectionCount: record.sectionCount || (Array.isArray(record.sections) ? record.sections.length : 0),
      totalCharacters: record.totalCharacters || 0,
      addedAt: record.addedAt || 0,
      lastOpenedAt: record.lastOpenedAt || 0,
      progress: record.progress || null,
    }))
    .sort((left, right) => (right.lastOpenedAt || 0) - (left.lastOpenedAt || 0));
}

// Full snapshot (metadata + section text) for backup export.
export async function getAllLibraryBooksFull() {
  return runStoresTransaction("readonly", [STORE_BOOKS, STORE_BOOK_CONTENTS], (transaction) => {
    const metaRequest = transaction.objectStore(STORE_BOOKS).getAll();
    const contentRequest = transaction.objectStore(STORE_BOOK_CONTENTS).getAll();
    return () => {
      const contents = new Map((contentRequest.result || []).map((record) => [record.id, record.sections]));
      return (metaRequest.result || []).map((meta) => ({ ...meta, sections: contents.get(meta.id) || [] }));
    };
  });
}

export async function deleteLibraryBook(id) {
  if (!id) {
    return;
  }
  await runStoresTransaction("readwrite", [STORE_BOOKS, STORE_BOOK_CONTENTS], (transaction) => {
    transaction.objectStore(STORE_BOOKS).delete(id);
    transaction.objectStore(STORE_BOOK_CONTENTS).delete(id);
  });
}

export async function updateLibraryProgress(id, progress) {
  if (!id || !progress) {
    return;
  }
  // Metadata-only write: listening progress lands every second or so and must
  // not rewrite the whole book text (it used to, wearing storage and battery).
  await runStoresTransaction("readwrite", [STORE_BOOKS], (transaction) => {
    const books = transaction.objectStore(STORE_BOOKS);
    const getRequest = books.get(id);
    getRequest.onsuccess = () => {
      const meta = getRequest.result;
      if (!meta) {
        return;
      }
      meta.progress = progress;
      meta.lastOpenedAt = Date.now();
      books.put(meta);
    };
  });
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
