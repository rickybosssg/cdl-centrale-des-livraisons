/**
 * Service Worker avec Firebase minimal
 * Étape 2 : Initialisation Firebase dans le SW
 */

console.log('[SW] 🟢 Démarrage Service Worker...');
console.log('[SW] Scope:', self.location.href);

// ─────────────────────────────────────────────────────────────────
// FIREBASE INITIALIZATION
// ─────────────────────────────────────────────────────────────────

// Importer Firebase modules
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js');

console.log('[SW] ✅ Firebase scripts importés');

// Config temporaire pour test
const firebaseConfig = {
  apiKey: 'AIzaSyA_example_test_key',
  projectId: 'cdl-ouaga',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abcdef123456',
};

console.log('[SW] Initialisation Firebase...');
try {
  firebase.initializeApp(firebaseConfig);
  console.log('[SW] ✅ Firebase initialisé');

  // Récupérer l'instance de Messaging
  const messaging = firebase.messaging();
  console.log('[SW] ✅ Firebase Messaging activé');

  // Handler pour messages en arrière-plan
  messaging.onBackgroundMessage((payload) => {
    console.log('[SW] 📨 Message background reçu:', payload);
    const notificationTitle = payload.notification?.title || 'CDL Notification';
    const notificationOptions = {
      body: payload.notification?.body || 'Vous avez un nouveau message',
      icon: '/logo.png',
      tag: 'fcm-notification',
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
  });

  console.log('[SW] ✅ onBackgroundMessage handler attaché');
} catch (err) {
  console.error('[SW] ❌ Erreur Firebase:', err.message);
}

// ─────────────────────────────────────────────────────────────────
// LIFECYCLE
// ─────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  console.log('[SW] 📦 Install event triggered');
  self.skipWaiting();
  console.log('[SW] ✅ skipWaiting() appelé');
});

self.addEventListener('activate', (event) => {
  console.log('[SW] 🔄 Activate event triggered');
  event.waitUntil(clients.claim());
  console.log('[SW] ✅ claim() appelé — SW maintenant contrôleur');
});

// ─────────────────────────────────────────────────────────────────
// MESSAGES
// ─────────────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  console.log('[SW] 📨 Message reçu de client:', event.data);
  if (event.data?.type === 'ping') {
    console.log('[SW] ✅ PING reçu — SW est actif');
    event.ports[0].postMessage({ status: 'pong', timestamp: new Date().toISOString() });
  }
});

// ─────────────────────────────────────────────────────────────────
// FETCH
// ─────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  // Passthrough
});

console.log('[SW] ✅ Service Worker prêt avec Firebase');
console.log('[SW] ===== FIN INITIALISATION =====');
