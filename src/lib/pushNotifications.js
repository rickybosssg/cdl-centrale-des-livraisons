import { initializeApp, getApps, deleteApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

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

function getFirebaseMessaging() {
  if (!_messaging) {
    _messaging = getMessaging(getFirebaseApp());
  }
  return _messaging;
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
  if (!VAPID_KEY || VAPID_KEY === 'undefined') {
    console.error('[FCM] VITE_FIREBASE_VAPID_KEY manquant');
    return null;
  }
  try {
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
    console.log('[FCM] Service Worker actif, génération du token...');
    const token = await getToken(getFirebaseMessaging(), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: reg,
    });
    if (token) console.log('[FCM] Token obtenu:', token.substring(0, 20) + '...');
    else console.warn('[FCM] Aucun token retourné');
    return token || null;
  } catch (err) {
    console.warn('[FCM] Erreur token:', err);
    return null;
  }
}

export function onForegroundMessage(callback) {
  try {
    return onMessage(getFirebaseMessaging(), callback);
  } catch (err) {
    console.warn('FCM foreground listener error:', err);
    return () => {};
  }
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