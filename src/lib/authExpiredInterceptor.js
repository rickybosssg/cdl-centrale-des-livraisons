/**
 * authExpiredInterceptor — Intercepteur global fetch v2
 *
 * Détecte les 403 "auth_required" sur tous les appels réseau.
 * Stratégie :
 *   1. Tenter re-login silencieux via sessionManager
 *   2. Si succès → continuer silencieusement (aucun message, aucun redirect)
 *   3. Si échec → afficher message clair + redirect /connexion après 2s
 *
 * ⚠️ NE PAS TOUCHER AUX NOTIFICATIONS PUSH
 * ⚠️ NE PAS TOUCHER À FcmToken
 * ⚠️ NE PAS TOUCHER À sendCdlNotification
 */

let _isHandlingExpiry = false;
let _lastHandledAt = 0;
const MIN_HANDLE_INTERVAL_MS = 10_000; // Éviter les triggers en rafale

async function handleSessionExpired() {
  const now = Date.now();
  if (_isHandlingExpiry) return;
  if (now - _lastHandledAt < MIN_HANDLE_INTERVAL_MS) return;

  _isHandlingExpiry = true;
  _lastHandledAt = now;

  console.warn('[AUTH_INTERCEPTOR] 🔴 Session expirée — tentative refresh silencieux...');

  try {
    const { silentRefresh } = await import('@/lib/sessionManager');
    const refreshed = await silentRefresh();

    if (refreshed) {
      console.log('[AUTH_INTERCEPTOR] ✅ Session restaurée silencieusement');
      _isHandlingExpiry = false;
      return; // Session OK — rien à faire
    }
  } catch (e) {
    console.warn('[AUTH_INTERCEPTOR] silentRefresh error:', e.message);
  }

  // Refresh impossible → message + redirect propre
  console.warn('[AUTH_INTERCEPTOR] ❌ Refresh impossible — redirection vers connexion');

  // Afficher un toast si sonner est dispo (non-bloquant)
  try {
    const { toast } = await import('sonner');
    toast.error('Session expirée, veuillez vous reconnecter.', { duration: 4000 });
  } catch (_) {}

  try { localStorage.removeItem('base44_access_token'); } catch (_) {}

  setTimeout(() => {
    if (!window.location.pathname.includes('/connexion')) {
      window.location.href = '/connexion';
    }
    _isHandlingExpiry = false;
  }, 2000);
}

let _interceptorInstalled = false;

export function installAuthExpiredInterceptor() {
  if (_interceptorInstalled) return; // Idempotent — ne pas wrapper deux fois
  _interceptorInstalled = true;

  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    if (response.status === 403) {
      try {
        const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');

        // Exclure les appels auth pour éviter les boucles infinies
        if (url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/me')) {
          return response;
        }

        const cloned = response.clone();
        const data = await cloned.json().catch(() => ({}));
        const reason = data?.extra_data?.reason || data?.reason || '';
        const message = (data?.message || data?.error || '').toLowerCase();

        const isAuthExpired = reason === 'auth_required'
          || message.includes('logged in')
          || message.includes('not authenticated')
          || message.includes('unauthorized');

        if (isAuthExpired) {
          console.warn('[AUTH_INTERCEPTOR] 403 auth_required intercepté | url:', url);
          handleSessionExpired(); // non-bloquant
        }
      } catch (_) {}
    }

    return response;
  };

  console.log('[AUTH_INTERCEPTOR] ✅ Installé (idempotent) — refresh silencieux actif');
}