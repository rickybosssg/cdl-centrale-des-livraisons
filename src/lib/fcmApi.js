/**
 * fcmApi.js — Sauvegarde robuste des tokens FCM via le SDK base44
 *
 * Utilise base44.functions.invoke('saveFcmTokenPublic', ...) qui gère
 * automatiquement le Bearer token — plus de 403.
 */

import { base44 } from '@/api/base44Client';

const PENDING_KEY = 'cdl_fcm_pending_token';

/**
 * Sauvegarde un token FCM (upsert) via le SDK base44.
 * Ne throw jamais — retourne { success, action, error }.
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

  return _doSave({ user_email, token, device_type });
}

async function _doSave({ user_email, token, device_type }) {
  try {
    // Utiliser le SDK — le proxy auto-synchro le Bearer token depuis localStorage
    const res = await base44.functions.invoke('saveFcmTokenPublic', {
      user_email,
      token,
      device_type,
    });
    const result = res?.data || res;
    if (result?.success) {
      console.log('[fcmApi] ✅ Token FCM sauvegardé — action:', result.action, '| user:', user_email);
      try { localStorage.removeItem(PENDING_KEY); } catch (_) {}
      return result;
    } else {
      const err = result?.error || 'Erreur inconnue';
      console.error('[fcmApi] ❌ Erreur sauvegarde:', err);
      return { success: false, error: err };
    }
  } catch (err) {
    console.error('[fcmApi] ❌ saveFcmToken error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Retry automatique du token en attente au boot.
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
    console.log('[fcmApi] 🔄 Flush token FCM en attente pour:', pending.user_email);
    await _doSave(pending);
  } catch (_) {}
}

/**
 * Récupère les tokens FCM actifs d'un utilisateur.
 */
export async function getFcmTokens(user_email) {
  try {
    const res = await base44.functions.invoke('getFcmTokens', { user_email });
    const data = res?.data || res;
    return data?.tokens || [];
  } catch (err) {
    console.error('[fcmApi] ❌ getFcmTokens error:', err.message);
    return [];
  }
}