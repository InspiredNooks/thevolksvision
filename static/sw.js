// VolksVision service worker: shows push notifications for the site and the Studio.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "VolksVision", body: e.data ? e.data.text() : "" }; }
  const studio = (d.url || "").startsWith("/admin");
  e.waitUntil(self.registration.showNotification(d.title || "VolksVision", {
    body: d.body || "",
    icon: studio ? "/img/icon-192.png" : "/img/site-icon-192.png",
    badge: "/img/icon-192.png",
    tag: d.tag || undefined,
    data: { url: d.url || "/" }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const hit = wins.find(w => w.url.startsWith(url.split("?")[0]));
    if (hit) return hit.focus();
    return self.clients.openWindow(url);
  })());
});
