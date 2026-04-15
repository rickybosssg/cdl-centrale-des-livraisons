/**
 * Service Worker minimal — aucune Firebase, validation basique
 * Étape 1 : Validation du SW sans aucun code externe
 */

console.log('[SW] 🟢 Démarrage Service Worker...');
console.log('[SW] Scope:', self.location.href);

// ─────────────────────────────────────────────────────────────────
// LIFECYCLE
// ─────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  console.log('[SW] 📦 Install event triggered');
  console.log('[SW] Worker version: v1-minimal');
  self.skipWaiting();
  console.log('[SW] ✅ skipWaiting() appelé');
});

self.addEventListener('activate', (event) => {
  console.log('[SW] 🔄 Activate event triggered');
  event.waitUntil(clients.claim());
  console.log('[SW] ✅ claim() appelé — SW maintenant contrôleur');
});

// ─────────────────────────────────────────────────────────────────
// MESSAGES (pour communication futur)
// ─────────────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  console.log('[SW] 📨 Message reçu de client:', event.data);
  if (event.data?.type === 'ping') {
    console.log('[SW] ✅ PING reçu — SW est actif');
    event.ports[0].postMessage({ status: 'pong', timestamp: new Date().toISOString() });
  }
});

// ─────────────────────────────────────────────────────────────────
// FETCH (optionnel — passthrough)
// ─────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  // Passthrough — pas de cache pour le moment
  // Juste pour validation que le SW intercepte les requêtes
});

console.log('[SW] ✅ Service Worker prêt et stable');
console.log('[SW] ✅ Aucun code Firebase, aucune dépendance externe');
console.log('[SW] ===== FIN INITIALISATION =====');
