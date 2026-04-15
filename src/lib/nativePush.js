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
  return typeof window !== 'undefined' &&
    window.Capacitor !== undefined &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform();
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
    console.log('[NativePush] ✅ STEP 3: Permission already GRANTED');
  }

  // ── 5. Enregistrer l'appareil auprès de FCM ──────────────────────────────
  console.log('[NativePush] 🟡 STEP 5: Registering device with FCM...');
  try {
    await PushNotifications.register();
    console.log('[NativePush] ✅ Device registered, waiting for token...');
  } catch (regErr) {
    console.error('[NativePush] ❌ register() failed:', regErr?.message);
    console.log('[NativePush] ❌ ════════════════════════════════════\n');
    return { cleanup: () => {}, permissionStatus: 'register_error' };
  }

  const listeners = [];

  // ── 6. Token reçu → callback ─────────────────────────────────────────────
  const tokenListener = await PushNotifications.addListener('registration', (token) => {
    const tokenValue = token.value;
    console.log('[NativePush] ✅ ════════════════════════════════════');
    console.log('[NativePush] ✅ STEP 6: FCM TOKEN GENERATED');
    console.log('[NativePush] ✅ Token start (25 chars):', tokenValue?.substring(0, 25) + '...');
    console.log('[NativePush] ✅ Token full (256 chars):', tokenValue?.substring(0, 256));
    console.log('[NativePush] ✅ ════════════════════════════════════');
    
    if (onToken) {
      console.log('[NativePush] 🟢 Calling onToken callback...');
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

  // ── 7. Notification reçue en FOREGROUND ──────────────────────────────────
  const foregroundListener = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('[NativePush] 📬 Foreground notification:', notification.title);
    console.log('[NativePush] 📬 Data:', JSON.stringify(notification.data || {}));
    if (onForegroundNotif) onForegroundNotif(notification);
  });
  listeners.push(foregroundListener);

  // ── 8. Tap notification ──────────────────────────────────────────────────
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