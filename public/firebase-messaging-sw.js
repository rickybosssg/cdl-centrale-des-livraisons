/* eslint-disable no-restricted-globals */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js');

// Récupérer les params passés via l'URL
const params = new URLSearchParams(self.location.search);
const firebaseConfig = {
  apiKey: params.get('apiKey') || '',
  authDomain: params.get('authDomain') || '',
  projectId: params.get('projectId') || '',
  storageBucket: params.get('storageBucket') || '',
  messagingSenderId: params.get('messagingSenderId') || '',
  appId: params.get('appId') || '',
};
const vapidKey = params.get('vapidKey') || '';

// Initialiser Firebase seulement si les params sont présents
if (firebaseConfig.apiKey && firebaseConfig.messagingSenderId && firebaseConfig.appId) {
  try {
    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();

    // Background message handler
    messaging.onBackgroundMessage((payload) => {
      console.log('[firebase-messaging-sw.js] Received background message:', payload);

      const notificationTitle = payload.notification?.title || payload.data?.titre || 'CDL';
      const notificationOptions = {
        body: payload.notification?.body || payload.data?.message || '',
        icon: payload.notification?.icon || payload.data?.icon || 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/1eb51398f_Screenshot_20260330_132434_WhatsApp.jpg',
        badge: 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/1eb51398f_Screenshot_20260330_132434_WhatsApp.jpg',
        data: payload.data,
        requireInteraction: true,
        tag: payload.data?.notification_key || notificationTitle,
        renotify: payload.data?.notification_key ? true : false,
      };

      self.registration.showNotification(notificationTitle, notificationOptions);
    });
  } catch (e) {
    console.error('[firebase-messaging-sw.js] Error initializing Firebase:', e);
  }
} else {
  console.error('[firebase-messaging-sw.js] Missing Firebase config params:', {
    hasApiKey: !!firebaseConfig.apiKey,
    hasMessagingSenderId: !!firebaseConfig.messagingSenderId,
    hasAppId: !!firebaseConfig.appId,
  });
}

// Force skip waiting and claim clients immediately
self.addEventListener('install', (event) => {
  console.log('[firebase-messaging-sw.js] Installing...', self.registration.scope);
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[firebase-messaging-sw.js] Activated:', self.registration.scope);
  event.waitUntil(self.clients.claim());
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification click:', event.notification.data);
  event.notification.close();

  const route = event.notification.data?.route || event.notification.data?.target_screen;
  if (route) {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        if (clients.length > 0) {
          // Navigate existing window
          clients[0].navigate(route.startsWith('/') ? route : `/${route}`);
          clients[0].focus();
        } else {
          // Open new window
          self.clients.openWindow(route.startsWith('/') ? route : `/${route}`);
        }
      })
    );
  }
});
