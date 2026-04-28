/**
 * fcmApi.js — Sauvegarde robuste des tokens FCM
 *
 * Stratégie :
 * 1. Appel HTTP direct avec Bearer token lu dynamiquement depuis localStorage
 * 2. Retry automatique toutes les 2s si pas encore de token auth (race condition au boot)
 * 3. Token FCM stocké en localStorage comme filet de sécurité (flush au prochain boot)
 */

const APP_ID = import.meta.env.VITE_BASE44_APP_ID || '69c3c74fc4b62396dca61751';
const BASE_URL = `https://app.base44.com/api/apps/${APP_ID}/functions`;
const PENDING_KEY = 'cdl_fcm_pending_token';

/**
 * Cherche le Bearer token dans toutes les clés connues du localStorage
 */
function getAuthToken() {
  const keys = ['base44_access_token', 'access_token', 'token', 'base44_token'];
  for (const key of keys) {
    try {
      const val = localStorage.getItem(key);
      if (val && val.length > 20) {
        console.log(`[fcmApi] Token auth trouvé sous la clé: "${key}" (length: ${val.length})`);
        return val;
      }
    } catch (_) {}
  }
  // Dump de toutes les clés pour debug
  try {
    const allKeys = Object.keys(localStorage).filter(k =>
      k.includes('token') || k.includes('auth') || k.includes('access') || k.includes('base44')
    );
    console.log('[fcmApi] Clés localStorage pertinentes:', allKeys.join(', ') || 'AUCUNE');
  } catch (_) {}
  return null;
}

/**
 * Appel HTTP direct vers un endpoint backend Base44
 */
async function callBackend(functionName, payload) {
  const token = getAuthToken();
  const url = `${BASE_URL}/${functionName}`;

  console.log(`[fcmApi] → ${functionName} | token: ${token ? '✅ présent (' + token.length + ' chars)' : '❌ ABSENT'}`);

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }

  console.log(`[fcmApi] ← ${functionName} HTTP ${res.status} | response:`, JSON.stringify(data).slice(0, 300));

  if (!res.ok) {
    const err = Object.assign(
      new Error(`HTTP ${res.status}: ${data?.error || data?.raw || 'Unknown'}`),
      { status: res.status, noAuth: res.status === 401 || res.status === 403 }
    );
    throw err;
  }
  return data;
}

/**
 * Sauvegarde un token FCM.
 * Si pas de token auth disponible → retry toutes les 2s pendant 60s max.
 * Ne throw jamais.
 */
export async function saveFcmToken({ user_email, token, device_type = 'android_native' }) {
  if (!user_email || !token) {
    console.warn('[fcmApi] saveFcmToken: user_email ou token manquant');
    return { success: false, error: 'user_email et token requis' };
  }

  // Stocker en attente immédiatement (filet de sécurité)
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ user_email, token, device_type, ts: Date.now() }));
  } catch (_) {}

  console.log(`[fcmApi] saveFcmToken START | user: ${user_email} | device: ${device_type}`);

  // Tentative immédiate
  const result = await _trySave({ user_email, token, device_type });
  if (result.success) return result;

  // Si auth manquante → retry automatique
  if (result.noAuth) {
    console.log('[fcmApi] ⏳ Token auth absent — retry automatique toutes les 2s (max 60s)');
    return new Promise((resolve) => {
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        const authToken = getAuthToken();
        console.log(`[fcmApi] Retry #${attempts} | auth: ${authToken ? '✅' : '❌'}`);

        if (authToken) {
          clearInterval(interval);
          const r = await _trySave({ user_email, token, device_type });
          resolve(r);
        } else if (attempts >= 30) {
          clearInterval(interval);
          console.error('[fcmApi] ❌ Abandon après 60s — token auth jamais disponible');
          resolve({ success: false, error: 'Auth non disponible' });
        }
      }, 2000);
    });
  }

  return result;
}

async function _trySave({ user_email, token, device_type }) {
  try {
    const data = await callBackend('saveFcmTokenPublic', { user_email, token, device_type });
    if (data?.success) {
      console.log(`[fcmApi] ✅ Token enregistré! action=${data.action} id=${data.token_id} user=${user_email}`);
      try { localStorage.removeItem(PENDING_KEY); } catch (_) {}
      return data;
    }
    return { success: false, error: data?.error || 'Réponse inattendue', noAuth: false };
  } catch (err) {
    return { success: false, error: err.message, noAuth: !!err.noAuth };
  }
}

/**
 * Flush le token FCM en attente — appelé au boot une fois l'user authentifié.
 */
export async function flushPendingFcmToken() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return;
    const pending = JSON.parse(raw);
    if (Date.now() - pending.ts > 86400000) {
      localStorage.removeItem(PENDING_KEY);
      return;
    }
    const token = getAuthToken();
    if (!token) {
      console.log('[fcmApi] flushPendingFcmToken: pas encore de token auth, skip');
      return;
    }
    console.log('[fcmApi] 🔄 Flush token en attente pour:', pending.user_email);
    await _trySave(pending);
  } catch (_) {}
}

/**
 * Récupère les tokens FCM actifs d'un utilisateur.
 */
export async function getFcmTokens(user_email) {
  try {
    const data = await callBackend('getFcmTokens', { user_email });
    return data?.tokens || [];
  } catch (err) {
    console.error('[fcmApi] ❌ getFcmTokens error:', err.message);
    return [];
  }
}