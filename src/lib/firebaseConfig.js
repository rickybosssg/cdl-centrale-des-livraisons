/**
 * Configuration Firebase — Projet CDL: cdl-app-4743c
 *
 * RÈGLE : project_id DOIT correspondre au FIREBASE_SERVICE_ACCOUNT_JSON backend.
 * Backend vérifié → project_id = "cdl-app-4743c"
 *
 * Les valeurs VITE_FIREBASE_* sont lues depuis l'environnement.
 * Les fallbacks hardcodés correspondent au projet cdl-app-4743c.
 * Ces valeurs sont PUBLIQUES (config client Firebase, pas des secrets).
 *
 * ⚠️ Si les VITE_* ne sont pas définies dans Base44 → mettre les vraies valeurs ici.
 *    Aller sur Firebase Console → Paramètres projet → Vos applications → Config SDK
 *    et remplacer les PLACEHOLDER ci-dessous.
 */

const FIREBASE_PROJECT_ID = 'cdl-app-4743c';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'PLACEHOLDER_API_KEY',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${FIREBASE_PROJECT_ID}.firebaseapp.com`,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${FIREBASE_PROJECT_ID}.appspot.com`,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || 'PLACEHOLDER_SENDER_ID',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || 'PLACEHOLDER_APP_ID',
};

// VAPID Key pour les tokens web push (PWA)
export const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || 'PLACEHOLDER_VAPID_KEY';

// ── Vérification de cohérence ──────────────────────────────────────────────
const resolved = {
  projectId: firebaseConfig.projectId,
  hasApiKey: !firebaseConfig.apiKey.includes('PLACEHOLDER'),
  hasSenderId: !firebaseConfig.messagingSenderId.includes('PLACEHOLDER'),
  hasAppId: !firebaseConfig.appId.includes('PLACEHOLDER'),
  hasVapidKey: !vapidKey.includes('PLACEHOLDER'),
};

if (resolved.projectId !== FIREBASE_PROJECT_ID) {
  console.error('[firebaseConfig] ⚠️ PROJET MISMATCH!', {
    config_project: resolved.projectId,
    backend_project: FIREBASE_PROJECT_ID,
    warning: 'Les tokens FCM seront invalides côté serveur!',
  });
}

const missingVars = [];
if (!resolved.hasApiKey) missingVars.push('VITE_FIREBASE_API_KEY');
if (!resolved.hasSenderId) missingVars.push('VITE_FIREBASE_MESSAGING_SENDER_ID');
if (!resolved.hasAppId) missingVars.push('VITE_FIREBASE_APP_ID');
if (!resolved.hasVapidKey) missingVars.push('VITE_FIREBASE_VAPID_KEY');

if (missingVars.length > 0) {
  console.error('[firebaseConfig] ❌ PLACEHOLDER ACTIFS — variables manquantes:', missingVars);
  console.error('[firebaseConfig] → Ces tokens FCM seront invalides. Vérifier les secrets Base44.');
} else {
  console.log('[firebaseConfig] ✅ Config complète — aucun PLACEHOLDER:', {
    projectId: resolved.projectId,
    messagingSenderId: String(firebaseConfig.messagingSenderId).slice(0, 6) + '...',
    appId: String(firebaseConfig.appId).slice(0, 15) + '...',
    hasVapidKey: resolved.hasVapidKey,
  });
}

// ── Rapport de build visible dans les logs APK ────────────────────────────────
console.log('[firebaseConfig] BUILD_REPORT:', {
  VITE_FIREBASE_PROJECT_ID: !!import.meta.env.VITE_FIREBASE_PROJECT_ID ? '✅ SET' : '❌ PLACEHOLDER',
  VITE_FIREBASE_API_KEY: !!import.meta.env.VITE_FIREBASE_API_KEY ? '✅ SET' : '❌ PLACEHOLDER',
  VITE_FIREBASE_APP_ID: !!import.meta.env.VITE_FIREBASE_APP_ID ? '✅ SET' : '❌ PLACEHOLDER',
  VITE_FIREBASE_MESSAGING_SENDER_ID: !!import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ? '✅ SET' : '❌ PLACEHOLDER',
  VITE_FIREBASE_VAPID_KEY: !!import.meta.env.VITE_FIREBASE_VAPID_KEY ? '✅ SET' : '❌ PLACEHOLDER',
});