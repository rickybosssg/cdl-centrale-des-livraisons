/**
 * webFcm.js — Firebase Cloud Messaging via Web SDK
 *
 * Cette approche fonctionne dans TOUS les contextes :
 * - APK Base44 (WebView distante, pas de Capacitor injecté)
 * - PWA navigateur desktop/mobile
 * - Chrome Android
 *
 * Elle NE dépend PAS de window.Capacitor.
 */

import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { base44 } from '@/api/base44Client';

let messagingInstance = null;

function getFirebaseApp() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp(firebaseConfig);
}

function getMessagingInstance() {
  if (messagingInstance) return messagingInstance;
  const app = getFirebaseApp();
  messagingInstance = getMessaging(app);
  return messagingInstance;
}

/**
 * Vérifie si le contexte supporte FCM web
 */
export function isFcmWebSupported() {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

/**
 * Enregistre le Service Worker Firebase et retourne l'enregistrement
 */
async function ensureFirebaseSW() {
  try {
    // Chercher un SW Firebase déjà enregistré
    const regs = await navigator.serviceWorker.getRegistrations();
    const existing = regs.find(r => r.scope.includes('/') && r.active?.scriptURL?.includes('firebase-messaging-sw'));
    if (existing) {
      console.log('[webFcm] ✅ SW Firebase déjà enregistré:', existing.scope);
      return existing;
    }

    // Enregistrer le SW Firebase
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
    console.log('[webFcm] ✅ SW Firebase enregistré:', reg.scope);
    return reg;
  } catch (err) {
    console.error('[webFcm] ❌ Erreur SW Firebase:', err.message);
    return null;
  }
}

/**
 * Initialise FCM Web : demande permission + génère token + sauvegarde BDD
 * @param {object} options
 * @param {function} options.onToken - callback(token)
 * @param {function} options.onForegroundNotif - callback(notification)
 * @param {function} options.onPermissionDenied - callback()
 * @returns {{ cleanup: function, permissionStatus: string }}
 */
export async function initWebFcm({ onToken, onForegroundNotif, onPermissionDenied } = {}) {
  if (!isFcmWebSupported()) {
    console.warn('[webFcm] FCM Web non supporté sur cet appareil');
    return { cleanup: () => {}, permissionStatus: 'unsupported' };
  }

  console.log('[webFcm] ════════════════════════════');
  console.log('[webFcm] INIT FCM WEB (WebView/APK Base44)');

  // ── 1. Enregistrer le SW Firebase ───────────────────────────────────────
  const swReg = await ensureFirebaseSW();
  if (!swReg) {
    return { cleanup: () => {}, permissionStatus: 'sw_error' };
  }

  // ── 2. Vérifier permission actuelle ─────────────────────────────────────
  const currentPerm = Notification.permission;
  console.log('[webFcm] Permission actuelle:', currentPerm);

  if (currentPerm === 'denied') {
    console.warn('[webFcm] ❌ Permission refusée définitivement');
    if (onPermissionDenied) onPermissionDenied();
    return { cleanup: () => {}, permissionStatus: 'denied' };
  }

  // ── 3. Demander permission si nécessaire ────────────────────────────────
  if (currentPerm !== 'granted') {
    console.log('[webFcm] Demande de permission...');
    const perm = await Notification.requestPermission();
    console.log('[webFcm] Réponse permission:', perm);

    if (perm !== 'granted') {
      console.warn('[webFcm] ❌ Permission refusée par l\'utilisateur');
      if (onPermissionDenied) onPermissionDenied();
      return { cleanup: () => {}, permissionStatus: 'user_denied' };
    }
  }

  console.log('[webFcm] ✅ Permission accordée');

  // ── 4. Obtenir le token FCM ──────────────────────────────────────────────
  let token = null;
  try {
    const messaging = getMessagingInstance();
    token = await getToken(messaging, {
      vapidKey: firebaseConfig.vapidKey,
      serviceWorkerRegistration: swReg,
    });

    if (!token) {
      console.error('[webFcm] ❌ Token FCM vide');
      return { cleanup: () => {}, permissionStatus: 'token_error' };
    }

    console.log('[webFcm] ✅ Token FCM obtenu:', token.substring(0, 30) + '...');

    // ── 5. Callback onToken ──────────────────────────────────────────────
    if (onToken) onToken(token);

    // ── 6. Sauvegarder en BDD ────────────────────────────────────────────
    try {
      const me = await base44.auth.me();
      if (me?.email) {
        const res = await base44.functions.invoke('saveFcmToken', {
          token,
          userId: me.id,
          userEmail: me.email,
          userRole: me.role,
          deviceType: 'web',
        });
        console.log('[webFcm] ✅ Token sauvegardé BDD:', res.data?.action, '— id:', res.data?.token_id);
      }
    } catch (saveErr) {
      console.error('[webFcm] ❌ Erreur saveFcmToken:', saveErr.message);
    }
  } catch (tokenErr) {
    console.error('[webFcm] ❌ Erreur getToken:', tokenErr.message);
    return { cleanup: () => {}, permissionStatus: 'token_error' };
  }

  // ── 7. Écouter les notifications en foreground ──────────────────────────
  let unsubscribeForeground = null;
  try {
    const messaging = getMessagingInstance();
    unsubscribeForeground = onMessage(messaging, (payload) => {
      console.log('[webFcm] 📬 Notification foreground:', payload.notification?.title);
      if (onForegroundNotif) {
        onForegroundNotif({
          title: payload.notification?.title || 'CDL',
          body: payload.notification?.body || '',
          data: payload.data || {},
        });
      }
    });
    console.log('[webFcm] ✅ Listener foreground actif');
  } catch (err) {
    console.warn('[webFcm] ⚠️ Erreur listener foreground:', err.message);
  }

  console.log('[webFcm] ✅ FCM WEB INITIALISÉ AVEC SUCCÈS');
  console.log('[webFcm] ════════════════════════════');

  const cleanup = () => {
    if (unsubscribeForeground) unsubscribeForeground();
  };

  return { cleanup, permissionStatus: 'granted', token };
}