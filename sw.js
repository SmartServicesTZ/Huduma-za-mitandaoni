// Disable the old aggressive cache layer while diagnosing startup hangs.
// The site is served by GitHub Pages; the browser should load current assets
// directly rather than let a stale service worker intercept JS/CSS requests.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      await caches.delete("steward-tz-pwa-v3");
      await self.registration.unregister();
      await self.clients.claim();
    } catch (error) {
      // Service-worker cleanup must never prevent the website from loading.
      console.warn("SmartServicesTZ service-worker cleanup skipped:", error);
    }
  })());
});
