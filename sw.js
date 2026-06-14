// Service worker for the AI Avatar Content Factory PWA.
// Bump CACHE on every release (kept in lock-step with APP_BUILD in index.html).
// Pattern: do NOT skipWaiting on install — the page shows an "update ready" toast
// and posts {type:"SKIP_WAITING"} when the user accepts, so updates never reload
// mid-generation.
const CACHE = "creator-v44";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // never touch API/CDN cross-origin calls
  // Never cache the relays (Atlas / OpenAI / result download).
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/openai/") || url.pathname.startsWith("/fetch")) return;

  const isHTML = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
  if (isHTML) {
    // Network-first so a fresh build shows immediately; fall back to cache offline.
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(CACHE); c.put(req, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(req)) || (await caches.match("./index.html")) || Response.error();
      }
    })());
    return;
  }

  // Cache-first for static assets (vendor wasm/js, icons) — large and immutable per build.
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.status === 200 && fresh.type === "basic") {
        const c = await caches.open(CACHE); c.put(req, fresh.clone());
      }
      return fresh;
    } catch {
      return cached || Response.error();
    }
  })());
});
