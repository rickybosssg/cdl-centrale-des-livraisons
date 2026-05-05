/**
 * authExpiredInterceptor — Intercepteur global fetch
 *
 * Détecte les 403 "auth_required" sur tous les appels réseau.
 * Stratégie :
 *   1. Tenter re-login silencieux via sessionManager
 *   2. Seulement si ça échoue → logout + redirect /connexion
 *
 * ⚠️ NE PAS TOUCHER AUX NOTIFICATIONS PUSH
 */

let _isHandlingExpiry = false;

async function handleSessionExpired() {
  if (_isHandlingExpiry) return;
  _isHandlingExpiry = true;

  console.warn('[AUTH_INTERCEPTOR] 🔴 Session expirée — tentative refresh silencieux...');

  try {
    const { silentRefresh } = await import('@/lib/sessionManager');
    const refreshed = await silentRefresh();

    if (refreshed) {
      console.log('[AUTH_INTERCEPTOR] ✅ Session restaurée silencieusement');
      _isHandlingExpiry = false;
      return; // Session OK — pas de redirect
    }
  } catch (e) {
    console.warn('[AUTH_INTERCEPTOR] silentRefresh import error:', e.message);
  }

  // Refresh impossible → logout propre
  console.warn('[AUTH_INTERCEPTOR] ❌ Refresh impossible — logout + redirect connexion');
  try { localStorage.removeItem('base44_access_token'); } catch (_) {}
  try { localStorage.removeItem('base44_token'); } catch (_) {}

  setTimeout(() => {
    window.location.href = '/connexion';
  }, 500);
}

export function installAuthExpiredInterceptor() {
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    if (response.status === 403) {
      try {
        const url = typeof args[0] === 'string' ? args[0] : '';
        // Ne pas intercepter les appels auth/login eux-mêmes (évite boucle infinie)
        if (url.includes('/auth/login') || url.includes('/auth/register')) {
          return response;
        }

        const cloned = response.clone();
        const data = await cloned.json().catch(() => ({}));
        const reason = data?.extra_data?.reason || data?.reason || '';
        const message = data?.message || '';

        if (reason === 'auth_required' || message.includes('logged in')) {
          console.warn('[AUTH_INTERCEPTOR] 403 auth_required | url:', url);
          handleSessionExpired(); // async — non-bloquant
        }
      } catch (_) {}
    }

    return response;
  };

  console.log('[AUTH_INTERCEPTOR] ✅ Installé — refresh silencieux actif');
}