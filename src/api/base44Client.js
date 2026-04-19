import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// En mode Capacitor natif, les URLs relatives échouent.
// On force serverUrl vers app.base44.com si on est dans une WebView native.
function getServerUrl() {
  if (typeof window === 'undefined') return '';
  // Détection Capacitor : protocol capacitor: OU window.Capacitor injecté
  const isNative =
    window.location.protocol === 'capacitor:' ||
    (window.Capacitor?.isNativePlatform?.() === true);
  if (isNative) {
    console.log('[CDL] base44Client: mode Capacitor natif → serverUrl forcé à https://app.base44.com');
    return 'https://app.base44.com';
  }
  return '';
}

export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: getServerUrl(),
  requiresAuth: false,
  appBaseUrl
});