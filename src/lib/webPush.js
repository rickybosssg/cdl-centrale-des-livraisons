/**
 * webPush.js — FCM Web Push pour APK Base44 (WebView Android)
 *
 * L'APK Base44 est une WebView distante → window.Capacitor n'est PAS disponible.
 * On utilise Firebase Messaging Web (getToken via VAPID) qui fonctionne parfaitement
 * dans une WebView Android, y compris pour les notifications app fermée via SW.
 */

import { firebaseConfig } from './firebaseConfig';

let messagingInstance = null;

async function getMessaging() {
  if (messagingInstance) return messagingInstance;
  const { initializeApp, getApps, getApp } = await import('firebase/app');
  const { getMessaging } = await import('firebase/messaging');
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  messagingInstance = getMessaging(app);
  return messagingInstance;
}

/**
 * Demande la permission + génère le token FCM Web.
 * Fonctionne dans Chrome, WebView Android, Safari iOS (si SW supporté).
 * @returns {{ token: string|null, permission: string }}
 */
export async function requestWebPushToken() {
  console.log('[webPush] Démarrage requestWebPushToken...');

  // 1. Vérifier support
  if (!('Notification' in window)) {
    console.warn('[webPush] API Notification non disponible');
    return { token: null, permission: 'unavailable' };
  }

  // 2. Demander permission si nécessaire
  let perm = Notification.permission;
  console.log('[webPush] Permission actuelle:', perm);

  if (perm === 'default') {
    perm = await Notification.requestPermission();
    console.log('[webPush] Permission après demande:', perm);
  }

  if (perm !== 'granted') {
    console.warn('[webPush] Permission refusée:', perm);
    return { token: null, permission: perm };
  }

  // 3. S'assurer que le Service Worker est enregistré
  let swRegistration = null;
  if ('serviceWorker' in navigator) {
    try {
      // Chercher un SW existant
      const regs = await navigator.serviceWorker.getRegistrations();
      swRegistration = regs.find(r => r.active || r.installing || r.waiting) || null;

      if (!swRegistration) {
        swRegistration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.log('[webPush] SW enregistré:', swRegistration.scope);
      } else {
        console.log('[webPush] SW existant trouvé:', swRegistration.scope);
      }

      // Attendre activation
      await navigator.serviceWorker.ready;
      console.log('[webPush] SW prêt');
    } catch (swErr) {
      console.warn('[webPush] SW error (on continue sans):', swErr.message);
    }
  }

  // 4. Obtenir token FCM
  try {
    const { getToken } = await import('firebase/messaging');
    const messaging = await getMessaging();

    const tokenOptions = {
      vapidKey: firebaseConfig.vapidKey,
    };
    if (swRegistration) {
      tokenOptions.serviceWorkerRegistration = swRegistration;
    }

    console.log('[webPush] Appel getToken...');
    const token = await getToken(messaging, tokenOptions);

    if (token) {
      console.log('[webPush] ✅ Token FCM obtenu (40 chars):', token.substring(0, 40) + '...');
      return { token, permission: 'granted' };
    } else {
      console.warn('[webPush] getToken a retourné null/empty');
      return { token: null, permission: 'granted' };
    }
  } catch (err) {
    console.error('[webPush] ❌ getToken error:', err.message);
    return { token: null, permission: 'granted', error: err.message };
  }
}

/**
 * Écoute les messages FCM en foreground
 */
export async function onForegroundMessage(callback) {
  try {
    const { onMessage } = await import('firebase/messaging');
    const messaging = await getMessaging();
    return onMessage(messaging, callback);
  } catch (err) {
    console.warn('[webPush] onMessage setup error:', err.message);
    return () => {};
  }
}