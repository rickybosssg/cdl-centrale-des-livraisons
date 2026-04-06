// ============================================================
// CDL Firebase Messaging Service Worker
// Gère les notifications BACKGROUND et APP FERMÉE
// ============================================================

const urlParams = new URL(self.location.href).searchParams;
const firebaseConfig = {
  apiKey: urlParams.get('apiKey') || '',
  authDomain: urlParams.get('authDomain') || 'cdl-app-4743c.firebaseapp.com',
  projectId: urlParams.get('projectId') || 'cdl-app-4743c',
  storageBucket: urlParams.get('storageBucket') || 'cdl-app-4743c.appspot.com',
  messagingSenderId: urlParams.get('messagingSenderId') || '',
  appId: urlParams.get('appId') || '',
};

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

const APP_ORIGIN = self.registration.scope.replace(/\/$/, '');

// ─── Deep link ────────────────────────────────────────────────
function resolveRoute(data) {
  if (!data) return '/';
  const { route, courseId, type, target_screen, target_entity_id } = data;
  if (route && route.startsWith('/')) return route;
  if (target_screen && target_screen.startsWith('/')) return target_screen;
  switch (type) {
    case 'new_course':
    case 'course_accepted':
    case 'course_update':
    case 'course_cancelled':
      return courseId ? `/course/${courseId}` : '/mes-courses';
    case 'course_tracking':
      return courseId ? `/course/${courseId}/track` : '/mes-courses';
    case 'new_message': return '/mes-messages';
    case 'profile_validated':
    case 'profile_rejected': return '/settings';
    case 'bedou_recharge':
    case 'bedou_retrait':
    case 'bedou': return '/mon-bedou';
    case 'course_issue': return '/gestion-signalements';
    case 'admin': return '/admin-dashboard';
    case 'commande':
      return target_entity_id ? `/commande-marketplace/${target_entity_id}` : '/mes-commandes-marketplace';
    default: return '/';
  }
}

function getChannelId(type) {
  if (['new_course', 'course_cancelled', 'course_issue', 'admin'].includes(type)) return 'cdl_courses';
  if (type === 'new_message') return 'cdl_messages';
  if (['bedou_recharge', 'bedou_retrait', 'bedou'].includes(type)) return 'cdl_bedou';
  if (['profile_validated', 'profile_rejected'].includes(type)) return 'cdl_admin';
  if (type === 'commande') return 'cdl_mall';
  return 'cdl_general';
}

// ─── BACKGROUND / APP FERMÉE ──────────────────────────────────
messaging.onBackgroundMessage((payload) => {
  console.log('[CDL-SW] Message background:', payload);

  const data = payload.data || {};
  const notification = payload.notification || {};

  const title = notification.title || data.title || 'CDL APP';
  const body = notification.body || data.body || 'Nouvelle notification';
  const icon = 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg';
  const route = resolveRoute(data);
  const channelId = getChannelId(data.type || '');
  const isHighPriority = ['new_course', 'course_cancelled', 'course_issue', 'admin'].includes(data.type);

  const options = {
    body,
    icon,
    badge: icon,
    vibrate: isHighPriority ? [300, 100, 300, 100, 300] : [200, 100, 200],
    requireInteraction: isHighPriority,
    tag: `cdl-${data.type || 'notif'}-${data.courseId || Date.now()}`,
    renotify: true,
    silent: false,
    data: {
      ...data,
      route,
      channelId,
      fullUrl: `${APP_ORIGIN}${route}?notif_route=${encodeURIComponent(route)}`,
    },
    actions: isHighPriority ? [
      { action: 'open', title: '👁️ Voir' },
      { action: 'dismiss', title: '✕ Fermer' },
    ] : [],
  };

  return self.registration.showNotification(title, options);
});

// ─── CLIC sur notification ────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  console.log('[CDL-SW] Clic:', event.notification.data);
  event.notification.close();

  if (event.action === 'dismiss') return;

  const data = event.notification.data || {};
  const route = data.route || '/';
  const fullUrl = data.fullUrl || `${APP_ORIGIN}${route}?notif_route=${encodeURIComponent(route)}`;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // App déjà ouverte → envoyer message pour navigation in-app
      for (const client of windowClients) {
        if (client.url.startsWith(APP_ORIGIN)) {
          client.focus();
          client.postMessage({ type: 'CDL_NOTIFICATION_CLICK', route, data });
          return;
        }
      }
      // App fermée → ouvrir avec notif_route en param
      return clients.openWindow(fullUrl);
    })
  );
});

// ─── PUSH brut (data-only, fallback) ─────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }
  if (payload.notification) return; // Firebase gère déjà

  const data = payload.data || {};
  const title = data.title || 'CDL APP';
  const body = data.body || 'Nouvelle notification';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg',
      data: { ...data, route: resolveRoute(data) },
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
  console.log('[CDL-SW] Activé');
});

self.addEventListener('install', () => {
  self.skipWaiting();
  console.log('[CDL-SW] Installé');
});
