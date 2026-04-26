/**
 * fcmApi.js — Sauvegarde robuste des tokens FCM
 *
 * Stratégie multi-couche pour APK Capacitor :
 * 1. Stocker le token FCM en attente dans localStorage
 * 2. Envoyer dès que possible avec le token Bearer
 * 3. Si pas de token auth encore → retry automatique jusqu'à 10x
 *
 * La fonction backend saveFcmTokenPublic utilise asServiceRole,
 * mais Base44 plateforme exige quand même un Bearer token HTTP.
 */

const APP_ID = import.meta.env.VITE_BASE44_APP_ID || '69c3c74fc4b62396dca61751';
const SAVE_URL = `https://api.base44.app/api/apps/${APP_ID}/functions/saveFcmTokenPublic`;
const GET_URL  = `https://api.base44.app/api/apps/${APP_ID}/functions/getFcmTokens`;

// Clé localStorage pour token en attente
const PENDING_KEY = 'cdl_fcm_pending_token';

function getAuthToken() {
  try { return localStorage.getItem('base44_access_token') || ''; } catch (_) { return ''; }
}

async function postJson(url, payload) {
  const authToken = getAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data?.error || `HTTP ${res.status}`), { status: res.status });
  }
  return data;
}

/**
 * Sauvegarde un token FCM (upsert).
 * Ne throw jamais — retourne { success, action, error }.
 *
 * Si pas d'auth disponible → stocke en attente et schedule un retry.
 */
export async function saveFcmToken({ user_email, token, device_type = 'android_native' }) {
  if (!user_email || !token) {
    console.warn('[fcmApi] saveFcmToken: user_email ou token manquant');
    return { success: false, error: 'user_email et token requis' };
  }

  // Stocker en local pour retry si besoin
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ user_email, token, device_type, ts: Date.now() }));
  } catch (_) {}

  const authToken = getAuthToken();
  if (!authToken) {
    console.warn('[fcmApi] Pas de token auth — FCM token mis en attente, retry dans 3s...');
    scheduleRetry();
    return { success: false, error: 'auth_pending' };
  }

  return _doSave({ user_email, token, device_type });
}

async function _doSave({ user_email, token, device_type }) {
  try {
    const result = await postJson(SAVE_URL, { user_email, token, device_type });
    console.log('[fcmApi] ✅ Token FCM sauvegardé avec succès — action:', result.action, '| user:', user_email);
    // Supprimer le pending une fois sauvegardé
    try { localStorage.removeItem(PENDING_KEY); } catch (_) {}
    return result;
  } catch (err) {
    console.error('[fcmApi] ❌ saveFcmToken error:', err.message, '| status:', err.status);
    return { success: false, error: err.message };
  }
}

/**
 * Retry automatique du token en attente.
 * Appelé au boot si un token FCM est stocké mais pas encore envoyé.
 */
export async function flushPendingFcmToken() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return;

    const pending = JSON.parse(raw);
    // Ignorer si trop vieux (> 24h)
    if (Date.now() - pending.ts > 86400000) {
      localStorage.removeItem(PENDING_KEY);
      return;
    }

    const authToken = getAuthToken();
    if (!authToken) {
      console.log('[fcmApi] flushPending: pas encore de token auth, skip');
      return;
    }

    console.log('[fcmApi] 🔄 Flush token FCM en attente pour:', pending.user_email);
    await _doSave(pending);
  } catch (_) {}
}

let _retryCount = 0;
function scheduleRetry() {
  if (_retryCount >= 10) return;
  _retryCount++;
  setTimeout(async () => {
    const authToken = getAuthToken();
    if (!authToken) {
      scheduleRetry(); // re-schedule
      return;
    }
    await flushPendingFcmToken();
  }, 3000 * _retryCount); // backoff progressif : 3s, 6s, 9s...
}

/**
 * Récupère les tokens FCM actifs d'un utilisateur.
 */
export async function getFcmTokens(user_email) {
  try {
    const result = await postJson(GET_URL, { user_email });
    return result.tokens || [];
  } catch (err) {
    console.error('[fcmApi] ❌ getFcmTokens error:', err.message);
    return [];
  }
}