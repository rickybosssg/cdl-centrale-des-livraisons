/**
 * FcmBootstrap — Initialisation FCM 100% crash-proof + Token Management
 *
 * RÈGLES :
 * 1. À CHAQUE DÉMARRAGE APP → récupérer + enregistrer le token FCM actuel
 * 2. Nettoyer les tokens inactifs/dupliqués (ancien par user_id + device_id)
 * 3. Vérifier permission POST_NOTIFICATIONS (Android 13+)
 * 4. Vérifier channel Android "default" avec HIGH importance
 * 5. Listener complets : registration + registrationError + push received + tap
 * 6. Logs détaillés pour diagnostic
 */

import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

const APP_BASE_URL = 'https://cdl.base44.app';
const FCM_DELAY_MS = 3000; // 3s — délai minimal de stabilisation

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
  if (!user_email || !token) {
    console.error('[FCM] ❌ Missing email or token');
    return { success: false };
  }
  try {
    console.log('[FCM] 💾 Saving token to backend...');
    const res = await fetch(`${APP_BASE_URL}/functions/saveFcmTokenPublic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_email, token, device_type }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.success) {
      console.log('[FCM] ✅ Token saved successfully');
      return data;
    }
    console.error('[FCM] ❌ Token save failed:', data?.error || 'Unknown error');
    return { success: false };
  } catch (err) {
    console.error('[FCM] ❌ Token save network error:', err?.message);
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
  } catch (e) {
    console.warn('[FCM] Could not resolve email:', e?.message);
    return null;
  }
}

export default function FcmBootstrap({ userEmail }) {
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    const native = isNativePlatform();
    console.log('[FCM] Bootstrap scheduled (delay', FCM_DELAY_MS / 1000, 's | native:', native, '| email:', userEmail || 'none');

    const timer = setTimeout(async () => {
      console.log('[FCM] Bootstrap starting...');
      try {
        if (native) {
          await safeRunNativeFcm(userEmail);
        } else {
          await safeRunWebFcm(userEmail);
        }
      } catch (err) {
        console.error('[FCM] ❌ Bootstrap catastrophic error (app continues):', err?.message);
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
      console.error('[FCM] ❌ Native error (app continues):', err?.message);
    });
  } catch (err) {
    console.error('[FCM] ❌ Native sync error (app continues):', err?.message);
  }
}

async function runNativeFcm(propEmail) {
  console.log('[FCM] Native init start');

  let PushNotifications;
  try {
    const mod = await import('@capacitor/push-notifications');
    PushNotifications = mod.PushNotifications;
    if (!PushNotifications) throw new Error('PushNotifications is null');
    console.log('[FCM] ✅ Plugin loaded');
  } catch (e) {
    console.error('[FCM] ❌ Plugin unavailable:', e?.message);
    return;
  }

  // ── Create channel ──────────────────────────────────────────────────────────
  try {
    await Promise.race([
      PushNotifications.createChannel({
        id: 'default',
        name: 'CDL Notifications',
        importance: 5,
        sound: 'default',
        vibration: true,
        lights: true,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ]);
    console.log('[FCM] ✅ Channel created');
  } catch (e) {
    console.warn('[FCM] ⚠️ Channel creation error:', e?.message);
  }

  // ── Check permission (JAMAIS demander ici) ─────────────────────────────────
  let perm = 'unknown';
  try {
    const check = await Promise.race([
      PushNotifications.checkPermissions(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ]);
    perm = check?.receive || 'unknown';
    console.log('[FCM] Permission status:', perm);
  } catch (e) {
    console.error('[FCM] ❌ checkPermissions error:', e?.message);
    return;
  }

  // ── JAMAIS appeler requestPermissions() ici — cause crash WebView ───────────
  if (perm !== 'granted') {
    console.log('[FCM] ⚠️ Permission not granted (' + perm + ') — skipping register()');
    console.log('[FCM] 💡 Permission must be requested in PermissionsOnboarding only');
    return;
  }

  const listeners = [];

  // ── Attach listeners AVANT register() (règle Capacitor obligatoire) ─────────
  try {
    console.log('[FCM] Attaching listeners...');

    const regListener = await PushNotifications.addListener('registration', (tokenData) => {
      // SYNCHRONE try/catch pour éviter unhandled promise rejection
      try {
        const token = tokenData?.value;
        if (token && typeof token === 'string') {
          console.log('[FCM] ✅ registration callback fired');
          console.log('[FCM] 🔑 Token received (len:' + token.length + '):', token.slice(0, 50) + '...');
          handleTokenReceived(token, propEmail, listeners).catch((err) => {
            console.error('[FCM] ❌ handleTokenReceived error:', err?.message);
          });
        } else {
          console.error('[FCM] ❌ Token empty or invalid:', tokenData);
        }
      } catch (e) {
        console.error('[FCM] ❌ registration callback crash:', e?.message);
      }
    });
    listeners.push(regListener);
    console.log('[FCM] ✅ Listener "registration" attached');

    const errListener = await PushNotifications.addListener('registrationError', (err) => {
      try {
        const msg = typeof err === 'string' ? err : JSON.stringify(err);
        console.error('[FCM] ❌ registrationError fired:', msg);
        // Store error globally for diagnostic
        try { sessionStorage.setItem('cdl_fcm_reg_error', msg); } catch (_) {}
      } catch (_) {}
    });
    listeners.push(errListener);
    console.log('[FCM] ✅ Listener "registrationError" attached');

    const fgListener = await PushNotifications.addListener('pushNotificationReceived', (notif) => {
      try {
        console.log('[FCM] 📬 pushNotificationReceived fired');
        console.log('[FCM] 📬 Foreground notif:', notif?.title || 'N/A');
        handleForegroundNotif(notif);
      } catch (e) {
        console.warn('[FCM] Foreground handler error:', e?.message);
      }
    });
    listeners.push(fgListener);
    console.log('[FCM] ✅ Listener "pushNotificationReceived" attached');

    const tapListener = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      try {
        console.log('[FCM] 👆 pushNotificationActionPerformed fired');
        console.log('[FCM] 👆 Notification tap detected');
        handleNotifTap(action);
      } catch (e) {
        console.warn('[FCM] Tap handler error:', e?.message);
      }
    });
    listeners.push(tapListener);
    console.log('[FCM] ✅ Listener "pushNotificationActionPerformed" attached');

    console.log('[FCM] ✅ Listeners attached:', listeners.length);
  } catch (e) {
    console.error('[FCM] ❌ addListener crash:', e?.message);
    for (const l of listeners) {
      try { l.remove(); } catch (_) {}
    }
    return;
  }

  // ── Call register() (maintenant que les listeners sont prêts) ────────────────
  try {
    console.log('[FCM] 📢 Calling register()...');
    await Promise.race([
      PushNotifications.register(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('register() timeout')), 10000))
    ]);
    console.log('[FCM] ✅ register() OK — waiting for token callback...');
  } catch (e) {
    console.error('[FCM] ❌ register() error:', e?.message);
  }

  // NOTE : On ne nettoie PAS les listeners push — ils doivent rester actifs toute la vie de l'app.
  // Seul le listener 'registration' peut être nettoyé après réception du token (fait dans handleTokenReceived).
  console.log('[FCM] ✅ Listeners push actifs — pas de cleanup (durée de vie = app)');
}

async function handleTokenReceived(token, propEmail, listeners) {
  try {
    if (!token) {
      console.error('[FCM] ❌ Empty token in handleTokenReceived');
      return;
    }

    const email = await resolveEmail(propEmail);
    if (!email) {
      console.error('[FCM] ❌ Could not resolve email — token NOT saved');
      return;
    }

    console.log('[FCM] 📧 Email resolved:', email);
    console.log('[FCM] 🔑 Token received (len=' + token.length + '):', token.slice(0, 50) + '...');

    // Device type (Android native)
    const deviceId = 'android_native';
    console.log('[FCM] 📱 Device Type:', deviceId);

    const result = await saveFcmTokenRemote({ 
      user_email: email, 
      token, 
      device_type: 'android_native',
      device_id: deviceId 
    });

    if (result?.success) {
      console.log('[FCM] ✅ Token saved to DB successfully | ID:', result.token_id);
      console.log('[FCM] 🔄 Action:', result.action, '| Old token cleaned:', result.old_token_removed ? 'YES' : 'NO');
    } else {
      console.error('[FCM] ❌ Token save failed:', result?.error);
    }
    // NOTE : On ne supprime PAS les listeners — pushNotificationReceived et pushNotificationActionPerformed
    // doivent rester actifs toute la durée de vie de l'app pour recevoir les notifications.
  } catch (err) {
    console.error('[FCM] ❌ handleTokenReceived error:', err?.message);
  }
}

function handleForegroundNotif(notif) {
  try {
    const title = notif?.title || notif?.data?.title || 'CDL';
    const body = notif?.body || notif?.data?.body || '';
    const route = notif?.data?.notif_route || notif?.data?.route || null;
    console.log('[FCM] 📬 Foreground notif:', title, '| body:', body.slice(0, 50), '| route:', route);
    
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (_) {}

    // Afficher un toast dans l'app (foreground)
    import('sonner').then(({ toast }) => {
      toast(title, {
        description: body,
        duration: 8000,
        action: route ? {
          label: 'Voir',
          onClick: () => {
            try { sessionStorage.setItem('cdl_notif_route', route); } catch (_) {}
            window.dispatchEvent(new CustomEvent('cdl_navigate', { detail: { route } }));
          }
        } : undefined,
      });
    }).catch(() => {});
  } catch (_) {}
}

function handleNotifTap(action) {
  try {
    const data = action?.notification?.data || {};
    const route = data.notif_route || data.route || data.target_screen || null;
    console.log('[FCM] Notification tap | route:', route);
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
      console.error('[FCM] ❌ Web error (app continues):', err?.message);
    });
  } catch (err) {
    console.error('[FCM] ❌ Web sync error (app continues):', err?.message);
  }
}

async function runWebFcm(propEmail) {
  console.log('[FCM] Web init start');
  try {
    if (!('Notification' in window)) {
      console.log('[FCM] Notification API not available');
      return;
    }
    if (Notification.permission !== 'granted') {
      console.log('[FCM] Web permission not granted:', Notification.permission);
      return;
    }

    const { registerSW } = await import('@/lib/swRegister');
    await registerSW();

    const { requestWebPushToken, onForegroundMessage } = await import('@/lib/webPush');
    const { token } = await requestWebPushToken();
    if (!token) {
      console.log('[FCM] No web push token');
      return;
    }

    const email = await resolveEmail(propEmail);
    if (!email) {
      console.log('[FCM] Web email not resolved');
      return;
    }

    await saveFcmTokenRemote({ user_email: email, token, device_type: 'web' });

    onForegroundMessage((payload) => {
      try {
        const notif = payload?.notification || {};
        import('sonner').then(({ toast }) => {
          toast(notif.title || 'CDL', { description: notif.body || '', duration: 8000 });
        }).catch(() => {});
      } catch (_) {}
    });

    console.log('[FCM] Web init done');
  } catch (err) {
    console.error('[FCM] Web init error (app continues):', err?.message);
  }
}