// Service worker: makes the app installable and fully offline-capable.
// The app shell is precached on install; the larger engine files (vendor/) are
// cached at runtime on first use so a flaky connection can't fail the install.
const CACHE = "creator-v29";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (e) => {
  // No skipWaiting here: the new worker waits so the page can prompt "Refresh".
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

// The page posts this when the user taps "Refresh" on the update toast.
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return; // let CDN/other go to network
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        // Cache successful same-origin responses (incl. the vendor engine) for offline reuse.
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
