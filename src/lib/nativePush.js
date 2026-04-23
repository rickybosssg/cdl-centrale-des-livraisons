/**
 * nativePush.js — Capacitor Firebase Push Notifications (APK Android natif)
 *
 * Architecture v4 :
 * - UN SEUL register() dans toute la vie de l'app (guard _registered)
 * - UN SEUL jeu de listeners actifs à la fois
 * - requestNativePushToken() réutilise les listeners existants si déjà init
 * - Aucun crash possible : chaque opération native est dans try/catch
 */

// ── État global singleton ─────────────────────────────────────────────────────
let _PN = null;           // instance PushNotifications (chargée une fois)
let _registered = false;  // register() déjà appelé
let _listeners = [];      // handles des listeners actifs

// Callbacks installés par initCapacitorPush (remplacés à chaque init)
let _onToken = null;
let _onForegroundNotif = null;
let _onNotificationTap = null;
let _onPermissionDenied = null;

// ── Détection contexte natif ──────────────────────────────────────────────────
export function isNativeApp() {
  if (typeof window === 'undefined') return false;
  if (window.location?.protocol === 'capacitor:') return true;
  // Seule vérification fiable : isNativePlatform() doit retourner true explicitement
  if (window.Capacitor?.isNativePlatform?.() === true) return true;
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
async function getPN() {
  if (_PN) return _PN;
  try {
    const mod = await import('@capacitor/push-notifications');
    _PN = mod.PushNotifications;
    console.log('[NativePush] Plugin chargé');
    return _PN;
  } catch (err) {
    console.warn('[NativePush] Plugin indisponible:', err?.message);
    return null;
  }
}

// ── Canal Android ─────────────────────────────────────────────────────────────
async function ensureChannel(PN) {
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
  } catch (_) {
    // Canal existe déjà ou non supporté — pas bloquant
  }
}

// ── Demander / vérifier la permission ────────────────────────────────────────
async function ensurePermission(PN) {
  try {
    const check = await PN.checkPermissions();
    if (check.receive === 'granted') return 'granted';
    if (check.receive === 'denied') return 'denied';
  } catch (_) {}

  try {
    const req = await PN.requestPermissions();
    return req.receive; // 'granted' | 'denied' | 'prompt'
  } catch (e) {
    console.error('[NativePush] requestPermissions crash:', e?.message);
    return 'error';
  }
}

// ── Enregistrer les listeners permanents (appelé une seule fois) ──────────────
async function attachListeners(PN) {
  // Supprimer les anciens listeners proprement
  for (const l of _listeners) {
    try { await l.remove(); } catch (_) {}
  }
  _listeners = [];

  try {
    _listeners.push(await PN.addListener('registration', (token) => {
      const val = token?.value;
      console.log('[NativePush] ✅ Token FCM:', val ? val.slice(0, 20) + '…' : 'VIDE');
      if (_onToken && val) _onToken(val);
    }));

    _listeners.push(await PN.addListener('registrationError', (err) => {
      console.error('[NativePush] ❌ registrationError:', JSON.stringify(err));
    }));

    _listeners.push(await PN.addListener('pushNotificationReceived', (notif) => {
      console.log('[NativePush] 📬 Foreground:', notif?.title);
      if (_onForegroundNotif) _onForegroundNotif(notif);
    }));

    _listeners.push(await PN.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification?.data || {};
      const route = data.notif_route || data.route || data.target_screen || null;
      console.log('[NativePush] 👆 Tap → route:', route);
      if (_onNotificationTap) _onNotificationTap({ route, data });
      if (route?.startsWith('/')) {
        try { sessionStorage.setItem('cdl_notif_route', route); } catch (_) {}
      }
    }));

    console.log('[NativePush] ✅ Listeners attachés');
  } catch (e) {
    console.error('[NativePush] addListener error:', e?.message);
  }
}

// ── register() — appelé UNE SEULE FOIS ───────────────────────────────────────
async function doRegister(PN) {
  if (_registered) {
    console.log('[NativePush] register() déjà effectué, skip');
    return true;
  }
  try {
    await PN.register();
    _registered = true;
    console.log('[NativePush] ✅ register() OK — token en attente via listener');
    return true;
  } catch (e) {
    console.error('[NativePush] ❌ register() error:', e?.message);
    return false;
  }
}

/**
 * initCapacitorPush — appelé au démarrage par AppLayoutWrapper.
 * Installe les callbacks et appelle register() si pas encore fait.
 */
export async function initCapacitorPush({ onToken, onForegroundNotif, onNotificationTap, onPermissionDenied }) {
  if (!isNativeApp()) return { cleanup: () => {}, permissionStatus: 'not_native' };

  const PN = await getPN();
  if (!PN) return { cleanup: () => {}, permissionStatus: 'unavailable' };

  console.log('[NativePush] initCapacitorPush START');

  await ensureChannel(PN);

  const perm = await ensurePermission(PN);
  console.log('[NativePush] Permission:', perm);

  if (perm === 'denied' || perm === 'error') {
    if (onPermissionDenied) onPermissionDenied(perm);
    return { cleanup: () => {}, permissionStatus: perm };
  }
  if (perm !== 'granted') {
    if (onPermissionDenied) onPermissionDenied('user_denied');
    return { cleanup: () => {}, permissionStatus: 'user_denied' };
  }

  // Installer les callbacks globaux
  _onToken = onToken;
  _onForegroundNotif = onForegroundNotif;
  _onNotificationTap = onNotificationTap;
  _onPermissionDenied = onPermissionDenied;

  // Attacher les listeners (ou les ré-attacher)
  await attachListeners(PN);

  // register() une seule fois
  const ok = await doRegister(PN);

  return {
    cleanup: () => {
      _onToken = null;
      _onForegroundNotif = null;
      _onNotificationTap = null;
      _onPermissionDenied = null;
    },
    permissionStatus: ok ? 'granted' : 'register_error',
  };
}

/**
 * requestNativePushToken — appelé par FcmDiagnostic "Enregistrer".
 *
 * Stratégie :
 * - Réutilise les listeners déjà en place si init faite
 * - Si pas encore init : fait toute la séquence (canaux, permission, listeners, register)
 * - Retourne le token via Promise (timeout 25s)
 * - Ne crashe jamais
 */
export async function requestNativePushToken() {
  if (!isNativeApp()) return null;

  const PN = await getPN();
  if (!PN) {
    console.error('[NativePush] requestNativePushToken: plugin non disponible');
    return null;
  }

  await ensureChannel(PN);

  const perm = await ensurePermission(PN);
  console.log('[NativePush] requestNativePushToken permission:', perm);
  if (perm !== 'granted') return null;

  return new Promise(async (resolve) => {
    let settled = false;

    const finish = (token) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Restaurer les callbacks d'origine après la récupération du token
      _onToken = _savedOnToken;
      resolve(token ?? null);
    };

    const timer = setTimeout(() => {
      console.warn('[NativePush] requestNativePushToken: timeout 25s');
      finish(null);
    }, 25000);

    // Sauvegarder le callback token existant
    const _savedOnToken = _onToken;

    // Intercepter le prochain token reçu
    _onToken = (val) => {
      console.log('[NativePush] ✅ requestNativePushToken: token intercepté');
      // Appeler aussi le callback original (AppLayoutWrapper)
      if (_savedOnToken) _savedOnToken(val);
      finish(val);
    };

    // Re-attacher les listeners avec le nouveau _onToken
    await attachListeners(PN);

    // register() — si déjà fait, Firebase peut renvoyer le token existant
    // via le listener 'registration' lors du re-register
    const ok = await doRegister(PN);
    if (!ok) {
      // register() a échoué → essayer quand même un re-register
      try {
        _registered = false; // reset pour forcer un nouveau register
        await PN.register();
        _registered = true;
        console.log('[NativePush] register() (retry) lancé');
      } catch (e) {
        console.error('[NativePush] register() retry crash:', e?.message);
        finish(null);
      }
    }
  });
}

/**
 * getDeliveredNotifications
 */
export async function getDeliveredNotifications() {
  if (!isNativeApp()) return [];
  try {
    const PN = await getPN();
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
    const PN = await getPN();
    if (!PN) return 'unknown';
    const result = await PN.checkPermissions();
    return result.receive;
  } catch (_) {
    return 'unknown';
  }
}