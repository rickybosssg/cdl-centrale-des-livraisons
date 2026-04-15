/**
 * Firebase Messaging Service Worker — CDL App
 * VERSION CORRIGÉE : deep link fiable depuis notification background/killed
 *
 * Ce SW est enregistré avec les paramètres Firebase en query string.
 * Il gère les notifications background et les clics depuis app fermée.
 */

// Récupérer la config Firebase depuis les query params
const params = new URLSearchParams(self.location.search);
const firebaseConfig = {
  apiKey:            params.get('apiKey')            || '',
  authDomain:        params.get('authDomain')        || 'cdl-app-4743c.firebaseapp.com',
  projectId:         params.get('projectId')         || 'cdl-app-4743c',
  storageBucket:     params.get('storageBucket')     || 'cdl-app-4743c.appspot.com',
  messagingSenderId: params.get('messagingSenderId') || '',
  appId:             params.get('appId')             || '',
};

// Import Firebase Messaging compat (SW doit utiliser compat)
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

const CDL_ICON = 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg';
const CDL_ORIGIN = self.registration.scope.replace(/\/$/, '') || 'https://cdl.base44.app';

// ── Résoudre la route deep link depuis les données FCM ────────────────────────
function resolveRoute(data) {
  if (!data) return '/';
  // Route explicite en priorité absolue
  if (data.notif_route && data.notif_route.startsWith('/')) return data.notif_route;
  if (data.route && data.route.startsWith('/')) return data.route;
  if (data.target_screen && data.target_screen.startsWith('/')) return data.target_screen;

  // Route par type
  const type = data.type || '';
  const id = data.courseId || data.entity_id || data.target_entity_id || '';

  switch (type) {
    case 'new_delivery_request':
      return id ? `/course-livreur/${id}` : '/courses-disponibles';
    case 'delivery_accepted':
    case 'delivery_started':
      return id ? `/course/${id}/track` : '/mes-courses';
    case 'delivery_completed':
    case 'delivery_cancelled':
    case 'no_driver_found':
      return id ? `/course/${id}` : '/mes-courses';
    case 'new_course':
    case 'course_accepted':
    case 'course_update':
      return id ? `/course/${id}` : '/mes-courses';
    case 'course_cancelled':
      return id ? `/course/${id}` : '/mes-courses';
    case 'course_tracking':
      return id ? `/course/${id}/track` : '/mes-courses';
    case 'new_message':
      return '/mes-messages';
    case 'profile_validated':
    case 'profile_rejected':
      return '/settings';
    case 'bedou_recharge':
    case 'bedou_retrait':
    case 'bedou':
      return '/mon-bedou';
    case 'course_issue':
      return '/gestion-signalements';
    case 'admin':
      return '/admin-dashboard';
    case 'commande':
      return id ? `/commande-marketplace/${id}` : '/mes-commandes-marketplace';
    default:
      return '/';
  }
}

// ── Notifications background (app en arrière-plan ou fermée) ─────────────────
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message:', payload);

  const { notification, data } = payload;
  const title = notification?.title || data?.title || 'CDL';
  const body  = notification?.body  || data?.body  || '';
  const route = resolveRoute(data);

  self.registration.showNotification(title, {
    body,
    icon: CDL_ICON,
    badge: CDL_ICON,
    tag: `cdl-${data?.type || 'notif'}-${data?.courseId || Date.now()}`,
    renotify: true,
    requireInteraction: ['new_delivery_request', 'delivery_cancelled', 'course_issue'].includes(data?.type),
    vibrate: data?.priority === 'high' ? [300, 100, 300, 100, 300] : [200, 100, 200],
    data: {
      ...data,
      route,
      clickAction: CDL_ORIGIN + route,
    },
  });
});

// ── Clic sur notification (toutes les notifications SW, y compris app fermée) ─
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const route = data.route || data.notif_route || '/';
  const targetUrl = CDL_ORIGIN + route;

  console.log('[SW] Notification click → route:', route);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // App déjà ouverte → focus + postMessage pour navigation React Router
      for (const client of clientList) {
        if (client.url.startsWith(CDL_ORIGIN)) {
          client.focus();
          // Envoyer la route à l'app via postMessage (capté par FcmDeepLinkHandler)
          client.postMessage({
            type: 'CDL_NOTIFICATION_CLICK',
            route,
            data,
          });
          return;
        }
      }
      // App fermée → ouvrir avec la route en query param (capté avant mount React)
      return clients.openWindow(CDL_ORIGIN + '/?notif_route=' + encodeURIComponent(route));
    })
  );
});

// ── Activation immédiate du SW ─────────────────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});
