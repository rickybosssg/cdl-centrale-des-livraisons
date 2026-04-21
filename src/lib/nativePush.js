/**
 * nativePush.js — Capacitor Firebase Push Notifications (APK Android natif)
 *
 * CORRECTIONS v2 :
 * - Canaux Android créés AVANT register()
 * - Navigation via postMessage (React Router, pas rechargement)
 * - Retry auto si token absent
 * - Permission refusée → retour propre avec flag
 * - Logs complets pour debug
 */

export function isNativeApp() {
  if (typeof window === 'undefined') return false;
  // Méthode 1 : protocol capacitor: (Android Studio APK)
  if (window.location?.protocol === 'capacitor:') return true;
  // Méthode 2 : window.Capacitor injecté (Android Studio + Base44 APK récent)
  if (window.Capacitor?.isNativePlatform?.() === true) return true;
  // Méthode 3 : window.Capacitor existe mais isNativePlatform non exposé (APK Base44)
  if (typeof window.Capacitor !== 'undefined') return true;
  return false;
}

/**
 * Attend que window.Capacitor soit disponible (délai injection WebView)
 * Timeout max : 3 secondes
 */
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

// Canaux Android — 'default' OBLIGATOIRE en importance 5 pour app fermée
// Le channel_id dans le payload FCM doit correspondre exactement
const ANDROID_CHANNELS = [
  {
    // Canal principal utilisé par tous les payloads FCM (channel_id: 'default')
    id: 'default',
    name: 'CDL Notifications',
    description: 'Toutes les notifications CDL',
    importance: 5, // IMPORTANCE_HIGH — requis pour affichage app fermée
    sound: 'default',
    vibration: true,
    lights: true,
    lightColor: '#1a73e8',
  },
];

async function createAndroidChannels(PushNotifications) {
  try {
    for (const ch of ANDROID_CHANNELS) {
      await PushNotifications.createChannel(ch);
      console.log('[NativePush] Canal créé:', ch.id, 'importance:', ch.importance);
    }
    console.log('[NativePush] ✅ Canal "default" importance 5 créé');
  } catch (err) {
    console.warn('[NativePush] createChannel non supporté:', err?.message);
  }
}

/**
 * Initialise les push notifications Capacitor.
 * @returns {{ cleanup: function, permissionStatus: string }}
 */
export async function initCapacitorPush({ onToken, onForegroundNotif, onNotificationTap, onPermissionDenied }) {
  if (!isNativeApp()) {
    console.log('[NativePush] Pas en contexte natif, module ignoré');
    return { cleanup: () => {}, permissionStatus: 'not_native' };
  }

  let PushNotifications;
  try {
    const mod = await import('@capacitor/push-notifications');
    PushNotifications = mod.PushNotifications;
  } catch (err) {
    console.warn('[NativePush] @capacitor/push-notifications non disponible:', err?.message);
    return { cleanup: () => {}, permissionStatus: 'unavailable' };
  }

  console.log('\n[NativePush] 🔴 ════════════════════════════════════');
  console.log('[NativePush] 🔴 INIT CAPACITOR PUSH NOTIFICATIONS');

  // ── 1. Créer les canaux Android AVANT de demander la permission ──────────
  console.log('[NativePush] 🟡 STEP 1: Creating Android channels...');
  await createAndroidChannels(PushNotifications);
  console.log('[NativePush] ✅ Android channels created');

  // ── 2. Vérifier la permission ACTUELLE ───────────────────────────────────
  console.log('[NativePush] 🟡 STEP 2: Checking current permission status...');
  let permResult;
  try {
    permResult = await PushNotifications.checkPermissions();
    console.log('[NativePush] 📋 Permission status:', permResult.receive);
  } catch (checkErr) {
    console.warn('[NativePush] ⚠️ checkPermissions failed:', checkErr?.message);
    permResult = { receive: 'prompt' };
  }

  // ── 3. Si la permission est REFUSÉE définitivement → retour ──────────────
  if (permResult.receive === 'denied') {
    console.log('[NativePush] ❌ STEP 3: Permission is PERMANENTLY DENIED');
    console.log('[NativePush] ❌ User must enable in Settings → Apps → CDL → Notifications');
    if (onPermissionDenied) onPermissionDenied('denied');
    console.log('[NativePush] ❌ ════════════════════════════════════\n');
    return { cleanup: () => {}, permissionStatus: 'denied' };
  }

  // ── 4. Si pas encore accordée → DEMANDER la permission native ───────────
  if (permResult.receive !== 'granted') {
    console.log('[NativePush] 🟡 STEP 3: Requesting permission from user...');
    console.log('[NativePush] 🟡 Android native permission dialog should appear now');
    
    let reqResult;
    try {
      reqResult = await PushNotifications.requestPermissions();
      console.log('[NativePush] 📋 User response:', reqResult.receive);
    } catch (reqErr) {
      console.error('[NativePush] ❌ requestPermissions error:', reqErr?.message);
      if (onPermissionDenied) onPermissionDenied('request_error');
      console.log('[NativePush] ❌ ════════════════════════════════════\n');
      return { cleanup: () => {}, permissionStatus: 'error' };
    }

    if (reqResult.receive !== 'granted') {
      console.log('[NativePush] ❌ STEP 4: User DENIED the permission');
      console.log('[NativePush] ❌ Cannot proceed without permission');
      if (onPermissionDenied) onPermissionDenied('user_denied');
      console.log('[NativePush] ❌ ════════════════════════════════════\n');
      return { cleanup: () => {}, permissionStatus: 'user_denied' };
    }

    console.log('[NativePush] ✅ STEP 4: User GRANTED the permission');
  } else {
    console.log('[NativePush] ✅ STEP 3: Permission already GRANTED (no popup needed)');
    console.log('[NativePush] ✅ FALLBACK: Notifications were already enabled');
  }

  // ── 5. Enregistrer les LISTENERS AVANT register() ──────────────────────────
  console.log('[NativePush] 🟡 STEP 5: Registering listeners BEFORE register()...');
  const listeners = [];

  // Token reçu → callback
  const tokenListener = await PushNotifications.addListener('registration', (token) => {
    const tokenValue = token.value;
    console.log('[NativePush] FCM token reçu (préfixe):', tokenValue ? `${String(tokenValue).slice(0, 12)}…` : '—');
    
    if (onToken) {
      console.log('[NativePush] 🟢 [CERTAIN] Calling onToken callback...');
      onToken(tokenValue);
    } else {
      console.warn('[NativePush] ⚠️ onToken callback NOT PROVIDED!');
    }
  });
  listeners.push(tokenListener);

  // Erreur d'enregistrement → retry
  const errorListener = await PushNotifications.addListener('registrationError', (err) => {
    console.error('[NativePush] ❌ Registration error event:', err.error);
    setTimeout(async () => {
      console.log('[NativePush] 🔄 Retrying FCM registration...');
      try { 
        await PushNotifications.register();
        console.log('[NativePush] ✅ Retry successful');
      } catch (retryErr) {
        console.error('[NativePush] ❌ Retry failed:', retryErr?.message);
      }
    }, 5000);
  });
  listeners.push(errorListener);

  // Notification reçue en FOREGROUND
  const foregroundListener = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('[NativePush] 📬 Foreground notification:', notification.title);
    console.log('[NativePush] 📬 Data:', JSON.stringify(notification.data || {}));
    if (onForegroundNotif) onForegroundNotif(notification);
  });
  listeners.push(foregroundListener);

  // Tap notification
  const tapListener = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const data = action.notification?.data || {};
    const route = data.notif_route || data.route || data.target_screen || null;
    console.log('[NativePush] 👆 Notification tapped → route:', route);
    if (onNotificationTap) {
      onNotificationTap({ route, data });
    }
    if (route && route.startsWith('/')) {
      try {
        sessionStorage.setItem('cdl_notif_route', route);
      } catch (_) {}
    }
  });
  listeners.push(tapListener);

  console.log('[NativePush] ✅ All listeners registered');

  // ── 6. APPELER register() APRÈS que les listeners soient prêts ────────────
  console.log('[NativePush] 🟡 STEP 6: Calling register() to generate/refresh token...');
  console.log('[NativePush] 🟡 [CERTAIN] register() called - waiting for token event');
  try {
    await PushNotifications.register();
    console.log('[NativePush] ✅ [CERTAIN] register() method executed successfully');
    console.log('[NativePush] ✅ [CERTAIN] Waiting for token event from listener...');
  } catch (regErr) {
    console.error('[NativePush] ❌ register() failed:', regErr?.message);
    console.log('[NativePush] ❌ ════════════════════════════════════\n');
    return { cleanup: () => {}, permissionStatus: 'register_error' };
  }

  console.log('[NativePush] ✅ ════════════════════════════════════');
  console.log('[NativePush] ✅ ALL LISTENERS REGISTERED');
  console.log('[NativePush] ✅ CAPACITOR PUSH FULLY INITIALIZED');
  console.log('[NativePush] ✅ ════════════════════════════════════\n');

  // Cleanup
  const cleanup = async () => {
    for (const l of listeners) {
      try { await l.remove(); } catch (_) {}
    }
  };

  return { cleanup, permissionStatus: 'granted' };
}

/**
 * Récupère les notifications délivrées pendant que l'app était fermée
 */
export async function getDeliveredNotifications() {
  if (!isNativeApp()) return [];
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const result = await PushNotifications.getDeliveredNotifications();
    console.log('[NativePush] Notifications en attente:', result.notifications?.length || 0);
    return result.notifications || [];
  } catch (err) {
    console.warn('[NativePush] getDeliveredNotifications error:', err?.message);
    return [];
  }
}

/**
 * Retourne le statut de permission actuel
 */
export async function getPermissionStatus() {
  if (!isNativeApp()) return 'not_native';
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const result = await PushNotifications.checkPermissions();
    return result.receive;
  } catch (_) {
    return 'unknown';
  }
}

/**
 * Demande la permission native + enregistre FCM (pour la bannière « Activer » sur APK).
 * Retourne le token ou null si refus / erreur.
 */
export async function requestNativePushToken() {
  if (!isNativeApp()) return null;

  let PushNotifications;
  try {
    const mod = await import('@capacitor/push-notifications');
    PushNotifications = mod.PushNotifications;
  } catch {
    return null;
  }

  await createAndroidChannels(PushNotifications);

  const req = await PushNotifications.requestPermissions();
  if (req.receive !== 'granted') return null;

  return new Promise((resolve) => {
    let settled = false;
    let regHandle;
    let errHandle;
    const finish = (token) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        regHandle?.remove?.();
      } catch (_) {}
      try {
        errHandle?.remove?.();
      } catch (_) {}
      resolve(token ?? null);
    };

    const timer = setTimeout(() => finish(null), 20000);

    void (async () => {
      try {
        regHandle = await PushNotifications.addListener('registration', (t) => {
          finish(t?.value || null);
        });
        errHandle = await PushNotifications.addListener('registrationError', () => finish(null));
        await PushNotifications.register();
      } catch {
        finish(null);
      }
    })();
  });
}