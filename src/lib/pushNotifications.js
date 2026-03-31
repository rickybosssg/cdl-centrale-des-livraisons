import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "cdl-app-4743c.firebaseapp.com",
  projectId: "cdl-app-4743c",
  storageBucket: "cdl-app-4743c.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

let _app = null;
let _messaging = null;

function getFirebaseApp() {
  if (!_app) {
    _app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApps()[0];
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
  try {
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    await navigator.serviceWorker.ready;
    // Envoyer la config au service worker pour qu'il initialise Firebase
    reg.active?.postMessage({
      type: 'FIREBASE_CONFIG',
      config: FIREBASE_CONFIG,
    });
    const token = await getToken(getFirebaseMessaging(), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: reg,
    });
    return token || null;
  } catch (err) {
    console.warn('FCM token error:', err);
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