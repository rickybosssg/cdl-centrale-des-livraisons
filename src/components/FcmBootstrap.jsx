/**
 * FcmBootstrap — Initialisation FCM 100% non-bloquante
 *
 * RÈGLES ABSOLUES (NE PAS MODIFIER) :
 * 1. FCM ne bloque JAMAIS l'app — tout s'exécute après 3s de délai
 * 2. register() est appelé TOUJOURS, indépendamment de userEmail
 * 3. Si userEmail absent au moment du token → on tente de le résoudre via SDK
 * 4. addListener() AVANT register() — règle Capacitor obligatoire
 * 5. Chaque bloc est catché individuellement, aucune erreur ne se propage
 */

import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

function isNativePlatform() {
  try {
    if (typeof window === 'undefined') return false;
    // Protocole Capacitor — vérification la plus fiable
    if (window.location?.protocol === 'capacitor:') return true;
    // Capacitor global — UNIQUEMENT si isNativePlatform() retourne true
    // Ne pas se fier à window.Capacitor seul (présent même en WebView HTTPS)
    if (window.Capacitor?.isNativePlatform?.() === true && window.Capacitor?.getPlatform?.() === 'android') return true;
  } catch (_) {}
  return false;
}

const APP_BASE_URL = 'https://cdl.base44.app';

/**
 * Sauvegarde le token FCM via l'endpoint public (pas besoin d'auth).
 * Requiert user_email + token.
 */
async function saveFcmTokenRemote({ user_email, token, device_type = 'android_native' }) {
  if (!user_email || !token) {
    console.log('[FCM] saveFcmTokenRemote: user_email ou token manquant — skip');
    return { success: false };
  }
  try {
    const res = await fetch(`${APP_BASE_URL}/functions/saveFcmTokenPublic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_email, token, device_type }),
    });
    const data = await res.json().catch(() => ({}));
    return data;
  } catch (err) {
    console.log('[FCM] ERROR NON BLOCKING — saveFcmTokenRemote:', err?.message);
    return { success: false };
  }
}

/**
 * Résoudre l'email de l'utilisateur courant via SDK (avec timeout 6s).
 */
async function resolveEmail(propEmail) {
  if (propEmail) return propEmail;
  try {
    const me = await Promise.race([
      base44.auth.me(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
    ]);
    return me?.email || null;
  } catch (_) {
    return null;
  }
}

export default function FcmBootstrap({ userEmail }) {
  const didRun = useRef(false);
  // Stocker le token reçu avant que l'email soit résolu
  const pendingTokenRef = useRef(null);

  useEffect(() => {
    // Une seule exécution au mount — volontairement indépendant de userEmail
    if (didRun.current) return;
    didRun.current = true;

    console.log('[FCM] INIT SCHEDULED (delay 3s)');

    const timer = setTimeout(() => {
      // Re-évaluer isNativePlatform() après 3s — Capacitor est forcément initialisé
      const native = isNativePlatform();
      console.log('[FCM] PLATFORM CHECK (after 3s) | native:', native, '| protocol:', window.location?.protocol, '| Capacitor:', !!window.Capacitor, '| email:', userEmail || 'none');

      if (native) {
        runNativeFcm(userEmail, pendingTokenRef).catch(err => {
          console.log('[FCM] ERROR NON BLOCKING (top-level):', err?.message);
        });
      } else {
        runWebFcm(userEmail).catch(err => {
          console.log('[FCM] ERROR NON BLOCKING (web):', err?.message);
        });
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, []); // Dépendances vides : une seule exécution au mount

  return null;
}

// ── FCM Natif Capacitor ───────────────────────────────────────────────────────
async function runNativeFcm(propEmail, pendingTokenRef) {
  console.log('[FCM] INIT START (native)');

  // 1. Charger le plugin
  let PushNotifications;
  try {
    const mod = await import('@capacitor/push-notifications');
    PushNotifications = mod.PushNotifications;
    console.log('[FCM] Plugin PushNotifications chargé ✅');
  } catch (e) {
    console.log('[FCM] ERROR NON BLOCKING — Plugin indisponible:', e?.message);
    return;
  }

  // 2. Canal Android
  try {
    await PushNotifications.createChannel({
      id: 'default',
      name: 'CDL Notifications',
      importance: 5,
      sound: 'default',
      vibration: true,
      lights: true,
    });
  } catch (_) {}

  // 3. Permission
  let perm;
  try {
    const check = await PushNotifications.checkPermissions();
    perm = check.receive;
    console.log('[FCM] Permission actuelle:', perm);
    if (perm !== 'granted') {
      const req = await PushNotifications.requestPermissions();
      perm = req.receive;
      console.log('[FCM] Permission après demande:', perm);
    }
  } catch (e) {
    console.log('[FCM] ERROR NON BLOCKING — checkPermissions:', e?.message);
    return;
  }

  if (perm !== 'granted') {
    console.log('[FCM] ERROR NON BLOCKING — Permission refusée:', perm);
    return;
  }

  // 4. Listeners AVANT register() — règle Capacitor OBLIGATOIRE
  const listeners = [];
  try {
    listeners.push(await PushNotifications.addListener('registration', async (tokenData) => {
      const token = tokenData?.value;
      console.log('[FCM] TOKEN RECEIVED:', token ? (token.slice(0, 30) + '...') : 'VIDE');
      if (!token) {
        console.log('[FCM] ERROR NON BLOCKING — token vide dans registration event');
        return;
      }

      // Stocker le token en cas d'email non disponible
      if (pendingTokenRef) pendingTokenRef.current = token;

      // Résoudre l'email (prop ou SDK)
      const email = await resolveEmail(propEmail);
      console.log('[FCM] Email résolu:', email || 'NONE');

      if (!email) {
        console.log('[FCM] ERROR NON BLOCKING — email introuvable, token non sauvegardé. Réessayer plus tard.');
        return;
      }

      // Sauvegarder le token
      const result = await saveFcmTokenRemote({ user_email: email, token, device_type: 'android_native' });
      if (result?.success) {
        console.log('[FCM] TOKEN SAVED IN DB | action:', result.action, '| id:', result.token_id);
      } else {
        console.log('[FCM] ERROR NON BLOCKING — sauvegarde échouée:', result?.error);
      }

      // Nettoyer les listeners
      for (const l of listeners) { try { await l.remove(); } catch (_) {} }
    }));

    listeners.push(await PushNotifications.addListener('registrationError', (err) => {
      console.log('[FCM] ERROR NON BLOCKING — registrationError:', JSON.stringify(err));
      for (const l of listeners) { try { l.remove(); } catch (_) {} }
    }));

    listeners.push(await PushNotifications.addListener('pushNotificationReceived', (notif) => {
      try {
        // Data-Only message : title/body sont dans notif.data (pas notif.title/body)
        const title = notif?.title || notif?.data?.title || 'CDL';
        const body = notif?.body || notif?.data?.body || '';
        const route = notif?.data?.notif_route || notif?.data?.route || null;
        console.log('[FCM] Foreground notif — title:', title, '| route:', route);
        import('sonner').then(({ toast }) => {
          toast(title, {
            description: body,
            duration: 8000,
            action: route ? {
              label: 'Voir',
              onClick: () => window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } }))
            } : undefined,
          });
        }).catch(() => {});
        try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (_) {}
      } catch (_) {}
    }));

    listeners.push(await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      try {
        const data = action.notification?.data || {};
        // Data-Only : title/body/notif_route sont tous dans data
        const route = data.notif_route || data.route || data.target_screen || null;
        console.log('[FCM] Tap notif — route:', route, '| data:', JSON.stringify(data));
        if (route?.startsWith('/')) {
          try { sessionStorage.setItem('cdl_notif_route', route); } catch (_) {}
          window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } }));
        }
      } catch (_) {}
    }));

    console.log('[FCM] Listeners attachés ✅ |', listeners.length, 'listeners');
  } catch (e) {
    console.log('[FCM] ERROR NON BLOCKING — listeners failed:', e?.message);
    return;
  }

  // 5. register() — TOUJOURS appelé, Firebase est idempotent
  console.log('[FCM] REGISTER CALLED');
  try {
    await PushNotifications.register();
    console.log('[FCM] register() OK — en attente callback...');
  } catch (e) {
    console.log('[FCM] ERROR NON BLOCKING — register() échoué:', e?.message);
  }
}

// ── FCM Web (PWA) ─────────────────────────────────────────────────────────────
async function runWebFcm(propEmail) {
  console.log('[FCM] INIT START (web)');
  try {
    if (!('Notification' in window)) {
      console.log('[FCM] ERROR NON BLOCKING — API Notification absente (normal sur APK)');
      return;
    }
    if (Notification.permission !== 'granted') {
      console.log('[FCM] Permission web non accordée:', Notification.permission);
      return;
    }

    const { registerSW } = await import('@/lib/swRegister');
    await registerSW();

    const { requestWebPushToken, onForegroundMessage } = await import('@/lib/webPush');
    const { token } = await requestWebPushToken();
    if (!token) {
      console.log('[FCM] ERROR NON BLOCKING — pas de token web push');
      return;
    }

    console.log('[FCM] TOKEN RECEIVED (web)');

    const email = await resolveEmail(propEmail);
    if (!email) {
      console.log('[FCM] ERROR NON BLOCKING — email introuvable (web)');
      return;
    }

    const result = await saveFcmTokenRemote({ user_email: email, token, device_type: 'web' });
    if (result?.success) {
      console.log('[FCM] TOKEN SAVED IN DB (web) | action:', result.action);
    }

    onForegroundMessage((payload) => {
      try {
        const notif = payload.notification || {};
        const data = payload.data || {};
        const route = data.notif_route || data.route || data.target_screen || null;
        import('sonner').then(({ toast }) => {
          toast(notif.title || 'CDL', {
            description: notif.body || '',
            duration: 8000,
            action: route ? {
              label: 'Voir',
              onClick: () => window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } }))
            } : undefined,
          });
        }).catch(() => {});
      } catch (_) {}
    });
  } catch (err) {
    console.log('[FCM] ERROR NON BLOCKING (web):', err?.message);
  }
}