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

    function isNative() {
      if (typeof window === 'undefined') return false;
      if (window.location?.protocol === 'capacitor:') return true;
      if (window.Capacitor?.isNativePlatform?.()) return true;
      return false;
    }

    function fixUrl(url) {
      if (typeof url !== 'string') return url;
      if (url.startsWith('/api/') || url.startsWith('/auth/')) return API_HOST + url;
      if (url.startsWith('capacitor://localhost/api/') || url.startsWith('capacitor://localhost/auth/'))
        return API_HOST + url.replace('capacitor://localhost', '');
      if (/^https?:\/\/localhost(:\d+)?\/(api|auth)\//.test(url))
        return url.replace(/^https?:\/\/localhost(:\d+)?/, API_HOST);
      return url;
    }

    // Patch fetch
    const _fetch = window.fetch;
    window.fetch = function(input, init) {
      if (typeof input === 'string') {
        const fixed = fixUrl(input);
        if (fixed !== input) console.log('[CDL-PATCH] fetch:', fixed.substring(0, 80));
        return _fetch.call(this, fixed, init);
      }
      if (input instanceof Request) {
        const fixed = fixUrl(input.url);
        if (fixed !== input.url) return _fetch.call(this, new Request(fixed, input), init);
      }
      return _fetch.apply(this, arguments);
    };

    // Patch XHR (Axios)
    const _open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      const fixed = fixUrl(String(url));
      if (fixed !== url) console.log('[CDL-PATCH] XHR:', fixed.substring(0, 80));
      return _open.call(this, method, fixed, ...rest);
    };

    const native = isNative();
    console.log('[CDL-PATCH] ✅ Patch réseau actif | Capacitor natif:', native, '| Protocol:', window.location?.protocol);
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