import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';

export const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "cdl-app-4743c.firebaseapp.com",
  projectId: "cdl-app-4743c",
  storageBucket: "cdl-app-4743c.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

// Vérifier que toutes les variables sont définies
const missingVars = Object.entries(FIREBASE_CONFIG)
  .filter(([, v]) => !v || v === 'undefined')
  .map(([k]) => k);
if (missingVars.length > 0) {
  console.warn('[FCM] Variables VITE_ manquantes:', missingVars);
} else {
  console.log('[FCM] Config Firebase chargée - projectId:', FIREBASE_CONFIG.projectId);
}

let _app = null;
let _messaging = null;

function getFirebaseApp() {
  if (!_app) {
    // Réutiliser l'app existante ou en créer une nouvelle
    const apps = getApps();
    _app = apps.length === 0 ? initializeApp(FIREBASE_CONFIG) : apps[0];
    console.log('[FCM] Firebase app initialisée:', _app.name);
  }
  return _app;
}

async function getFirebaseMessagingAsync() {
  try {
    const supported = await isSupported();
    if (!supported) return null;
    if (!_messaging) {
      _messaging = getMessaging(getFirebaseApp());
    }
    return _messaging;
  } catch (err) {
    console.debug('[FCM] messaging not supported:', err?.message);
    return null;
  }
}

export async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function isNotificationGranted() {
  return "Notification" in window && Notification.permission === "granted";
}

export async function registerFcmToken() {
  if (!isNotificationGranted()) return null;
  try {
    const messaging = await getFirebaseMessagingAsync();
    if (!messaging) return null;
    if (!VAPID_KEY || VAPID_KEY === 'undefined') {
      console.error('[FCM] VITE_FIREBASE_VAPID_KEY manquant');
      return null;
    }
    const params = new URLSearchParams({
      apiKey: FIREBASE_CONFIG.apiKey || '',
      authDomain: FIREBASE_CONFIG.authDomain,
      projectId: FIREBASE_CONFIG.projectId,
      storageBucket: FIREBASE_CONFIG.storageBucket,
      messagingSenderId: FIREBASE_CONFIG.messagingSenderId || '',
      appId: FIREBASE_CONFIG.appId || '',
    });
    const reg = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params}`);
    await navigator.serviceWorker.ready;
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (token) console.log('[FCM] Token obtenu:', token.substring(0, 20) + '...');
    return token || null;
  } catch (err) {
    console.debug('[FCM] registerFcmToken error:', err?.message);
    return null;
  }
}

export async function onForegroundMessage(callback) {
  try {
    const messaging = await getFirebaseMessagingAsync();
    if (!messaging) return () => {};
    return onMessage(messaging, callback);
  } catch (err) {
    console.debug('[FCM] foreground listener error:', err?.message);
    return () => {};
  }
}

// Deep link: résoudre route depuis données FCM
export function resolveNotificationRoute(data) {
  if (!data) return null;
  const { route, type, courseId, target_screen, target_entity_id, target_entity_type } = data;
  if (route && route.startsWith('/')) return route;
  if (target_screen && target_screen.startsWith('/')) return target_screen;
  switch (type) {
    case 'new_course': case 'course_accepted': case 'course_update': case 'course_cancelled':
      return courseId ? `/course/${courseId}` : '/mes-courses';
    case 'course_tracking': return courseId ? `/course/${courseId}/track` : '/mes-courses';
    case 'new_message': return '/mes-messages';
    case 'profile_validated': case 'profile_rejected': return '/settings';
    case 'bedou_recharge': case 'bedou_retrait': case 'bedou': return '/mon-bedou';
    case 'course_issue': return '/gestion-signalements';
    case 'admin': return '/admin-dashboard';
    case 'commande': return target_entity_id ? `/commande-marketplace/${target_entity_id}` : '/mes-commandes-marketplace';
    default: return null;
  }
}

// Écouter les messages du Service Worker (deep link au clic notification background)
export function onSwNotificationClick(callback) {
  if (!('serviceWorker' in navigator)) return () => {};
  const handler = (event) => {
    if (event.data?.type === 'CDL_NOTIFICATION_CLICK') {
      callback(event.data);
    }
  };
  navigator.serviceWorker.addEventListener('message', handler);
  return () => navigator.serviceWorker.removeEventListener('message', handler);
}

// Lire les données de notification depuis le localStorage (si app était fermée)
export function consumePendingNotificationRoute() {
  try {
    const raw = localStorage.getItem('cdl_pending_notif_route');
    if (raw) {
      localStorage.removeItem('cdl_pending_notif_route');
      return raw;
    }
  } catch (_) {}
  return null;
}

export function sendPushNotification(title, body, options = {}) {
  if (!isNotificationGranted()) return;
  const notif = new Notification(title, {
    body,
    icon: "https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg",
    badge: "https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg",
    vibrate: [200, 100, 200],
    ...options,
  });
  setTimeout(() => notif.close(), 6000);
  return notif;
}