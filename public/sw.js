// Minimal service worker: makes the app installable. It never caches pages or API
// responses, so operators always see live orders.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
