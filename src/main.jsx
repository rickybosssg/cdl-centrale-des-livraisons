import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// ─── Capacitor Fix : URLs relatives → app.base44.com ─────────────────────────
// Avec server.url="https://cdl.base44.app", la WebView résout les URLs relatives
// vers cdl.base44.app — mais l'API Base44 est sur app.base44.com.
// Ce patch redirige /api/* et /auth/* vers le bon serveur en mode Capacitor natif.
;(function patchForCapacitor() {
  try {
    const isNative =
      typeof window !== 'undefined' &&
      window.Capacitor !== undefined &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform();

    if (!isNative) return;

    const API_HOST = 'https://app.base44.com';

    function fixUrl(url) {
      if (typeof url === 'string' && (url.startsWith('/api/') || url.startsWith('/auth/'))) {
        return API_HOST + url;
      }
      return url;
    }

    // Patch fetch
    const _fetch = window.fetch;
    window.fetch = function(input, init) {
      if (typeof input === 'string') return _fetch.call(this, fixUrl(input), init);
      if (input instanceof Request) {
        const fixed = fixUrl(input.url);
        if (fixed !== input.url) return _fetch.call(this, new Request(fixed, input), init);
      }
      return _fetch.apply(this, arguments);
    };

    // Patch XMLHttpRequest (axios)
    const _open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      return _open.call(this, method, fixUrl(url), ...rest);
    };

    console.log('[CDL] ✅ Capacitor API patch appliqué → app.base44.com');
  } catch(e) {
    console.error('[CDL] Patch Capacitor error:', e);
  }
})();

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)