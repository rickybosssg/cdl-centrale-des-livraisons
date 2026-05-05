/**
 * authExpiredInterceptor — Intercepteur global fetch
 *
 * Détecte les 403 "auth_required" sur tous les appels réseau.
 * Si session expirée → logout + redirect login automatique.
 *
 * RÈGLE : ne déclencher qu'une seule fois (anti-boucle).
 */

let _isHandlingExpiry = false;

function handleSessionExpired() {
  if (_isHandlingExpiry) return;
  _isHandlingExpiry = true;

  console.warn('[AUTH_INTERCEPTOR] 🔴 Session expirée détectée — logout automatique');

  // Nettoyer le token
  try { localStorage.removeItem('base44_access_token'); } catch (_) {}
  try { localStorage.removeItem('base44_token'); } catch (_) {}

  // Redirection vers login après un court délai (laisser le log s'afficher)
  setTimeout(() => {
    window.location.href = '/connexion';
  }, 500);
}

export function installAuthExpiredInterceptor() {
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    // Cloner pour lire le body sans consommer le stream
    if (response.status === 403) {
      try {
        const cloned = response.clone();
        const data = await cloned.json().catch(() => ({}));
        const reason = data?.extra_data?.reason || data?.reason || '';
        const message = data?.message || '';

        if (reason === 'auth_required' || message.includes('logged in')) {
          console.warn('[AUTH_INTERCEPTOR] 403 auth_required détecté | url:', args[0]);
          handleSessionExpired();
        }
      } catch (_) {}
    }

    return response;
  };

  console.log('[AUTH_INTERCEPTOR] ✅ Installé — surveillance 403 auth_required active');
}