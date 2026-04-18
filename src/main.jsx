import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// ─── Capacitor Fix : URLs relatives → app.base44.com ─────────────────────────
// En mode Capacitor natif, la WebView charge depuis capacitor://localhost
// donc toutes les URLs relatives (/api/*, /auth/*) échouent silencieusement.
// Ce patch intercepte fetch ET XMLHttpRequest (Axios) pour rediriger vers le bon host.
;(function patchForCapacitor() {
  try {
    const isNative =
      typeof window !== 'undefined' &&
      window.Capacitor !== undefined &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform();

    if (!isNative) {
      console.log('[CDL] Mode web — pas de patch nécessaire');
      return;
    }

    const API_HOST = 'https://app.base44.com';

    function fixUrl(url) {
      if (typeof url !== 'string') return url;
      // URL relative commençant par /api/ ou /auth/
      if (url.startsWith('/api/') || url.startsWith('/auth/')) {
        return API_HOST + url;
      }
      // URL commençant par capacitor://localhost/api/ ou capacitor://localhost/auth/
      if (url.startsWith('capacitor://localhost/api/') || url.startsWith('capacitor://localhost/auth/')) {
        return API_HOST + url.replace('capacitor://localhost', '');
      }
      // URL commençant par http://localhost/api/ ou http://localhost/auth/
      if (url.match(/^https?:\/\/localhost(:\d+)?\/(api|auth)\//)) {
        return url.replace(/^https?:\/\/localhost(:\d+)?/, API_HOST);
      }
      return url;
    }

    // Patch fetch
    const _fetch = window.fetch;
    window.fetch = function(input, init) {
      if (typeof input === 'string') {
        const fixed = fixUrl(input);
        if (fixed !== input) console.log('[CDL] fetch patched:', input, '→', fixed);
        return _fetch.call(this, fixed, init);
      }
      if (input instanceof Request) {
        const fixed = fixUrl(input.url);
        if (fixed !== input.url) {
          console.log('[CDL] fetch Request patched:', input.url, '→', fixed);
          return _fetch.call(this, new Request(fixed, input), init);
        }
      }
      return _fetch.apply(this, arguments);
    };

    // Patch XMLHttpRequest (utilisé par Axios / createAxiosClient)
    const _open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      const fixed = fixUrl(url);
      if (fixed !== url) console.log('[CDL] XHR patched:', url, '→', fixed);
      return _open.call(this, method, fixed, ...rest);
    };

    console.log('[CDL] ✅ Capacitor API patch appliqué → ' + API_HOST);
  } catch(e) {
    console.error('[CDL] Patch Capacitor error:', e);
  }
})();

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)