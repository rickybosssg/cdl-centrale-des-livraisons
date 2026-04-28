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
// saveFcmTokenPublic = endpoint sans auth utilisateur requis (évite le 403 APK natif)
const SAVE_URL = `https://app.base44.com/api/apps/${APP_ID}/functions/saveFcmTokenPublic`;
const GET_URL  = `https://app.base44.com/api/apps/${APP_ID}/functions/getFcmTokens`;

// Clé localStorage pour token en attente
const PENDING_KEY = 'cdl_fcm_pending_token';

function getAuthToken() {
  try { return localStorage.getItem('base44_access_token') || ''; } catch (_) { return ''; }
}

async function postJson(url, payload, withAuth = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (withAuth) {
    const authToken = getAuthToken();
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  }

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

  // saveFcmTokenPublic ne nécessite PAS de Bearer token — appel direct
  return _doSave({ user_email, token, device_type });
}

async function _doSave({ user_email, token, device_type }) {
  try {
    // Toujours envoyer le Bearer token s'il est disponible (évite le 403 Base44)
    const result = await postJson(SAVE_URL, { user_email, token, device_type }, true);
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

    // Plus de dépendance Bearer token — l'endpoint est public
    console.log('[fcmApi] 🔄 Flush token FCM en attente pour:', pending.user_email);
    await _doSave(pending);
  } catch (_) {}
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