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

// Canaux Android — importance haute pour les critiques
const ANDROID_CHANNELS = [
  {
    id: 'cdl_courses',
    name: 'Courses & Livraisons',
    description: 'Nouvelles courses, assignations, annulations',
    importance: 5, // IMPORTANCE_HIGH
    sound: 'default',
    vibration: true,
    lights: true,
  },
  {
    id: 'cdl_messages',
    name: 'Messages',
    description: 'Nouveaux messages de l\'administration',
    importance: 4,
    sound: 'default',
    vibration: true,
    lights: false,
  },
  {
    id: 'cdl_bedou',
    name: 'Bedou & Transactions',
    description: 'Recharges, retraits, gains Bedou',
    importance: 4,
    sound: 'default',
    vibration: false,
    lights: false,
  },
  {
    id: 'cdl_admin',
    name: 'Compte & Validation',
    description: 'Validation profil, alertes admin',
    importance: 4,
    sound: 'default',
    vibration: false,
    lights: false,
  },
  {
    id: 'cdl_general',
    name: 'Général',
    description: 'Notifications générales CDL',
    importance: 3,
    sound: null,
    vibration: false,
    lights: false,
  },
];

async function createAndroidChannels(PushNotifications) {
  try {
    for (const ch of ANDROID_CHANNELS) {
      await PushNotifications.createChannel(ch);
    }
    console.log('[NativePush] ✅ Canaux Android créés:', ANDROID_CHANNELS.map(c => c.id).join(', '));
  } catch (err) {
    console.warn('[NativePush] Canaux Android non supportés (normal sur iOS):', err?.message);
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

  // ── 1. Créer les canaux Android AVANT de demander la permission ──────────
  await createAndroidChannels(PushNotifications);

  // ── 2. Vérifier la permission actuelle ───────────────────────────────────
  let permResult;
  try {
    permResult = await PushNotifications.checkPermissions();
    console.log('[NativePush] Permission actuelle:', permResult.receive);
  } catch (_) {
    permResult = { receive: 'prompt' };
  }

  if (permResult.receive === 'denied') {
    console.warn('[NativePush] Permission définitivement refusée');
    if (onPermissionDenied) onPermissionDenied('denied');
    return { cleanup: () => {}, permissionStatus: 'denied' };
  }

  if (permResult.receive !== 'granted') {
    // ── 3. Demander la permission (Android 13+) ───────────────────────────
    const reqResult = await PushNotifications.requestPermissions();
    console.log('[NativePush] Permission demandée:', reqResult.receive);
    if (reqResult.receive !== 'granted') {
      console.warn('[NativePush] Permission refusée par l\'utilisateur');
      if (onPermissionDenied) onPermissionDenied('prompt_denied');
      return { cleanup: () => {}, permissionStatus: 'prompt_denied' };
    }
  }

  // ── 4. Enregistrer l'appareil auprès de FCM ──────────────────────────────
  console.log('[NativePush] Enregistrement FCM...');
  await PushNotifications.register();

  const listeners = [];

  // ── 5. Token reçu → sauvegarder ─────────────────────────────────────────
  const tokenListener = await PushNotifications.addListener('registration', (token) => {
    console.log('[NativePush] ✅ Token FCM natif reçu:', token.value?.substring(0, 25) + '...');
    if (onToken) onToken(token.value);
  });
  listeners.push(tokenListener);

  // Erreur d'enregistrement → retry après 5s
  const errorListener = await PushNotifications.addListener('registrationError', (err) => {
    console.error('[NativePush] ❌ Erreur enregistrement FCM:', err.error);
    setTimeout(async () => {
      console.log('[NativePush] Retry enregistrement FCM...');
      try { await PushNotifications.register(); } catch (_) {}
    }, 5000);
  });
  listeners.push(errorListener);

  // ── 6. Notification reçue en FOREGROUND (app ouverte) ───────────────────
  const foregroundListener = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('[NativePush] Notification foreground:', notification.title, '| data:', JSON.stringify(notification.data || {}));
    if (onForegroundNotif) onForegroundNotif(notification);
  });
  listeners.push(foregroundListener);

  // ── 7. Tap notification (background OU app fermée) → deep link ───────────
  // CORRECTION CRITIQUE : utiliser postMessage au lieu de window.location.href
  // pour que React Router gère la navigation sans rechargement
  const tapListener = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const data = action.notification?.data || {};
    const route = data.notif_route || data.route || data.target_screen || null;
    console.log('[NativePush] ✅ Tap notification → route:', route, '| data:', JSON.stringify(data));
    if (onNotificationTap) {
      onNotificationTap({ route, data });
    }
    // Stocker en sessionStorage pour que FcmDeepLinkHandler le capte si le composant n'est pas encore monté
    if (route && route.startsWith('/')) {
      try {
        sessionStorage.setItem('cdl_notif_route', route);
      } catch (_) {}
    }
  });
  listeners.push(tapListener);

  console.log('[NativePush] ✅ Push Capacitor initialisé avec succès');

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