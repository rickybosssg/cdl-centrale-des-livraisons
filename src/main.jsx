import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH RÉSEAU CAPACITOR — DOIT ÊTRE EN PREMIER, AVANT TOUT IMPORT RÉSEAU
// En mode Capacitor natif (protocol = capacitor:), les URLs relatives échouent.
// Ce patch force toutes les URLs /api/* et /auth/* vers app.base44.com.
// ═══════════════════════════════════════════════════════════════════════════════
;(function patchNetworkForCapacitor() {
  try {
    const API_HOST = 'https://app.base44.com';

    // Seuls les chemins API/auth doivent être redirigés vers app.base44.com
    const API_PATHS = ['/api/', '/auth/'];

    function isApiPath(path) {
      return API_PATHS.some(p => path.startsWith(p));
    }

    function fixUrl(url) {
      if (typeof url !== 'string') return url;

      // 1. URLs relatives API/auth seulement (pas les assets locaux /src/, /assets/)
      if (url.startsWith('/') && isApiPath(url)) return API_HOST + url;

      // 2. capacitor://localhost/api/... ou /auth/...
      if (url.startsWith('capacitor://localhost')) {
        const path = url.replace('capacitor://localhost', '');
        if (isApiPath(path)) return API_HOST + path;
      }

      // 3. http(s)://localhost/api/... ou /auth/...
      if (/^https?:\/\/localhost(:\d+)?\//.test(url)) {
        const path = url.replace(/^https?:\/\/localhost(:\d+)?/, '');
        if (isApiPath(path)) return url.replace(/^https?:\/\/localhost(:\d+)?/, API_HOST);
      }

      // 4. file:///android_asset/www/api/... → https://app.base44.com/api/...
      const fileApiMatch = url.match(/^file:\/\/.*?\/(api\/.+|auth\/.+)$/);
      if (fileApiMatch) return API_HOST + '/' + fileApiMatch[1];

      return url;
    }

    // Patch fetch
    const _fetch = window.fetch;
    window.fetch = function(input, init) {
      if (typeof input === 'string') {
        const fixed = fixUrl(input);
        if (fixed !== input) console.log('[CDL-PATCH] fetch:', fixed.substring(0, 100));
        return _fetch.call(this, fixed, init);
      }
      if (input instanceof Request) {
        const fixed = fixUrl(input.url);
        if (fixed !== input.url) {
          console.log('[CDL-PATCH] fetch(Request):', fixed.substring(0, 100));
          return _fetch.call(this, new Request(fixed, input), init);
        }
      }
      return _fetch.apply(this, arguments);
    };

    // Patch XHR (Axios)
    const _open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      const fixed = fixUrl(String(url));
      if (fixed !== String(url)) console.log('[CDL-PATCH] XHR:', fixed.substring(0, 100));
      return _open.call(this, method, fixed, ...rest);
    };

    console.log('[CDL-PATCH] ✅ Patch réseau actif | Protocol:', window.location?.protocol,
      '| Capacitor:', typeof window.Capacitor !== 'undefined');
  } catch(e) {
    console.error('[CDL-PATCH] Erreur patch:', e);
  }
})();

// ═══════════════════════════════════════════════════════════════════════════════
// INIT FCM — délégué entièrement à AppLayoutWrapper
// On ne fait RIEN ici pour éviter les crashes au démarrage
// ═══════════════════════════════════════════════════════════════════════════════
// (FCM géré dans components/AppLayoutWrapper après montage React)

// ═══════════════════════════════════════════════════════════════════════════════
// MOUNT REACT
// ═══════════════════════════════════════════════════════════════════════════════
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)