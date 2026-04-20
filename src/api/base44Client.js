import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// En mode natif (Capacitor APK ou file://), les URLs relatives échouent.
// ✅ FIX 403: Utiliser cdl.base44.app (app subdomain) au lieu de app.base44.com (platform domain)
function getServerUrl() {
  if (typeof window === 'undefined') return '';
  const proto = window.location?.protocol;
  const isNative =
    proto === 'capacitor:' ||
    proto === 'file:' ||
    typeof window.Capacitor !== 'undefined';
  if (isNative) {
    console.log('[CDL] base44Client: mode natif → serverUrl=https://cdl.base44.app (app domain, not platform)');
    return 'https://cdl.base44.app';
  }
  return '';
}

console.log('========================================');
console.log('BASE44 CLIENT INIT');
console.log('========================================');
console.log('appId: ' + appId);
console.log('serverUrl: ' + getServerUrl());
console.log('appBaseUrl: ' + 'https://cdl.base44.app');
console.log('========================================');

export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: getServerUrl(),
  requiresAuth: false,
  appBaseUrl: 'https://cdl.base44.app' // Force production URL, never platform
});