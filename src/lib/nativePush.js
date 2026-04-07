/**
 * nativePush.js — Capacitor Firebase Push Notifications (APK Android natif)
 *
 * Ce module utilise @capacitor/push-notifications qui bridge vers le SDK
 * Firebase Android natif. Cela garantit la réception des notifications même
 * quand l'app est FERMÉE, en arrière-plan ou téléphone verrouillé.
 *
 * Flux Android natif :
 * 1. requestPermissions → permission système Android
 * 2. register() → obtient le FCM token natif
 * 3. registration event → token envoyé au backend
 * 4. pushNotificationReceived → foreground (app ouverte)
 * 5. pushNotificationActionPerformed → tap notification (background/killed)
 */

// Vérifie si on est dans un contexte Capacitor natif (APK)
export function isNativeApp() {
  return typeof window !== 'undefined' &&
    window.Capacitor !== undefined &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform();
}

/**
 * Initialise les push notifications Capacitor.
 * @param {object} options
 * @param {function} options.onToken - Appelé avec le FCM token natif
 * @param {function} options.onForegroundNotif - Appelé quand notif reçue app ouverte
 * @param {function} options.onNotificationTap - Appelé au tap (background/killed) avec {route}
 * @returns {function} cleanup
 */
export async function initCapacitorPush({ onToken, onForegroundNotif, onNotificationTap }) {
  if (!isNativeApp()) {
    console.log('[NativePush] Pas en contexte natif, module ignoré');
    return () => {};
  }

  let PushNotifications;
  try {
    const mod = await import('@capacitor/push-notifications');
    PushNotifications = mod.PushNotifications;
  } catch (err) {
    console.warn('[NativePush] @capacitor/push-notifications non disponible:', err?.message);
    return () => {};
  }

  // 1. Demander la permission système Android
  const permResult = await PushNotifications.requestPermissions();
  if (permResult.receive !== 'granted') {
    console.warn('[NativePush] Permission refusée:', permResult.receive);
    return () => {};
  }

  // 2. Enregistrer l'appareil auprès de FCM
  await PushNotifications.register();

  // 3. Réception du token FCM natif → sauvegarder en backend
  const tokenListener = await PushNotifications.addListener('registration', (token) => {
    console.log('[NativePush] Token FCM natif:', token.value?.substring(0, 20) + '...');
    if (onToken) onToken(token.value);
  });

  // Erreur d'enregistrement
  const errorListener = await PushNotifications.addListener('registrationError', (err) => {
    console.error('[NativePush] Erreur enregistrement FCM:', err.error);
  });

  // 4. Notification reçue quand app en FOREGROUND
  const foregroundListener = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('[NativePush] Notification foreground:', notification.title);
    if (onForegroundNotif) onForegroundNotif(notification);
  });

  // 5. Tap sur notification (background OU app fermée) → deep link
  const tapListener = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    console.log('[NativePush] Tap sur notification:', action);
    const data = action.notification?.data || {};
    // Cherche la route dans les différents champs possibles
    const route = data.notif_route || data.route || data.target_screen || '/';
    console.log('[NativePush] Route deep link:', route);
    if (onNotificationTap) onNotificationTap({ route, data });
  });

  // Cleanup : retire tous les listeners
  return async () => {
    await tokenListener.remove();
    await errorListener.remove();
    await foregroundListener.remove();
    await tapListener.remove();
  };
}

/**
 * Récupère les notifications en attente au lancement
 * (app lancée via tap sur notification quand elle était fermée)
 */
export async function getDeliveredNotifications() {
  if (!isNativeApp()) return [];
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const result = await PushNotifications.getDeliveredNotifications();
    return result.notifications || [];
  } catch (_) {
    return [];
  }
}