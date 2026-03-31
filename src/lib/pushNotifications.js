/**
 * Firebase Cloud Messaging (FCM) v1 - Web Push
 */

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

let _messaging = null;

function getMsg() {
  if (_messaging) return _messaging;
  const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApps()[0];
  _messaging = getMessaging(app);
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
    const token = await getToken(getMsg(), {
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
export function onForegroundMessage(callback) {
  try {
    return onMessage(getMsg(), callback);
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
    ...options,
  });
  setTimeout(() => notif.close(), 6000);
  return notif;
}