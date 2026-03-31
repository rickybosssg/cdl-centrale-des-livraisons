/**
 * Firebase Cloud Messaging (FCM) v1 - Web Push
 * Utilise Firebase via CDN (pas de dépendance npm)
 */

const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "cdl-app-4743c.firebaseapp.com",
  projectId: "cdl-app-4743c",
  storageBucket: "cdl-app-4743c.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;
const CDN = "https://www.gstatic.com/firebasejs/10.7.1";

let _messaging = null;

async function getMessaging() {
  if (_messaging) return _messaging;

  const { initializeApp, getApps } = await import(`${CDN}/firebase-app.js`);
  const { getMessaging: _getMsg } = await import(`${CDN}/firebase-messaging.js`);

  const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApps()[0];
  _messaging = _getMsg(app);
  return _messaging;
}

export async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "denied") return false;
  if (Notification.permission === "granted") return true;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function isNotificationGranted() {
  return "Notification" in window && Notification.permission === "granted";
}

/**
 * Enregistre le service worker et récupère le token FCM.
 */
export async function registerFcmToken() {
  if (!isNotificationGranted()) return null;
  try {
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const { getToken } = await import(`${CDN}/firebase-messaging.js`);
    const msg = await getMessaging();
    const token = await getToken(msg, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: reg,
    });
    return token || null;
  } catch (err) {
    console.warn('FCM token error:', err);
    return null;
  }
}

/**
 * Écoute les messages FCM quand l'app est au premier plan.
 */
export async function onForegroundMessage(callback) {
  try {
    const { onMessage } = await import(`${CDN}/firebase-messaging.js`);
    const msg = await getMessaging();
    return onMessage(msg, callback);
  } catch (err) {
    console.warn('FCM foreground listener error:', err);
    return () => {};
  }
}

/**
 * Affiche une notification native locale.
 */
export function sendPushNotification(title, body, options = {}) {
  if (!isNotificationGranted()) return;
  const notif = new Notification(title, {
    body,
    icon: "https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg",
    badge: "https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg",
    ...options,
  });
  setTimeout(() => notif.close(), 6000);
  return notif;
}