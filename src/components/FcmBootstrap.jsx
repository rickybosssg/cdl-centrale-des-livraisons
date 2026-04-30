/**
 * FcmBootstrap — Initialisation FCM 100% non-bloquante
 *
 * RÈGLES ABSOLUES (NE PAS MODIFIER) :
 * 1. FCM ne bloque JAMAIS l'app — tout s'exécute en setTimeout après 4s
 * 2. Aucune erreur FCM ne se propage — tout est catché silencieusement
 * 3. userEmail absent → on résout via base44.auth.me() en arrière-plan
 * 4. addListener() AVANT register() — règle Capacitor obligatoire
 * 5. register() appelé à chaque lancement (Firebase est idempotent)
 */

import { useEffect, useRef } from 'react';
import { saveFcmToken } from '@/lib/fcmApi';
import { base44 } from '@/api/base44Client';

function isNativePlatform() {
  try {
    if (typeof window === 'undefined') return false;
    if (window.location?.protocol === 'capacitor:') return true;
    if (window.Capacitor?.isNativePlatform?.() === true) return true;
  } catch (_) {}
  return false;
}

export default function FcmBootstrap({ userEmail }) {
  const didRun = useRef(false);

  useEffect(() => {
    // Une seule exécution au mount — indépendant de userEmail
    if (didRun.current) return;
    didRun.current = true;

    console.log('[FCM] INIT SCHEDULED (delay 4s) | native:', isNativePlatform());

    // Délai 4s — l'app doit être rendue et l'auth stabilisée avant FCM
    const timer = setTimeout(async () => {
      try {
        console.log('[FCM] INIT START');

        // Résoudre l'email : prop ou SDK en background
        let email = userEmail;
        if (!email) {
          try {
            const me = await Promise.race([
              base44.auth.me(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
            ]);
            email = me?.email;
          } catch (_) {
            console.log('[FCM] ERROR NON BLOCKING — email resolution failed');
          }
        }

        if (!email) {
          console.log('[FCM] ERROR NON BLOCKING — no email, FCM skipped');
          return;
        }

        if (isNativePlatform()) {
          await initNative(email);
        } else {
          await initWeb(email);
        }
      } catch (err) {
        console.log('[FCM] ERROR NON BLOCKING:', err?.message);
      }
    }, 4000);

    return () => clearTimeout(timer);
  }, []); // Volontairement sans dépendance — une seule exécution au mount

  return null;
}

// ── Init natif Capacitor ──────────────────────────────────────────────────────
async function initNative(userEmail) {
  let PushNotifications;
  try {
    const mod = await import('@capacitor/push-notifications');
    PushNotifications = mod.PushNotifications;
  } catch (e) {
    console.log('[FCM] ERROR NON BLOCKING — Capacitor plugin unavailable:', e?.message);
    return;
  }

  // Canal Android
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

  // Permission
  let perm;
  try {
    const check = await PushNotifications.checkPermissions();
    perm = check.receive;
    if (perm !== 'granted') {
      const req = await PushNotifications.requestPermissions();
      perm = req.receive;
    }
  } catch (e) {
    console.log('[FCM] ERROR NON BLOCKING — permission check failed:', e?.message);
    return;
  }

  if (perm !== 'granted') {
    console.log('[FCM] ERROR NON BLOCKING — permission denied:', perm);
    return;
  }

  // Listeners AVANT register() — règle Capacitor obligatoire
  const listeners = [];
  try {
    listeners.push(await PushNotifications.addListener('registration', async (tokenData) => {
      const token = tokenData?.value;
      console.log('[FCM] TOKEN RECEIVED:', token ? token.slice(0, 25) + '...' : 'EMPTY');
      if (!token) return;

      try {
        // Résoudre email si nécessaire (closure peut avoir email null en edge case)
        let finalEmail = userEmail;
        if (!finalEmail) {
          try { const me = await base44.auth.me(); finalEmail = me?.email; } catch (_) {}
        }
        if (!finalEmail) { console.log('[FCM] ERROR NON BLOCKING — no email for token save'); return; }

        const result = await saveFcmToken({ user_email: finalEmail, token, device_type: 'android_native' });
        if (result?.success) {
          console.log('[FCM] TOKEN SAVED | action:', result.action);
        } else {
          console.log('[FCM] ERROR NON BLOCKING — token save failed:', result?.error);
        }
      } catch (e) {
        console.log('[FCM] ERROR NON BLOCKING — token save exception:', e?.message);
      }

      for (const l of listeners) { try { await l.remove(); } catch (_) {} }
    }));

    listeners.push(await PushNotifications.addListener('registrationError', (err) => {
      console.log('[FCM] ERROR NON BLOCKING — registrationError:', JSON.stringify(err));
      for (const l of listeners) { try { l.remove(); } catch (_) {} }
    }));

    listeners.push(await PushNotifications.addListener('pushNotificationReceived', (notif) => {
      const route = notif?.data?.notif_route || notif?.data?.route || null;
      try {
        import('sonner').then(({ toast }) => {
          toast(notif?.title || 'CDL', {
            description: notif?.body || '',
            duration: 8000,
            action: route ? { label: 'Voir', onClick: () => window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } })) } : undefined,
          });
        });
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      } catch (_) {}
    }));

    listeners.push(await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      try {
        const data = action.notification?.data || {};
        const route = data.notif_route || data.route || data.target_screen || null;
        if (route?.startsWith('/')) {
          try { sessionStorage.setItem('cdl_notif_route', route); } catch (_) {}
          window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } }));
        }
      } catch (_) {}
    }));
  } catch (e) {
    console.log('[FCM] ERROR NON BLOCKING — listener attachment failed:', e?.message);
    return;
  }

  // register() — toujours forcé, Firebase est idempotent
  console.log('[FCM] REGISTER CALLED');
  try {
    await PushNotifications.register();
  } catch (e) {
    console.log('[FCM] ERROR NON BLOCKING — register() failed:', e?.message);
  }
}

// ── Init web (PWA) ────────────────────────────────────────────────────────────
async function initWeb(userEmail) {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const { registerSW } = await import('@/lib/swRegister');
    await registerSW();
    const { requestWebPushToken, onForegroundMessage } = await import('@/lib/webPush');
    const { token } = await requestWebPushToken();
    if (!token) return;

    console.log('[FCM] TOKEN RECEIVED (web)');
    const result = await saveFcmToken({ user_email: userEmail, token, device_type: 'web' });
    console.log('[FCM] TOKEN SAVED (web) | action:', result?.action);

    onForegroundMessage((payload) => {
      try {
        const notif = payload.notification || {};
        const data = payload.data || {};
        const route = data.notif_route || data.route || data.target_screen || null;
        import('sonner').then(({ toast }) => {
          toast(notif.title || 'CDL', {
            description: notif.body || '',
            duration: 8000,
            action: route ? { label: 'Voir', onClick: () => window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } })) } : undefined,
          });
        });
      } catch (_) {}
    });
  } catch (err) {
    console.log('[FCM] ERROR NON BLOCKING (web):', err?.message);
  }
}