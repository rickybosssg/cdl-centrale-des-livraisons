/**
 * fcmApi.js — Appels directs aux fonctions FCM via fetch + token Bearer
 *
 * Dans l'APK Capacitor, base44.functions.invoke() ne transmet pas toujours
 * le header Authorization → 403. On contourne en appelant directement
 * l'endpoint HTTPS avec le token stocké en localStorage.
 */

const APP_ID = import.meta.env.VITE_BASE44_APP_ID || '69c3c74fc4b62396dca61751';
const BASE_URL = `https://cdl.base44.app/api/apps/${APP_ID}/functions`;

function getToken() {
  try { return localStorage.getItem('base44_access_token') || ''; } catch (_) { return ''; }
}

async function callFcmFunction(name, payload) {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw Object.assign(new Error(data?.error || `HTTP ${res.status}`), { status: res.status, data });
  }
  return data;
}

/**
 * Sauvegarde un token FCM (upsert).
 * Ne throw jamais — retourne { success, action, error }.
 */
export async function saveFcmToken({ user_email, token, device_type = 'android_native' }) {
  try {
    const result = await callFcmFunction('saveFcmTokenPublic', { user_email, token, device_type });
    console.log('[fcmApi] ✅ Token FCM sauvegardé avec succès — action:', result.action, '| user:', user_email);
    return result;
  } catch (err) {
    console.error('[fcmApi] ❌ saveFcmToken error:', err.message, '| status:', err.status);
    // Ne jamais bloquer le parcours utilisateur
    return { success: false, error: err.message };
  }
}

/**
 * Récupère les tokens FCM actifs d'un utilisateur.
 */
export async function getFcmTokens(user_email) {
  try {
    const result = await callFcmFunction('getFcmTokens', { user_email });
    return result.tokens || [];
  } catch (err) {
    console.error('[fcmApi] ❌ getFcmTokens error:', err.message);
    return [];
  }
}