/**
 * PermissionEngine — SOURCE UNIQUE pour les permissions système
 *
 * COMPATIBILITÉ : wraps autour des APIs Capacitor/Web natives
 * Gère : notifications, GPS, caméra, stockage, redirect paramètres Android
 *
 * LOGS : [ENGINE_INIT] [ENGINE_READY] [ENGINE_MIGRATION_OK] [ENGINE_ERROR]
 */

const ENGINE_VERSION = '1.0.0';



/** Détecter si on est dans une app native Capacitor */
function isNative() {
  return (
    window.location?.protocol === 'capacitor:' ||
    window.location?.protocol === 'file:' ||
    window.Capacitor?.getPlatform?.() === 'android' ||
    window.Capacitor?.isNativePlatform?.() === true
  );
}

const PermissionEngine = {
  version: ENGINE_VERSION,
  isNative,

  // ── Notifications ──────────────────────────────────────────────────────────

  async checkNotificationPermission() {
    if (isNative()) {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const perm = await PushNotifications.checkPermissions();
        return perm.receive; // 'granted' | 'denied' | 'prompt'
      } catch (e) {
        console.error(`[ENGINE_ERROR] PermissionEngine.checkNotification | ${e.message}`);
        return 'unknown';
      }
    }
    if ('Notification' in window) return Notification.permission;
    return 'unavailable';
  },

  async requestNotificationPermission() {
    if (isNative()) {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const result = await PushNotifications.requestPermissions();
        const granted = result.receive === 'granted';
        console.log(`[ENGINE_MIGRATION_OK] PermissionEngine.requestNotification | granted=${granted}`);
        return granted;
      } catch (e) {
        console.error(`[ENGINE_ERROR] PermissionEngine.requestNotification | ${e.message}`);
        return false;
      }
    }
    if ('Notification' in window) {
      const p = await Notification.requestPermission();
      console.log(`[ENGINE_MIGRATION_OK] PermissionEngine.requestNotification (web) | result=${p}`);
      return p === 'granted';
    }
    return false;
  },

  // ── GPS ────────────────────────────────────────────────────────────────────

  async checkLocationPermission() {
    if ('permissions' in navigator) {
      try {
        const r = await navigator.permissions.query({ name: 'geolocation' });
        return r.state;
      } catch (_) {}
    }
    return 'unknown';
  },

  async requestLocationPermission() {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          console.log(`[ENGINE_MIGRATION_OK] PermissionEngine.requestLocation | granted`);
          resolve(true);
        },
        (err) => {
          console.error(`[ENGINE_ERROR] PermissionEngine.requestLocation | code=${err.code}`);
          resolve(false);
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 0 }
      );
    });
  },

  // ── Caméra ─────────────────────────────────────────────────────────────────

  async checkCameraPermission() {
    if (isNative()) {
      try {
        const { Camera } = await import('@capacitor/camera');
        const p = await Camera.checkPermissions();
        return p.camera;
      } catch (e) {
        return 'unknown';
      }
    }
    if ('mediaDevices' in navigator) return 'available';
    return 'unavailable';
  },

  async requestCameraPermission() {
    if (isNative()) {
      try {
        const { Camera } = await import('@capacitor/camera');
        const result = await Camera.requestPermissions({ permissions: ['camera'] });
        const granted = result.camera === 'granted';
        console.log(`[ENGINE_MIGRATION_OK] PermissionEngine.requestCamera | granted=${granted}`);
        return granted;
      } catch (e) {
        console.error(`[ENGINE_ERROR] PermissionEngine.requestCamera | ${e.message}`);
        return false;
      }
    }
    // Web — demander via getUserMedia
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(t => t.stop());
      return true;
    } catch (_) {
      return false;
    }
  },

  // ── Diagnostic global ──────────────────────────────────────────────────────

  async getDiagnostics() {
    const [notif, location, camera] = await Promise.all([
      this.checkNotificationPermission().catch(() => 'error'),
      this.checkLocationPermission().catch(() => 'error'),
      this.checkCameraPermission().catch(() => 'error'),
    ]);
    const diag = {
      engine_version: ENGINE_VERSION,
      platform: isNative() ? 'native' : 'web',
      notification: notif,
      location,
      camera,
      storage: 'available', // Toujours dispo en Capacitor
      all_granted: notif === 'granted' && location === 'granted',
    };
    console.log(`[ENGINE_READY] PermissionEngine.getDiagnostics | notif=${notif} | location=${location} | camera=${camera}`);
    return diag;
  },

  // ── Redirect paramètres Android ────────────────────────────────────────────

  async openAndroidSettings() {
    if (isNative()) {
      try {
        // Fallback universel — ouvrir les paramètres via schéma URI
        window.open('app-settings:', '_system');
      } catch (_) {}
    }
  },
};



export default PermissionEngine;