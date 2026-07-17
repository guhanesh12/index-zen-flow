/* global firebase */
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBUt38Mx2WR-EfEU1wLfFEjNygNMay8eYo",
  authDomain: "indexpilotai-e1106.firebaseapp.com",
  projectId: "indexpilotai-e1106",
  storageBucket: "indexpilotai-e1106.firebasestorage.app",
  messagingSenderId: "167770668435",
  appId: "1:167770668435:web:ec781a95603f5b24bbbc66",
  measurementId: "G-6BTDWSVFPQ",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || "IndexpilotAI";
  const body = payload.notification?.body || payload.data?.body || "New trading notification";
  const url = payload.data?.url || payload.data?.click_action || "/notifications";

  self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-72x72.png",
    data: { url },
    tag: payload.data?.event || payload.messageId || "indexpilot-notification",
    renotify: true,
    requireInteraction: false,
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/notifications";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const targetUrl = new URL(url, self.location.origin).href;
      for (const client of clients) {
        if (client.url === targetUrl && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});