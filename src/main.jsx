import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// ─── Capacitor Native Fix ────────────────────────────────────────────────────
// En mode Capacitor natif (APK Android Studio), les fichiers sont chargés depuis
// capacitor://localhost. Les appels API avec URLs relatives ne fonctionnent pas.
// On patche fetch et XMLHttpRequest pour rediriger /api/* vers https://app.base44.com/api/*
;(function patchFetchForCapacitor() {
  try {
    const isNative =
      typeof window !== 'undefined' &&
      window.Capacitor !== undefined &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform();

    if (!isNative) return;

    console.log('[CDL] Mode Capacitor natif détecté → patch fetch pour /api/*');
    const BASE44_API = 'https://app.base44.com';

    // Patch fetch
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
      let url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
      if (url.startsWith('/api/') || url.startsWith('/auth/')) {
        const newUrl = BASE44_API + url;
        console.log('[CDL fetch patch]', url, '→', newUrl);
        if (typeof input === 'string') {
          return originalFetch.call(this, newUrl, init);
        } else {
          return originalFetch.call(this, new Request(newUrl, input), init);
        }
      }
      return originalFetch.apply(this, arguments);
    };

    // Patch XMLHttpRequest (axios utilise XHR) via Proxy
    const OrigXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = new Proxy(OrigXHR, {
      construct(Target, args) {
        const xhr = new Target(...args);
        return new Proxy(xhr, {
          get(target, prop) {
            if (prop === 'open') {
              return function(method, url, ...rest) {
                if (typeof url === 'string' && (url.startsWith('/api/') || url.startsWith('/auth/'))) {
                  url = BASE44_API + url;
                  console.log('[CDL XHR patch] →', url);
                }
                return target.open.call(target, method, url, ...rest);
              };
            }
            const val = target[prop];
            return typeof val === 'function' ? val.bind(target) : val;
          },
          set(target, prop, value) {
            target[prop] = value;
            return true;
          }
        });
      }
    });

    console.log('[CDL] ✅ Patch fetch/XHR Capacitor appliqué');
  } catch(e) {
    console.error('[CDL] Erreur patch Capacitor:', e);
  }
})();

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)