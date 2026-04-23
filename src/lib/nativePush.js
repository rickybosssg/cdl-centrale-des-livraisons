/**
 * nativePush.js — Capacitor Firebase Push Notifications (APK Android natif)
 *
 * v3 — Corrections crash Android :
 * - requestPermissions() et register() jamais sans try/catch
 * - Pas de double listener (guard interne)
 * - requestNativePushToken() entièrement sécurisé
 */

// ── Guard global pour éviter double init ─────────────────────────────────────
let _pushInitialized = false;
let _PushNotifications = null;

export function isNativeApp() {
  if (typeof window === 'undefined') return false;
  if (window.location?.protocol === 'capacitor:') return true;
  if (window.Capacitor?.isNativePlatform?.() === true) return true;
  if (typeof window.Capacitor !== 'undefined') return true;
  return false;
}

export function waitForCapacitor(timeoutMs = 3000) {
  return new Promise((resolve) => {
    if (isNativeApp()) return resolve(true);
    const start = Date.now();
    const check = () => {
      if (isNativeApp()) return resolve(true);
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(check, 100);
    };
    check();
  });
}

// ── Charger le plugin une seule fois ─────────────────────────────────────────
async function getPushPlugin() {
  if (_PushNotifications) return _PushNotifications;
  try {
    const mod = await import('@capacitor/push-notifications');
    _PushNotifications = mod.PushNotifications;
    return _PushNotifications;
  } catch (err) {
    console.warn('[NativePush] Plugin non disponible:', err?.message);
    return null;
  }
}

// ── Canal Android ─────────────────────────────────────────────────────────────
async function createAndroidChannels(PN) {
  try {
    await PN.createChannel({
      id: 'default',
      name: 'CDL Notifications',
      description: 'Toutes les notifications CDL',
      importance: 5,
      sound: 'default',
      vibration: true,
      lights: true,
      lightColor: '#1a73e8',
    });
    console.log('[NativePush] ✅ Canal "default" créé');
  } catch (err) {
    // Non bloquant — canal peut déjà exister
    console.warn('[NativePush] createChannel (ignoré):', err?.message);
  }
}

/**
 * initCapacitorPush — appelé une SEULE FOIS au démarrage par AppLayoutWrapper.
 * Enregistre les listeners permanents (token, foreground, tap).
 * Ne crashe jamais — toutes les étapes sont dans try/catch.
 */
export async function initCapacitorPush({ onToken, onForegroundNotif, onNotificationTap, onPermissionDenied }) {
  if (!isNativeApp()) {
    return { cleanup: () => {}, permissionStatus: 'not_native' };
  }

  // Guard : ne pas initialiser deux fois
  if (_pushInitialized) {
    console.log('[NativePush] Déjà initialisé, skip');
    return { cleanup: () => {}, permissionStatus: 'already_initialized' };
  }

  const PN = await getPushPlugin();
  if (!PN) {
    return { cleanup: () => {}, permissionStatus: 'unavailable' };
  }

  console.log('[NativePush] ── INIT START ──');

  // Canal Android
  await createAndroidChannels(PN);

  // Permission
  let permStatus = 'prompt';
  try {
    const check = await PN.checkPermissions();
    permStatus = check.receive;
    console.log('[NativePush] Permission actuelle:', permStatus);
  } catch (e) {
    console.warn('[NativePush] checkPermissions failed:', e?.message);
  }

  if (permStatus === 'denied') {
    console.warn('[NativePush] Permission refusée définitivement');
    if (onPermissionDenied) onPermissionDenied('denied');
    return { cleanup: () => {}, permissionStatus: 'denied' };
  }

  if (permStatus !== 'granted') {
    try {
      const req = await PN.requestPermissions();
      permStatus = req.receive;
      console.log('[NativePush] Permission demandée:', permStatus);
    } catch (e) {
      console.error('[NativePush] requestPermissions error:', e?.message);
      if (onPermissionDenied) onPermissionDenied('request_error');
      return { cleanup: () => {}, permissionStatus: 'error' };
    }

    if (permStatus !== 'granted') {
      if (onPermissionDenied) onPermissionDenied('user_denied');
      return { cleanup: () => {}, permissionStatus: 'user_denied' };
    }
  }

  // Listeners
  const listeners = [];

  try {
    const tokenL = await PN.addListener('registration', (token) => {
      const val = token?.value;
      console.log('[NativePush] ✅ Token FCM:', val ? val.slice(0, 20) + '…' : 'VIDE');
      if (onToken && val) onToken(val);
    });
    listeners.push(tokenL);

    const errL = await PN.addListener('registrationError', (err) => {
      console.error('[NativePush] ❌ registrationError:', JSON.stringify(err));
    });
    listeners.push(errL);

    const fgL = await PN.addListener('pushNotificationReceived', (notif) => {
      console.log('[NativePush] 📬 Foreground:', notif?.title);
      if (onForegroundNotif) onForegroundNotif(notif);
    });
    listeners.push(fgL);

    const tapL = await PN.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification?.data || {};
      const route = data.notif_route || data.route || data.target_screen || null;
      console.log('[NativePush] 👆 Tap → route:', route);
      if (onNotificationTap) onNotificationTap({ route, data });
      if (route?.startsWith('/')) {
        try { sessionStorage.setItem('cdl_notif_route', route); } catch (_) {}
      }
    });
    listeners.push(tapL);

    console.log('[NativePush] ✅ Listeners OK');
  } catch (e) {
    console.error('[NativePush] addListener error:', e?.message);
  }

  // register()
  try {
    await PN.register();
    console.log('[NativePush] ✅ register() OK — attente token...');
    _pushInitialized = true;
  } catch (e) {
    console.error('[NativePush] ❌ register() error:', e?.message);
    return { cleanup: () => {}, permissionStatus: 'register_error' };
  }

  const cleanup = async () => {
    _pushInitialized = false;
    for (const l of listeners) {
      try { await l.remove(); } catch (_) {}
    }
  };

  return { cleanup, permissionStatus: 'granted' };
}

/**
 * requestNativePushToken — appelé par FcmDiagnostic bouton "Enregistrer".
 * Sécurisé contre tous les crashs natifs Android.
 * Retourne le token string ou null.
 */
export async function requestNativePushToken() {
  if (!isNativeApp()) return null;

  const PN = await getPushPlugin();
  if (!PN) {
    console.error('[NativePush] requestNativePushToken: plugin non disponible');
    return null;
  }

  // Canal Android
  await createAndroidChannels(PN);

  // Permission — TOUJOURS dans try/catch
  let permStatus = 'prompt';
  try {
    const check = await PN.checkPermissions();
    permStatus = check.receive;
  } catch (e) {
    console.warn('[NativePush] checkPermissions failed:', e?.message);
  }

  if (permStatus !== 'granted') {
    try {
      const req = await PN.requestPermissions();
      permStatus = req.receive;
      console.log('[NativePush] Permission demandée:', permStatus);
    } catch (e) {
      console.error('[NativePush] requestPermissions crash:', e?.message);
      return null;
    }
  }

  if (permStatus !== 'granted') {
    console.warn('[NativePush] Permission non accordée:', permStatus);
    return null;
  }

  // Attendre le token via Promise avec timeout 25s
  return new Promise((resolve) => {
    let settled = false;
    let regHandle = null;
    let errHandle = null;

    const finish = (token) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { regHandle?.remove?.(); } catch (_) {}
      try { errHandle?.remove?.(); } catch (_) {}
      resolve(token ?? null);
    };

    const timer = setTimeout(() => {
      console.warn('[NativePush] Timeout 25s — token non reçu');
      finish(null);
    }, 25000);

    // Ajouter listeners + register dans un IIFE async isolé
    // pour que l'exception éventuelle ne remonte pas et crashe l'app
    (async () => {
      try {
        regHandle = await PN.addListener('registration', (t) => {
          console.log('[NativePush] ✅ Token via requestNativePushToken:', t?.value?.slice(0, 20));
          finish(t?.value || null);
        });

        errHandle = await PN.addListener('registrationError', (err) => {
          console.error('[NativePush] registrationError:', JSON.stringify(err));
          finish(null);
        });

        // register() sans await pour éviter crash thread natif Android
        // Le résultat arrive toujours via les listeners ci-dessus
        try {
          await PN.register();
          console.log('[NativePush] register() lancé');
        } catch (regErr) {
          console.error('[NativePush] register() throw:', regErr?.message);
          finish(null);
        }

      } catch (outerErr) {
        console.error('[NativePush] IIFE error:', outerErr?.message);
        finish(null);
      }
    })();
  });
}

/**
 * getDeliveredNotifications — notifications reçues app fermée
 */
export async function getDeliveredNotifications() {
  if (!isNativeApp()) return [];
  try {
    const PN = await getPushPlugin();
    if (!PN) return [];
    const result = await PN.getDeliveredNotifications();
    return result.notifications || [];
  } catch (err) {
    console.warn('[NativePush] getDeliveredNotifications error:', err?.message);
    return [];
  }
}

/**
 * getPermissionStatus
 */
export async function getPermissionStatus() {
  if (!isNativeApp()) return 'not_native';
  try {
    const PN = await getPushPlugin();
    if (!PN) return 'unknown';
    const result = await PN.checkPermissions();
    return result.receive;
  } catch (_) {
    return 'unknown';
  }
}