// 🔄 Service Worker Firebase Cloud Messaging — Démarrage
console.log('[SW] 🟢 Service Worker loaded — ready to receive FIREBASE_CONFIG');

let firebaseConfig = null;
let messaging = null;
let configReceived = false;
let initInProgress = false;

// ─────────────────────────────────────────────────────────────────────────
// 1️⃣ RÉCEPTION CONFIG
// ─────────────────────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  try {
    console.log('[SW] 📨 Message reçu de type:', event.data?.type);
    
    if (event.data?.type === 'FIREBASE_CONFIG') {
      firebaseConfig = event.data.config;
      console.log('[SW] ✅ Config stockée dans firebaseConfig');
      
      // Log brut de chaque champ
      console.log('[SW] Config détails reçus:', {
        apiKey_type: typeof firebaseConfig.apiKey,
        apiKey_value: firebaseConfig.apiKey || '❌ UNDEFINED/EMPTY',
        apiKey_length: firebaseConfig.apiKey ? firebaseConfig.apiKey.length : 0,
        
        messagingSenderId_type: typeof firebaseConfig.messagingSenderId,
        messagingSenderId_value: firebaseConfig.messagingSenderId || '❌ UNDEFINED/EMPTY',
        messagingSenderId_length: firebaseConfig.messagingSenderId ? firebaseConfig.messagingSenderId.length : 0,
        
        appId_type: typeof firebaseConfig.appId,
        appId_value: firebaseConfig.appId || '❌ UNDEFINED/EMPTY',
        appId_length: firebaseConfig.appId ? firebaseConfig.appId.length : 0,
        
        vapidKey_type: typeof firebaseConfig.vapidKey,
        vapidKey_value: firebaseConfig.vapidKey || '❌ UNDEFINED/EMPTY',
        vapidKey_length: firebaseConfig.vapidKey ? firebaseConfig.vapidKey.length : 0,
      });
      
      // Vérifier complétude stricte
      const required = ['apiKey', 'messagingSenderId', 'appId', 'vapidKey'];
      const missing = required.filter(k => !firebaseConfig[k] || firebaseConfig[k].trim?.() === '');
      
      if (missing.length > 0) {
        console.error('[SW] ❌ Config INCOMPLÈTE. Manquants:', missing);
        return;
      }
      
      console.log('[SW] ✅ Config COMPLÈTE et VALIDE');
      configReceived = true;
      
      // Lancer l'initialisation Firebase
      if (!initInProgress) {
        initInProgress = true;
        initializeFirebaseAsync();
      }
    }
  } catch (err) {
    console.error('[SW] ❌ Erreur handler message:', err.message, err.stack);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// 2️⃣ INITIALISATION FIREBASE — STRICTE
// ─────────────────────────────────────────────────────────────────────────

async function initializeFirebaseAsync() {
  try {
    // Bloquer : config doit être reçue et valide
    if (!configReceived) {
      console.error('[SW] ❌ Tentative init Firebase SANS config reçue');
      return;
    }
    
    if (!firebaseConfig.apiKey || !firebaseConfig.messagingSenderId || !firebaseConfig.appId) {
      console.error('[SW] ❌ Config invalide avant initializeApp:', {
        apiKey: !!firebaseConfig.apiKey,
        messagingSenderId: !!firebaseConfig.messagingSenderId,
        appId: !!firebaseConfig.appId,
      });
      return;
    }
    
    console.log('[SW] ⏳ Démarrage initialisation Firebase...');
    console.log('[SW] Config à passer à initializeApp:', {
      apiKey: firebaseConfig.apiKey.substring(0, 8) + '...',
      messagingSenderId: firebaseConfig.messagingSenderId.substring(0, 8) + '...',
      appId: firebaseConfig.appId.substring(0, 8) + '...',
    });
    
    // Importer Firebase modules
    console.log('[SW] ⏳ Import firebase-app.js...');
    const { initializeApp, getApps } = await import(
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'
    );
    console.log('[SW] ✅ firebase-app.js importé');
    
    console.log('[SW] ⏳ Import firebase-messaging.js...');
    const { getMessaging, onBackgroundMessage } = await import(
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js'
    );
    console.log('[SW] ✅ firebase-messaging.js importé');
    
    // Initialiser ou récupérer app
    console.log('[SW] ⏳ initializeApp() avec config...');
    let app;
    const apps = getApps();
    if (apps.length === 0) {
      app = initializeApp(firebaseConfig);
      console.log('[SW] ✅ initializeApp() → nouvelle instance créée');
    } else {
      app = apps[0];
      console.log('[SW] ✅ initializeApp() → instance existante');
    }
    
    // Initialiser messaging
    console.log('[SW] ⏳ getMessaging()...');
    messaging = getMessaging(app);
    console.log('[SW] ✅ getMessaging() → messaging objet créé');
    
    // Écouter les notifications en arrière-plan
    console.log('[SW] ⏳ onBackgroundMessage()...');
    onBackgroundMessage(messaging, (payload) => {
      console.log('[SW] 📬 Notification reçue en BG:', {
        title: payload.notification?.title,
        body: payload.notification?.body,
        route: payload.data?.route,
      });
      
      const notificationTitle = payload.notification?.title || 'CDL';
      const notificationOptions = {
        body: payload.notification?.body || payload.data?.body || '',
        icon: '/logo192.png',
        badge: '/logo192.png',
        tag: payload.data?.tag || 'cdl-notification',
        data: payload.data || {},
        requireInteraction: payload.data?.priority === 'high' || payload.data?.priority === 'urgent',
      };
      
      if (payload.data?.route) {
        notificationOptions.data.route = payload.data.route;
      }
      
      self.registration.showNotification(notificationTitle, notificationOptions);
    });
    console.log('[SW] ✅ onBackgroundMessage() → listener enregistré');
    
    console.log('[SW] 🎉 Firebase Cloud Messaging PRÊT ET OPÉRATIONNEL');
    
  } catch (err) {
    console.error('[SW] ❌ Erreur initializeFirebaseAsync():', err.message);
    console.error('[SW] Stack:', err.stack);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 3️⃣ CLIC NOTIFICATION
// ─────────────────────────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  try {
    console.log('[SW] 🖱️ Notification cliquée:', event.notification.tag);
    event.notification.close();
    
    const route = event.notification.data?.route || '/';
    
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if (client.url === new URL(route, self.location).href && 'focus' in client) {
            console.log('[SW] 📍 Focus sur fenêtre existante:', route);
            return client.focus();
          }
        }
        
        if (clients.openWindow) {
          console.log('[SW] 📍 Ouverture nouvelle fenêtre:', route);
          return clients.openWindow(route);
        }
      })
    );
  } catch (err) {
    console.error('[SW] ❌ Erreur notificationclick:', err.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// 4️⃣ MONITORING
// ─────────────────────────────────────────────────────────────────────────

setTimeout(() => {
  if (!configReceived) {
    console.warn('[SW] ⚠️ Config Firebase NON REÇUE après 5s — FCM BG ne fonctionnera pas');
  } else if (!messaging) {
    console.warn('[SW] ⚠️ Config reçue mais Firebase Messaging non initialisé');
  } else {
    console.log('[SW] ✅ État final: Config reçue + Firebase Messaging actif');
  }
}, 5000);

console.log('[SW] 🟢 Service Worker initialisation complète');
