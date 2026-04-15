/**
 * Service Worker minimal — aucune Firebase, validation basique
 */

console.log('[SW] 🟢 Démarrage');

// ─────────────────────────────────────────────────────────────────
// LIFECYCLE
// ─────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  console.log('[SW] 📦 Install event');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] 🔄 Activate event');
  event.waitUntil(clients.claim());
});

// ─────────────────────────────────────────────────────────────────
// MESSAGES
// ─────────────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  console.log('[SW] 📨 Message reçu:', event.data?.type);
});

console.log('[SW] ✅ Prêt');
