/**
 * sessionManager — Gestion de session persistante CDL
 *
 * Stratégie :
 * 1. Sauvegarder les credentials (email + mdp chiffré simple) au login
 * 2. Ping silencieux toutes les 20min pour garder la session active
 * 3. Si 403 auth_required → tenter re-login silencieux avec credentials stockés
 * 4. Seulement si re-login échoue → logout + redirect connexion
 *
 * ⚠️ NE PAS TOUCHER AUX NOTIFICATIONS PUSH
 */

const APP_ID = import.meta.env?.VITE_BASE44_APP_ID || '69c3c74fc4b62396dca61751';
const AUTH_BASE = `https://app.base44.com/api/apps/${APP_ID}/auth`;
const CREDS_KEY = 'cdl_session_creds';
const PING_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes

// ── Chiffrement simple (obfuscation) — suffisant pour localStorage APK ──────
function encode(str) {
  try { return btoa(encodeURIComponent(str)); } catch (_) { return ''; }
}
function decode(str) {
  try { return decodeURIComponent(atob(str)); } catch (_) { return ''; }
}

// ── Credentials ──────────────────────────────────────────────────────────────
export function saveCredentials(email, password) {
  try {
    const data = encode(JSON.stringify({ email, password, saved_at: Date.now() }));
    localStorage.setItem(CREDS_KEY, data);
    console.log('[SESSION] credentials sauvegardés pour re-login silencieux');
  } catch (_) {}
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

export async function silentRefresh() {
  if (_isSilentRefreshing) {
    console.log('[SESSION] silentRefresh déjà en cours — skip');
    return false;
  }

  const creds = loadCredentials();
  if (!creds) {
    console.warn('[SESSION] silentRefresh impossible — aucun credential stocké');
    return false;
  }

  _isSilentRefreshing = true;
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
      // Sync dans le SDK
      try {
        const { syncBase44Token } = await import('@/api/base44Client');
        syncBase44Token();
      } catch (_) {}
      console.log('[SESSION] ✅ Re-login silencieux réussi — nouveau token stocké');
      _isSilentRefreshing = false;
      return true;
    } else {
      console.warn('[SESSION] ❌ Re-login silencieux échoué — status:', res.status);
      _isSilentRefreshing = false;
      return false;
    }
  } catch (e) {
    console.warn('[SESSION] ❌ Re-login silencieux erreur réseau:', e.message);
    _isSilentRefreshing = false;
    return false;
  }
}

// ── Ping périodique — garder la session active ────────────────────────────────
let _pingTimer = null;

async function pingSession() {
  try {
    const token = localStorage.getItem('base44_access_token');
    if (!token) return;

    const res = await fetch(`https://app.base44.com/api/apps/${APP_ID}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (res.ok) {
      console.log('[SESSION] ✅ Ping OK — session toujours active');
    } else if (res.status === 403 || res.status === 401) {
      console.warn('[SESSION] ⚠️ Ping → session expirée — tentative refresh silencieux');
      await silentRefresh();
    }
  } catch (_) {}
}

export function startSessionPing() {
  if (_pingTimer) return; // déjà démarré
  _pingTimer = setInterval(pingSession, PING_INTERVAL_MS);
  console.log('[SESSION] 🔔 Ping périodique démarré (toutes les 20min)');
}

export function stopSessionPing() {
  if (_pingTimer) {
    clearInterval(_pingTimer);
    _pingTimer = null;
  }
}