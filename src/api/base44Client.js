import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion } = appParams;

function getServerUrl() {
  if (typeof window === 'undefined') return '';
  // APK natif Capacitor (protocole file: ou capacitor:) → pointer vers le vrai serveur
  if (window.location?.protocol === 'file:') return 'https://cdl.base44.app';
  if (window.location?.protocol === 'capacitor:') return 'https://cdl.base44.app';
  return '';
}

function getStoredToken() {
  try { return localStorage.getItem('base44_access_token') || null; } catch (_) { return null; }
}

const effectiveToken = getStoredToken() || token;

console.log('[CDL] base44Client init | appId:', appId, '| token:', effectiveToken ? 'OUI' : 'NON');

// Client SDK interne — ne pas exporter directement
const _client = createClient({
  appId,
  token: effectiveToken,
  functionsVersion,
  serverUrl: getServerUrl(),
  requiresAuth: false,
  appBaseUrl: 'https://cdl.base44.app',
});

/**
 * syncBase44Token — resynchronise le token SDK depuis localStorage.
 * Essentiel pour APK Android où le login arrive après l'init du client.
 */
export function syncBase44Token() {
  try {
    const stored = getStoredToken();
    if (stored) _client.auth.setToken(stored);
  } catch (_) {}
}

/**
 * Proxy base44 : intercepte chaque accès et synchro le token automatiquement.
 * Ainsi, TOUS les appels (entities, functions, auth, etc.) utilisent
 * toujours le token le plus récent — sans aucun changement dans les composants.
 */
function makeAutoSyncProxy(target) {
  return new Proxy(target, {
    get(obj, prop) {
      // Synchronise le token à chaque accès à une propriété du client
      syncBase44Token();
      const val = obj[prop];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        return makeAutoSyncProxy(val);
      }
      if (typeof val === 'function') {
        return (...args) => {
          syncBase44Token();
          return val.apply(obj, args);
        };
      }
      return val;
    },
  });
}

export const base44 = makeAutoSyncProxy(_client);