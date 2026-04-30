/**
 * fcmApi.js — Sauvegarde des tokens FCM via endpoint public
 *
 * Utilisé par FcmDiagnostic et d'autres pages.
 * FcmBootstrap a sa propre fonction saveFcmTokenRemote inline pour éviter
 * toute dépendance circulaire et garantir la non-dépendance à user_email.
 */

const APP_BASE_URL = 'https://cdl.base44.app';

/**
 * Sauvegarde un token FCM via l'endpoint public (pas besoin d'auth).
 * user_email est OBLIGATOIRE pour l'endpoint saveFcmTokenPublic.
 */
export async function saveFcmToken({ user_email, token, device_type = 'android_native' }) {
  if (!user_email || !token) {
    console.warn('[fcmApi] saveFcmToken: user_email ou token manquant');
    return { success: false, error: 'user_email et token requis' };
  }

  const url = `${APP_BASE_URL}/functions/saveFcmTokenPublic`;
  console.log(`[fcmApi] POST → saveFcmTokenPublic | user: ${user_email} | device: ${device_type}`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_email, token, device_type }),
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }

    console.log(`[fcmApi] ← HTTP ${res.status}`, JSON.stringify(data).slice(0, 300));

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}: ${data?.error || data?.raw}` };
    }

    if (data?.success) {
      console.log(`[fcmApi] ✅ Token sauvegardé! action=${data.action} id=${data.token_id}`);
    }
    return data;
  } catch (err) {
    console.error('[fcmApi] ❌ Erreur réseau:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Récupère les tokens FCM actifs d'un utilisateur.
 */
export async function getFcmTokens(user_email) {
  const url = `${APP_BASE_URL}/functions/getFcmTokens`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_email }),
    });
    const data = await res.json();
    return data?.tokens || [];
  } catch (err) {
    console.error('[fcmApi] ❌ getFcmTokens error:', err.message);
    return [];
  }
}

/**
 * Flush le token FCM en attente (no-op — plus nécessaire).
 */
export async function flushPendingFcmToken() {
  // L'endpoint public ne nécessite plus de token auth
}