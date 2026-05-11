/**
 * nativePush.js — Capacitor Firebase Push Notifications (APK Android)
 *
 * ARCHITECTURE DÉFINITIVE v5 (NE PAS MODIFIER SANS RAISON) :
 *
 * Règle fondamentale Capacitor Push :
 *   - addListener() doit être appelé AVANT register()
 *   - register() déclenche le callback 'registration' avec le token
 *   - Si les listeners sont perdus (module rechargé), le token ne revient plus
 *
 * Solution :
 *   - TOUJOURS re-attacher les listeners avant register()
 *   - register() est TOUJOURS forcé au démarrage (pas de guard _registered)
 *     car Firebase renvoie le même token → idempotent côté BDD
 *   - Timeout de sécurité 20s → log d'erreur visible si token jamais reçu
 */

let _PN = null;
let _listeners = [];
let _onToken = null;
let _onForegroundNotif = null;
let _onNotificationTap = null;

// ── Détection contexte natif ──────────────────────────────────────────────────
export function isNativeApp() {
  try {
    if (typeof window === 'undefined') return false;
    if (window.location?.protocol === 'capacitor:') return true;
    if (window.location?.protocol === 'file:') return true;
    if (window.Capacitor?.getPlatform?.() === 'android') return true;
  } catch (_) {}
  return false;
}

// ── Charger le plugin une seule fois ─────────────────────────────────────────
async function getPN() {
  if (_PN) return _PN;
  try {
    const mod = await import('@capacitor/push-notifications');
    _PN = mod.PushNotifications;
    console.log('[NativePush] ✅ Plugin PushNotifications chargé');
    return _PN;
  } catch (err) {
    console.error('[NativePush] ❌ Plugin indisponible:', err?.message);
    return null;
  }
}

// ── Canal Android ─────────────────────────────────────────────────────────────
// 🔒 CANAL VERROUILLÉ : doit correspondre exactement à sendCdlNotification
const CDL_CHANNEL_ID = 'cdl_critical_alerts_v2';

async function ensureChannel(PN) {
  try {
    // Supprimer l'ancien canal "default" s'il existe (ne correspond plus à ce qu'on envoie)
    try { await PN.deleteChannel({ id: 'default' }); } catch (_) {}

    // 🔒 Canal unique v2 — importance: 5 = IMPORTANCE_MAX heads-up garanti
    await PN.createChannel({
      id: CDL_CHANNEL_ID,
      name: 'CDL Alertes Critiques',
      description: 'Courses, recharges Bedou, profils — priorité maximale',
      importance: 5,
      sound: 'default',
      vibration: true,
      lights: true,
      lightColor: '#FF6B1E',
    });
    console.log('[NativePush] ✅ Canal', CDL_CHANNEL_ID, '(importance=5) créé/vérifié');
  } catch (e) {
    console.warn('[NativePush] ensureChannel error (non-fatal):', e?.message);
  }
}

// ── Vérifier / demander la permission ────────────────────────────────────────
// IMPORTANT : requestPermission=false par défaut pour éviter tout dialog Android inopiné
// Ne passer requestPermission=true QUE depuis un geste utilisateur explicite (bouton)
async function ensurePermission(PN, requestPermission = false) {
  try {
    const check = await PN.checkPermissions();
    console.log('[NativePush] checkPermissions():', check.receive);
    if (check.receive === 'granted') return 'granted';
    if (check.receive === 'denied') {
      console.warn('[NativePush] Permission DENIED définitivement (POST_NOTIFICATIONS bloquée)');
      return 'denied';
    }
    // 'prompt' → demander SEULEMENT si autorisé explicitement
    if (!requestPermission) {
      console.log('[NativePush] Permission "prompt" mais requestPermission=false → skip dialog');
      return 'prompt';
    }
    console.log('[NativePush] requestPermissions()...');
    const req = await PN.requestPermissions();
    console.log('[NativePush] requestPermissions() résultat:', req.receive);
    return req.receive;
  } catch (e) {
    console.error('[NativePush] ensurePermission crash:', e?.message);
    return 'error';
  }
}

// ── Attacher les listeners (TOUJOURS avant register) ─────────────────────────
async function attachListeners(PN) {
  // Nettoyer les anciens listeners
  for (const l of _listeners) {
    try { await l.remove(); } catch (_) {}
  }
  _listeners = [];

  try {
    _listeners.push(await PN.addListener('registration', (token) => {
      const val = token?.value;
      if (val) {
        console.log('[NativePush] ✅ TOKEN REÇU (registration event):', val.slice(0, 25) + '…');
        if (_onToken) _onToken(val);
        else console.warn('[NativePush] ⚠️ Token reçu mais _onToken est null — callback non installé !');
      } else {
        console.error('[NativePush] ❌ registration event reçu mais token.value est VIDE');
      }
    }));

    _listeners.push(await PN.addListener('registrationError', (err) => {
      console.error('[NativePush] ❌ registrationError:', JSON.stringify(err));
    }));

    _listeners.push(await PN.addListener('pushNotificationReceived', (notif) => {
      console.log('[NativePush] 📬 Notification foreground:', notif?.title);
      if (_onForegroundNotif) _onForegroundNotif(notif);
    }));

    _listeners.push(await PN.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification?.data || {};
      const route = data.notif_route || data.route || data.target_screen || null;
      console.log('[NativePush] 👆 Tap notification → route:', route);
      if (_onNotificationTap) _onNotificationTap({ route, data });
      if (route?.startsWith('/')) {
        try { sessionStorage.setItem('cdl_notif_route', route); } catch (_) {}
      }
    }));

    console.log('[NativePush] ✅', _listeners.length, 'listeners attachés');
  } catch (e) {
    console.error('[NativePush] ❌ attachListeners error:', e?.message);
  }
}

// ── register() — TOUJOURS appelé (idempotent Firebase) ───────────────────────
async function doRegister(PN) {
  try {
    console.log('[NativePush] register() → déclenchement...');
    await PN.register();
    console.log('[NativePush] ✅ register() OK — en attente du callback registration');
    return true;
  } catch (e) {
    console.error('[NativePush] ❌ register() ERREUR:', e?.message);
    return false;
  }
}

/**
 * initCapacitorPush — Séquence complète garantie (NE PAS MODIFIER) :
 * 1. Charger le plugin
 * 2. Créer le canal Android
 * 3. Vérifier/demander la permission
 * 4. Installer les callbacks
 * 5. Attacher les listeners (AVANT register — règle Capacitor obligatoire)
 * 6. Appeler register() — TOUJOURS FORCÉ à chaque appel (Firebase renvoie le même token → idempotent)
 * 7. Timeout de sécurité 20s si token jamais reçu
 *
 * RÈGLE CRITIQUE : Ne jamais mettre de guard "_registered" ici.
 * register() doit être appelé à chaque ouverture de l'app pour garantir
 * que le callback 'registration' se déclenche et que le token est sauvegardé.
 */
export async function initCapacitorPush({ onToken, onForegroundNotif, onNotificationTap, onPermissionDenied }) {
  if (!isNativeApp()) {
    console.log('[NativePush] Non-native → skip initCapacitorPush');
    return { permissionStatus: 'not_native' };
  }

  console.log('[NativePush] ═══ initCapacitorPush START ═══');

  const PN = await getPN();
  if (!PN) {
    console.error('[NativePush] Plugin non disponible — FCM impossible');
    return { permissionStatus: 'unavailable' };
  }

  // Étape 1 : Canal Android
  await ensureChannel(PN);

  // Étape 2 : Permission — demander si "prompt" (pas encore refusé)
  // requestPermission=true pour ne pas manquer le 1er lancement
  const perm = await ensurePermission(PN, true);
  if (perm === 'denied') {
    console.warn('[NativePush] Permission DENIED définitivement → FCM impossible');
    if (onPermissionDenied) onPermissionDenied(perm);
    return { permissionStatus: perm };
  }
  if (perm !== 'granted') {
    console.warn('[NativePush] Permission non accordée:', perm, '→ on continue quand même (Android peut livrer)');
  }

  // Étape 3 : Installer les callbacks globaux
  _onToken = onToken;
  _onForegroundNotif = onForegroundNotif;
  _onNotificationTap = onNotificationTap;

  // Étape 4 : Attacher les listeners AVANT register()
  await attachListeners(PN);

  // Étape 5 : register() — TOUJOURS forcé (Firebase renvoie le même token si déjà enregistré)
  const ok = await doRegister(PN);
  if (!ok) {
    console.error('[NativePush] ❌ register() a échoué — token IMPOSSIBLE à obtenir');
    return { permissionStatus: 'register_error' };
  }

  // Étape 6 : Timeout de sécurité — si le token n'arrive pas en 20s → log d'erreur visible
  const tokenGuardTimer = setTimeout(() => {
    console.error(
      '[NativePush] ⛔ TOKEN GUARD: register() appelé il y a 20s mais aucun token reçu.',
      'Vérifier : google-services.json, firebase_app_id, internet permission APK.'
    );
  }, 20000);

  // Le timer est annulé par le callback onToken via clearTokenGuard
  const originalOnToken = _onToken;
  _onToken = (val) => {
    clearTimeout(tokenGuardTimer);
    console.log('[NativePush] ✅ Token reçu — guard timer annulé');
    _onToken = originalOnToken; // Restaurer le callback
    if (originalOnToken) originalOnToken(val);
  };

  console.log('[NativePush] ═══ initCapacitorPush DONE — en attente du token ═══');
  return { permissionStatus: 'granted' };
}

/**
 * requestNativePushToken — Force un nouveau token (utilisé par FcmDiagnostic / retry).
 * Effectue la séquence complète et retourne le token via Promise (timeout 25s).
 */
export async function requestNativePushToken() {
  if (!isNativeApp()) return null;

  const PN = await getPN();
  if (!PN) {
    console.error('[NativePush] requestNativePushToken: plugin non disponible');
    return null;
  }

  await ensureChannel(PN);

  // requestPermission=true car appelé depuis un bouton utilisateur
  const perm = await ensurePermission(PN, true);
  console.log('[NativePush] requestNativePushToken — permission:', perm);
  if (perm !== 'granted') return null;

  return new Promise(async (resolve) => {
    let settled = false;
    const savedOnToken = _onToken;

    const finish = (token) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      _onToken = savedOnToken; // Restaurer
      resolve(token ?? null);
    };

    const timer = setTimeout(() => {
      console.warn('[NativePush] requestNativePushToken: timeout 25s — token non reçu');
      finish(null);
    }, 25000);

    // Intercepter le token
    _onToken = (val) => {
      console.log('[NativePush] ✅ requestNativePushToken: token intercepté:', val.slice(0, 25) + '…');
      if (savedOnToken) savedOnToken(val);
      finish(val);
    };

    await attachListeners(PN);
    console.log('[NativePush] requestNativePushToken → register() forcé...');
    const ok = await doRegister(PN);
    if (!ok) {
      console.error('[NativePush] register() échoué dans requestNativePushToken');
      finish(null);
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

/**
 * openAppSettings — ouvre les paramètres Android de l'app
 */
export async function openAppSettings() {
  try {
    if (window.cordova?.plugins?.settings) {
      window.cordova.plugins.settings.open('notification_id', () => {}, () => {});
      return;
    }
    window.open('app-settings:', '_system');
  } catch (_) {
    window.open('app-settings:', '_system');
  }
}

/**
 * resetNativePushState — reset pour le diagnostic (force re-init complète)
 */
export function resetNativePushState() {
  _PN = null;
  _listeners = [];
  _onToken = null;
  console.log('[NativePush] State reset complet — prêt pour une nouvelle init');
}