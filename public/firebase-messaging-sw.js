/* eslint-disable no-restricted-globals */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js');

let initialized = false;

/**
 * Initialise Firebase avec la config reçue via window.__FIREBASE_CONFIG__
 * Le frontend injecte cette variable avant d'enregistrer le SW
 */
function initializeFirebase() {
  try {
    // Config injectée par le frontend avant l'enregistrement du SW
    const config = self.__FIREBASE_CONFIG__;
    
    if (!config) {
      console.error('[firebase-messaging-sw.js] No config injected');
      return false;
    }

    if (!config.apiKey || !config.messagingSenderId || !config.appId) {
      console.error('[firebase-messaging-sw.js] Incomplete config:', {
        hasApiKey: !!config.apiKey,
        hasMessagingSenderId: !!config.messagingSenderId,
        hasAppId: !!config.appId,
      });
      return false;
    }

    firebase.initializeApp(config);
    const messaging = firebase.messaging();
    initialized = true;

    console.log('[firebase-messaging-sw.js] Firebase initialized successfully');
    return true;
  } catch (e) {
    console.error('[firebase-messaging-sw.js] Init error:', e.message);
    return false;
  }
}

// Essayer d'initialiser dès le chargement du SW
if (!initialized) {
  initializeFirebase();
}

// Handle background messages
self.addEventListener('message', (event) => {
  // Si on reçoit la config via message, l'initialiser
  if (event.data && event.data.type === 'FIREBASE_CONFIG') {
    self.__FIREBASE_CONFIG__ = event.data.config;
    if (!initialized) {
      initializeFirebase();
    }
  }
});

// Setup messaging handlers après initialisation
self.addEventListener('activate', (event) => {
  console.log('[firebase-messaging-sw.js] Activated');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('install', (event) => {
  console.log('[firebase-messaging-sw.js] Installing');
  self.skipWaiting();
});

// Background message handler (si Firebase est init)
if (typeof firebase !== 'undefined') {
  try {
    const messaging = firebase.messaging();
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
    console.warn('[firebase-messaging-sw.js] Messaging setup error:', e.message);
  }
}

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification click:', event.notification.data);
  event.notification.close();

  const route = event.notification.data?.route || event.notification.data?.target_screen;
  if (route) {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        if (clients.length > 0) {
          clients[0].navigate(route.startsWith('/') ? route : `/${route}`);
          clients[0].focus();
        } else {
          self.clients.openWindow(route.startsWith('/') ? route : `/${route}`);
        }
      })
    );
  }
});
