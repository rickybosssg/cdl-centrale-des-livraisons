/**
 * sessionManager — Gestion de session persistante CDL v2
 *
 * Stratégie complète :
 * 1. Sauvegarder les credentials (email + mdp obfusqués) au login
 * 2. Ping silencieux toutes les 5min — refresh proactif AVANT expiration
 * 3. Si token expiré → re-login silencieux immédiat avec credentials stockés
 * 4. Seulement si re-login échoue → logout + redirect connexion
 * 5. Jamais de redirect brutal tant que credentials existent
 *
 * ⚠️ NE PAS TOUCHER AUX NOTIFICATIONS PUSH
 * ⚠️ NE PAS TOUCHER À FcmToken
 * ⚠️ NE PAS TOUCHER À sendCdlNotification
 */

const APP_ID = import.meta.env?.VITE_BASE44_APP_ID || '69c3c74fc4b62396dca61751';
const AUTH_BASE = `https://app.base44.com/api/apps/${APP_ID}/auth`;
const CREDS_KEY = 'cdl_session_creds';
const PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes (était 20min — plus proactif)

// ── Obfuscation simple — suffisant pour localStorage APK ─────────────────────
function encode(str) {
  try { return btoa(encodeURIComponent(str)); } catch (_) { return ''; }
}
function decode(str) {
  try { return decodeURIComponent(atob(str)); } catch (_) { return ''; }
}

// ── Credentials ───────────────────────────────────────────────────────────────
export function saveCredentials(email, password) {
  try {
    const data = encode(JSON.stringify({ email, password, saved_at: Date.now() }));
    localStorage.setItem(CREDS_KEY, data);
    console.log('[SESSION] credentials sauvegardés pour re-login silencieux');
  } catch (_) {}
}

export function hasCredentials() {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(decode(raw));
    return !!(parsed?.email && parsed?.password);
  } catch (_) { return false; }
}

function loadCredentials() {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(decode(raw));
    if (!parsed?.email || !parsed?.password) return null;
    return parsed;
  } catch (_) { return null; }
}

export function clearCredentials() {
  try { localStorage.removeItem(CREDS_KEY); } catch (_) {}
}

// ── Re-login silencieux ───────────────────────────────────────────────────────
let _isSilentRefreshing = false;
// Promise partagée pour éviter les appels concurrents
let _silentRefreshPromise = null;

export async function silentRefresh() {
  // Si déjà en cours, attendre le résultat existant
  if (_silentRefreshPromise) {
    console.log('[SESSION] silentRefresh déjà en cours — attente...');
    return _silentRefreshPromise;
  }

  const creds = loadCredentials();
  if (!creds) {
    console.warn('[SESSION] silentRefresh impossible — aucun credential stocké');
    return false;
  }

  _silentRefreshPromise = _doSilentRefresh(creds);
  const result = await _silentRefreshPromise;
  _silentRefreshPromise = null;
  return result;
}

async function _doSilentRefresh(creds) {
  console.log('[SESSION] 🔄 Tentative re-login silencieux pour:', creds.email);
  try {
    const res = await fetch(`${AUTH_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: creds.email, password: creds.password }),
    });
    const data = await res.json().catch(() => ({}));
    const token = data?.access_token || data?.token;

    if (res.ok && token) {
      localStorage.setItem('base44_access_token', token);
      try {
        const { syncBase44Token } = await import('@/api/base44Client');
        syncBase44Token();
      } catch (_) {}
      console.log('[SESSION] ✅ Re-login silencieux réussi — nouveau token stocké');
      return true;
    } else {
      console.warn('[SESSION] ❌ Re-login silencieux échoué — status:', res.status);
      return false;
    }
  } catch (e) {
    console.warn('[SESSION] ❌ Re-login silencieux erreur réseau:', e.message);
    return false;
  }
}

// ── Ping périodique proactif ──────────────────────────────────────────────────
// Vérifie la session toutes les 5min et rafraîchit AVANT expiration
let _pingTimer = null;

async function pingSession() {
  try {
    const token = localStorage.getItem('base44_access_token');
    if (!token) return;

    const res = await fetch(`https://app.base44.com/api/apps/${APP_ID}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (res.ok) {
      // Session valide — rien à faire
    } else if (res.status === 403 || res.status === 401) {
      console.warn('[SESSION] ⚠️ Ping → session expirée — refresh silencieux...');
      await silentRefresh();
    }
  } catch (_) {
    // Erreur réseau — non-fatal, on réessaiera au prochain ping
  }
}

export function startSessionPing() {
  if (_pingTimer) return; // déjà démarré
  // Premier ping immédiat après 30s (laisser l'app se charger)
  setTimeout(pingSession, 30_000);
  _pingTimer = setInterval(pingSession, PING_INTERVAL_MS);
  console.log('[SESSION] 🔔 Ping périodique démarré (toutes les 5min)');
}

export function stopSessionPing() {
  if (_pingTimer) {
    clearInterval(_pingTimer);
    _pingTimer = null;
  }
}