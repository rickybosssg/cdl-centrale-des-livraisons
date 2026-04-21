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

// Lire le token depuis localStorage en priorité (APK Android : persisté après OTP)
// appParams.token est résolu une seule fois au démarrage depuis l'URL
// localStorage peut contenir un token plus récent (sauvegardé après OTP)
function getEffectiveToken() {
  const urlToken = token; // depuis appParams (URL param ou ancien localStorage)
  try {
    const stored = localStorage.getItem('base44_access_token');
    if (stored && stored !== urlToken) {
      console.log('[CDL] base44Client: token depuis localStorage (post-OTP)');
      return stored;
    }
  } catch (_) {}
  return urlToken;
}

const effectiveToken = getEffectiveToken();

console.log('========================================');
console.log('BASE44 CLIENT INIT');
console.log('========================================');
console.log('appId: ' + appId);
console.log('serverUrl: ' + getServerUrl());
console.log('token (effective): ' + (effectiveToken ? 'OUI (' + effectiveToken.substring(0, 12) + '...)' : 'NON'));
console.log('========================================');

export const base44 = createClient({
  appId,
  token: effectiveToken,
  functionsVersion,
  serverUrl: getServerUrl(),
  requiresAuth: false,
  appBaseUrl: 'https://cdl.base44.app' // Force production URL, never platform
});