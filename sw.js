const CACHE_NAME = "istone-reader-pwa-v24";
const SHARED_BOOK_URL = new URL("./shared-book", self.registration.scope).toString();
const SHARE_TARGET_PATH = new URL("./share-target", self.registration.scope).pathname;
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./library.js",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/icon-180.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./vendor/jszip.min.js",
  "./vendor/epub.min.js",
  "./vendor/pdf.min.mjs",
  "./vendor/pdf.worker.min.mjs",
  "./vendor/tesseract/tesseract.min.js",
  "./vendor/tesseract/worker.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => Promise.resolve()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve();
        }),
      ),
    ),
  );
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method === "POST" && url.pathname === SHARE_TARGET_PATH) {
    event.respondWith(handleSharedBook(event.request));
    return;
  }

  if (event.request.method !== "GET") {
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }
  if (event.request.url === SHARED_BOOK_URL) {
    event.respondWith(caches.match(SHARED_BOOK_URL).then((cached) => cached || new Response("", { status: 404 })));
    return;
  }
  const isLiveAsset =
    url.origin === self.location.origin &&
    (event.request.mode === "navigate" ||
      ["/", "/index.html", "/app.js", "/library.js", "/styles.css", "/manifest.webmanifest", "/sw.js"].includes(url.pathname));

  if (isLiveAsset) {
    // Force revalidation with the server: some mobile browsers (and the
    // WeChat webview) keep serving a stale HTTP-cached copy otherwise.
    event.respondWith(
      fetch(event.request.url, { cache: "no-cache", credentials: "same-origin" })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => Promise.resolve());
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((response) => {
          if (response.ok && url.origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => Promise.resolve());
          }
          return response;
        }),
    ),
  );
});

async function handleSharedBook(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("books").filter((file) => file && typeof file.arrayBuffer === "function");
    const file = files[0];
    if (!file) {
      return Response.redirect("./?shared=0", 303);
    }

    const headers = new Headers({
      "Content-Type": file.type || "application/octet-stream",
      "X-Shared-Filename": encodeURIComponent(file.name || "shared-book.pdf"),
      "Cache-Control": "no-store",
    });
    const cache = await caches.open(CACHE_NAME);
    await cache.put(SHARED_BOOK_URL, new Response(await file.arrayBuffer(), { headers }));
    return Response.redirect("./?shared=1", 303);
  } catch {
    return Response.redirect("./?shared=0", 303);
  }
}
