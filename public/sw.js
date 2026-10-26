// Service worker mínimo de Ahorroxa: solo muestra avisos (src/core/notify) y,
// al tocarlos, abre o enfoca la app. No guarda nada en caché.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      return open ? open.focus() : self.clients.openWindow("/");
    }),
  );
});
