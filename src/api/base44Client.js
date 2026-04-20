import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// En mode natif (Capacitor APK ou file://), les URLs relatives échouent.
// On force serverUrl vers app.base44.com.
function getServerUrl() {
  if (typeof window === 'undefined') return '';
  const proto = window.location?.protocol;
  const isNative =
    proto === 'capacitor:' ||
    proto === 'file:' ||
    typeof window.Capacitor !== 'undefined';
  if (isNative) {
    console.log('[CDL] base44Client: mode natif → serverUrl=https://app.base44.com');
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