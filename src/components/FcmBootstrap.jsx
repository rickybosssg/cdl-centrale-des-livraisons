/**
 * FcmBootstrap — Initialisation FCM 100% non-bloquante, anti-crash APK
 *
 * RÈGLES ABSOLUES :
 * 1. Démarre 20s après le mount (permissions onboarding terminé depuis longtemps)
 * 2. JAMAIS de throw vers l'extérieur — chaque bloc est catché individuellement
 * 3. Les callbacks Capacitor (addListener) sont wrappés dans try/catch SYNCHRONE
 *    pour éviter les unhandled promise rejections qui crashent la WebView
 * 4. Ne fait que checkPermissions() — jamais requestPermissions() ici
 * 5. Une seule exécution au mount (didRun guard)
 */

import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

const APP_BASE_URL = 'https://cdl.base44.app';
const FCM_DELAY_MS = 45000; // 45s — laisser le dashboard se stabiliser complètement avant FCM

function isNativePlatform() {
  try {
    if (typeof window === 'undefined') return false;
    if (window.location?.protocol === 'capacitor:') return true;
    if (window.location?.protocol === 'file:') return true;
    if (typeof window.Capacitor !== 'undefined' && window.Capacitor?.getPlatform?.() === 'android') return true;
  } catch (_) {}
  return false;
}

async function saveFcmTokenRemote({ user_email, token, device_type = 'android_native' }) {
  if (!user_email || !token) return { success: false };
  try {
    const res = await fetch(`${APP_BASE_URL}/functions/saveFcmTokenPublic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_email, token, device_type }),
    });
    const data = await res.json().catch(() => ({}));
    console.log('[FCM] token saved | action:', data?.action);
    return data;
  } catch (err) {
    console.log('[FCM] save error (non-fatal):', err?.message);
    return { success: false };
  }
}

async function resolveEmail(propEmail) {
  if (propEmail) return propEmail;
  try {
    const me = await Promise.race([
      base44.auth.me(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ]);
    return me?.email || null;
  } catch (_) {
    return null;
  }
}

export default function FcmBootstrap({ userEmail }) {
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    console.log('[FCM] scheduled (delay', FCM_DELAY_MS / 1000, 's)');

    const timer = setTimeout(() => {
      const native = isNativePlatform();
      console.log('[FCM] bootstrap start | native:', native, '| email:', userEmail || 'none');

      if (native) {
        safeRunNativeFcm(userEmail);
      } else {
        safeRunWebFcm(userEmail);
      }
    }, FCM_DELAY_MS);

    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

// ─── NATIVE FCM ──────────────────────────────────────────────────────────────

function safeRunNativeFcm(propEmail) {
  try {
    runNativeFcm(propEmail).catch((err) => {
      console.log('[FCM] native error (non-fatal):', err?.message);
    });
  } catch (err) {
    console.log('[FCM] native sync error (non-fatal):', err?.message);
  }
}

async function runNativeFcm(propEmail) {
  console.log('[FCM] native init start');

  let PushNotifications;
  try {
    const mod = await import('@capacitor/push-notifications');
    PushNotifications = mod.PushNotifications;
    console.log('[FCM] plugin loaded');
  } catch (e) {
    console.log('[FCM] plugin unavailable (non-fatal):', e?.message);
    return;
  }

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

  let perm = 'unknown';
  try {
    const check = await PushNotifications.checkPermissions();
    perm = check?.receive || 'unknown';
    console.log('[FCM] permission status:', perm);
  } catch (e) {
    console.log('[FCM] checkPermissions error (non-fatal):', e?.message);
  }

  // CRITIQUE : Ne jamais appeler register() si permission pas déjà granted.
  // Afficher un dialog Android pendant que l'UI est active peut crasher la WebView.
  // La demande de permission est UNIQUEMENT le rôle de PermissionsOnboarding.
  if (perm !== 'granted') {
    console.log('[FCM] permission not granted:', perm, '— register() SKIPPED (no dialog from background)');
    return;
  }

  const listeners = [];

  try {
    const regListener = await PushNotifications.addListener('registration', (tokenData) => {
      handleTokenReceived(tokenData, propEmail, listeners).catch((err) => {
        console.log('[FCM] registration handler error (non-fatal):', err?.message);
      });
    });
    listeners.push(regListener);

    const errListener = await PushNotifications.addListener('registrationError', (err) => {
      try { console.log('[FCM] registrationError (non-fatal):', JSON.stringify(err)); } catch (_) {}
    });
    listeners.push(errListener);

    const fgListener = await PushNotifications.addListener('pushNotificationReceived', (notif) => {
      try { handleForegroundNotif(notif); } catch (_) {}
    });
    listeners.push(fgListener);

    const tapListener = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      try { handleNotifTap(action); } catch (_) {}
    });
    listeners.push(tapListener);

    console.log('[FCM] listeners attached:', listeners.length);
  } catch (e) {
    console.log('[FCM] addListener error (non-fatal):', e?.message);
    return;
  }

  try {
    console.log('[FCM] register() call');
    await PushNotifications.register();
    console.log('[FCM] register() OK — waiting for token callback...');
  } catch (e) {
    console.log('[FCM] register() error (non-fatal):', e?.message);
  }

  console.log('[FCM] native init done');
}

async function handleTokenReceived(tokenData, propEmail, listeners) {
  try {
    const token = tokenData?.value;
    if (!token) { console.log('[FCM] empty token — skip'); return; }
    console.log('[FCM] token received:', token.slice(0, 25) + '...');

    const email = await resolveEmail(propEmail);
    if (!email) { console.log('[FCM] email not resolved — token not saved'); return; }

    await saveFcmTokenRemote({ user_email: email, token, device_type: 'android_native' });

    for (const l of listeners) { try { await l.remove(); } catch (_) {} }
  } catch (err) {
    console.log('[FCM] handleTokenReceived error (non-fatal):', err?.message);
  }
}

function handleForegroundNotif(notif) {
  try {
    const title = notif?.title || notif?.data?.title || 'CDL';
    const body = notif?.body || notif?.data?.body || '';
    const route = notif?.data?.notif_route || notif?.data?.route || null;
    console.log('[FCM] foreground notif:', title, '| route:', route);
    import('sonner').then(({ toast }) => {
      toast(title, {
        description: body,
        duration: 8000,
        action: route ? {
          label: 'Voir',
          onClick: () => { try { window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } })); } catch (_) {} },
        } : undefined,
      });
    }).catch(() => {});
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (_) {}
  } catch (_) {}
}

function handleNotifTap(action) {
  try {
    const data = action?.notification?.data || {};
    const route = data.notif_route || data.route || data.target_screen || null;
    console.log('[FCM] notification tap | route:', route);
    if (route?.startsWith('/')) {
      try { sessionStorage.setItem('cdl_notif_route', route); } catch (_) {}
      window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } }));
    }
  } catch (_) {}
}

// ─── WEB FCM (PWA) ────────────────────────────────────────────────────────────

function safeRunWebFcm(propEmail) {
  try {
    runWebFcm(propEmail).catch((err) => {
      console.log('[FCM] web error (non-fatal):', err?.message);
    });
  } catch (err) {
    console.log('[FCM] web sync error (non-fatal):', err?.message);
  }
}

async function runWebFcm(propEmail) {
  console.log('[FCM] web init start');
  try {
    if (!('Notification' in window)) { console.log('[FCM] Notification API absent'); return; }
    if (Notification.permission !== 'granted') { console.log('[FCM] web permission not granted:', Notification.permission); return; }

    const { registerSW } = await import('@/lib/swRegister');
    await registerSW();

    const { requestWebPushToken, onForegroundMessage } = await import('@/lib/webPush');
    const { token } = await requestWebPushToken();
    if (!token) { console.log('[FCM] no web push token'); return; }
    console.log('[FCM] web token received');

    const email = await resolveEmail(propEmail);
    if (!email) { console.log('[FCM] web email not resolved'); return; }

    await saveFcmTokenRemote({ user_email: email, token, device_type: 'web' });

    onForegroundMessage((payload) => {
      try {
        const notif = payload?.notification || {};
        const data = payload?.data || {};
        const route = data.notif_route || data.route || null;
        import('sonner').then(({ toast }) => {
          toast(notif.title || 'CDL', {
            description: notif.body || '',
            duration: 8000,
            action: route ? {
              label: 'Voir',
              onClick: () => { try { window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } })); } catch (_) {} },
            } : undefined,
          });
        }).catch(() => {});
      } catch (_) {}
    });

    console.log('[FCM] web init done');
  } catch (err) {
    console.log('[FCM] web init error (non-fatal):', err?.message);
  }
}