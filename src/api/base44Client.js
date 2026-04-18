import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// En mode Capacitor natif (APK Android Studio), les fichiers sont chargés depuis
// capacitor://localhost — les URLs relatives vers /api/* ne fonctionnent pas.
// On force une URL absolue vers l'API Base44.
function getServerUrl() {
  try {
    const isCapacitorNative =
      typeof window !== 'undefined' &&
      window.Capacitor !== undefined &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform();
    
    if (isCapacitorNative) {
      console.log('[base44Client] Mode Capacitor natif → serverUrl: https://app.base44.com');
      return 'https://app.base44.com';
    }
  } catch (_) {}
  return '';
}

const serverUrl = getServerUrl();

//Create a client with authentication required
export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl,
  requiresAuth: false,
  appBaseUrl
});