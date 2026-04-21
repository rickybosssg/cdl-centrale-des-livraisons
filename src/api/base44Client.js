import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

// Avec capacitor.config.json server.url = https://cdl.base44.app,
// la WebView charge directement depuis le sous-domaine de l'app.
// Les appels relatifs (/api/...) fonctionnent donc sans serverUrl explicite.
// On garde le serverUrl explicite uniquement si on est en mode file:// (fallback)
function getServerUrl() {
  if (typeof window === 'undefined') return '';
  const proto = window.location?.protocol;
  // file:// = vieux mode sans server.url dans capacitor.config
  if (proto === 'file:') {
    console.log('[CDL] base44Client: mode file:// → serverUrl=https://cdl.base44.app');
    return 'https://cdl.base44.app';
  }
  // capacitor:// ou https:// avec server.url → les URLs relatives fonctionnent
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