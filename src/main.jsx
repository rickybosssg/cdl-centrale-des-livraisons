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
// INIT FCM CAPACITOR — INDÉPENDANT DU SPLASH SCREEN
// Lance l'enregistrement FCM dès que l'app charge, sans attendre React.
// Stocke le token en sessionStorage pour que AppLayoutWrapper le récupère.
// ═══════════════════════════════════════════════════════════════════════════════
async function initFcmEarly() {
  try {
    // Attendre que Capacitor soit disponible (max 4s)
    let waited = 0;
    while (waited < 4000) {
      const native =
        window.location?.protocol === 'capacitor:' ||
        window.Capacitor?.isNativePlatform?.() === true;
      if (native) break;
      await new Promise(r => setTimeout(r, 200));
      waited += 200;
    }

    const isNative =
      window.location?.protocol === 'capacitor:' ||
      window.Capacitor?.isNativePlatform?.() === true;

    if (!isNative) {
      console.log('[CDL-FCM-EARLY] Mode web — init FCM ignorée ici');
      return;
    }

    console.log('[CDL-FCM-EARLY] 🔴 Mode Capacitor natif détecté — init FCM précoce...');

    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Créer le canal Android AVANT tout
    try {
      await PushNotifications.createChannel({
        id: 'default',
        name: 'CDL Notifications',
        description: 'Notifications CDL',
        importance: 5,
        sound: 'default',
        vibration: true,
      });
      console.log('[CDL-FCM-EARLY] ✅ Canal Android "default" créé (importance 5)');
    } catch(e) {
      console.warn('[CDL-FCM-EARLY] Canal déjà existant ou non supporté:', e?.message);
    }

    // Vérifier/demander la permission
    let perm = await PushNotifications.checkPermissions();
    console.log('[CDL-FCM-EARLY] Permission actuelle:', perm.receive);

    if (perm.receive === 'denied') {
      console.warn('[CDL-FCM-EARLY] ❌ Permission refusée définitivement');
      return;
    }

    if (perm.receive !== 'granted') {
      perm = await PushNotifications.requestPermissions();
      console.log('[CDL-FCM-EARLY] Permission après demande:', perm.receive);
      if (perm.receive !== 'granted') {
        console.warn('[CDL-FCM-EARLY] ❌ Permission non accordée');
        return;
      }
    }

    console.log('[CDL-FCM-EARLY] ✅ Permission accordée — enregistrement FCM...');

    // Écouter le token
    await PushNotifications.addListener('registration', async (token) => {
      const fcmToken = token.value;
      console.log('[CDL-FCM-EARLY] 🟢 ══════════════════════════════════════');
      console.log('[CDL-FCM-EARLY] 🟢 FCM TOKEN GENERATED (android_native)');
      console.log('[CDL-FCM-EARLY] 🟢 Token (30 chars):', fcmToken.substring(0, 30) + '...');
      console.log('[CDL-FCM-EARLY] 🟢 ══════════════════════════════════════');

      // Stocker pour AppLayoutWrapper
      try { sessionStorage.setItem('cdl_pending_fcm_token', fcmToken); } catch(_) {}

      // Sauvegarder dès qu'on a un user connecté (tenter immédiatement, retry si pas encore auth)
      await saveFcmTokenWhenReady(fcmToken);
    });

    await PushNotifications.addListener('registrationError', (err) => {
      console.error('[CDL-FCM-EARLY] ❌ Erreur registration FCM:', err.error);
    });

    // Déclencher l'enregistrement
    await PushNotifications.register();
    console.log('[CDL-FCM-EARLY] ✅ register() appelé — attente du token...');

  } catch(e) {
    console.error('[CDL-FCM-EARLY] Erreur init FCM précoce:', e?.message);
  }
}

// Tente de sauvegarder le token, avec retry jusqu'à ce que l'auth soit disponible
async function saveFcmTokenWhenReady(fcmToken, attempts = 0) {
  if (attempts > 20) {
    console.warn('[CDL-FCM-EARLY] ⚠️ Abandon sauvegarde token après 20 tentatives');
    return;
  }
  try {
    const { base44 } = await import('@/api/base44Client');
    const user = await base44.auth.me();
    if (!user?.email) throw new Error('No user email');

    const res = await base44.functions.invoke('saveFcmToken', {
      token: fcmToken,
      deviceType: 'android_native',
    });

    console.log('[CDL-FCM-EARLY] ✅ Token sauvegardé en BDD pour', user.email, '| action:', res.data?.action);
  } catch(e) {
    // Pas encore authentifié — réessayer dans 2 secondes
    console.log('[CDL-FCM-EARLY] Auth pas encore prête, retry dans 2s... (tentative', attempts + 1, ')');
    await new Promise(r => setTimeout(r, 2000));
    await saveFcmTokenWhenReady(fcmToken, attempts + 1);
  }
}

// Lancer FCM early (sans bloquer le rendu React)
// Flag global pour éviter double-initialisation dans AppLayoutWrapper
window.__cdl_fcm_early_started = true;
initFcmEarly().catch(e => console.error('[CDL-FCM-EARLY] Fatal:', e));

// ═══════════════════════════════════════════════════════════════════════════════
// MOUNT REACT
// ═══════════════════════════════════════════════════════════════════════════════
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)