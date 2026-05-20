/**
 * FcmTokenEngine — SOURCE UNIQUE DE VÉRITÉ FCM (Frontend)
 *
 * RÈGLES :
 * 1. Seul module autorisé à générer, sauvegarder, vérifier, désactiver, réparer les tokens
 * 2. Ordre obligatoire : lire local → save nouveau → vérifier BDD → désactiver anciens
 * 3. Jamais fenêtre avec 0 token actif
 * 4. Token lié à : user_email + device_id + app_version + platform
 * 5. Si token_count=0 → appeler repair(), logger la cause exacte
 */

import { base44 } from '@/api/base44Client';

const APP_BASE_URL = 'https://cdl.base44.app';
const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;  // 30 jours
const SAVE_DEBOUNCE_MS = 10_000;                       // 10s anti-doublon
const VERIFY_RETRIES = 3;
const ENGINE_VERSION = '1.0.0';

// ── Métadonnées appareil ──────────────────────────────────────────────────────
function getDeviceMeta() {
  try {
    const ua = navigator.userAgent || '';
    const isNative = (
      window.location?.protocol === 'capacitor:' ||
      window.location?.protocol === 'file:' ||
      window.Capacitor?.getPlatform?.() === 'android'
    );
    const platform = isNative ? 'android' : 'web';
    const device_type = isNative ? 'android_native' : 'web';

    // device_id : persisté dans localStorage (stable entre sessions)
    let device_id = null;
    try {
      device_id = localStorage.getItem('cdl_device_id');
      if (!device_id) {
        device_id = `${platform}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem('cdl_device_id', device_id);
      }
    } catch (_) {}

    return { platform, device_type, device_id, isNative };
  } catch (_) {
    return { platform: 'web', device_type: 'web', device_id: null, isNative: false };
  }
}

// ── Verrou anti-doublon save ──────────────────────────────────────────────────
const _saveRecent = new Map();

function shouldDebounce(email, tokenPreview) {
  const key = `${email}__${tokenPreview}`;
  const elapsed = Date.now() - (_saveRecent.get(key) || 0);
  if (elapsed < SAVE_DEBOUNCE_MS) return true;
  _saveRecent.set(key, Date.now());
  setTimeout(() => _saveRecent.delete(key), SAVE_DEBOUNCE_MS * 3);
  return false;
}

// ── Lecture token local ───────────────────────────────────────────────────────
function readLocalToken() {
  try {
    return {
      token: localStorage.getItem('cdl_fcm_current_token'),
      lastSave: localStorage.getItem('cdl_fcm_last_save'),
      lastUser: localStorage.getItem('cdl_fcm_last_user'),
    };
  } catch (_) {
    return { token: null, lastSave: null, lastUser: null };
  }
}

function writeLocalToken(token, email) {
  try {
    localStorage.setItem('cdl_fcm_current_token', token);
    localStorage.setItem('cdl_fcm_last_save', new Date().toISOString());
    localStorage.setItem('cdl_fcm_last_user', email);
    localStorage.setItem('cdl_fcm_last_engine_save', new Date().toISOString());
  } catch (_) {}
}

// ── Save token via backend public ─────────────────────────────────────────────
async function saveTokenToBackend(userEmail, token, deviceMeta) {
  // Lire active_profile_type depuis localStorage (mis à jour par switchActiveProfile)
  let activeProfileType = null;
  try { activeProfileType = localStorage.getItem('cdl_active_profile_type'); } catch (_) {}

  const res = await fetch(`${APP_BASE_URL}/functions/saveFcmTokenPublic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_email: userEmail,
      token,
      device_type: deviceMeta.device_type,
      device_id: deviceMeta.device_id,
      platform: deviceMeta.platform,
      engine_version: ENGINE_VERSION,
      active_profile_type: activeProfileType || undefined,
    }),
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch (_) { return { success: false, error: text.slice(0, 100) }; }
}

// ── Vérification BDD via backend public (évite les 403 Base44 auth-required) ──
// On utilise getCurrentFcmToken (backend public) au lieu de base44.entities.FcmToken.filter()
// pour ne pas dépendre de la session Base44 active sur l'APK.
async function verifyInBdd(userEmail, localToken) {
  try {
    const res = await fetch(`${APP_BASE_URL}/functions/getCurrentFcmToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_email: userEmail }),
    });
    if (!res.ok) {
      // Backend indisponible ou erreur réseau → skip silencieux (save HTTP déjà OK)
      console.warn(`[FCM_ENGINE] verifyInBdd | backend ${res.status} → skip | user=${userEmail}`);
      return { verified: false, count: 0, tokens: [], skipped: true };
    }
    const data = await res.json().catch(() => ({}));
    const count = data?.count ?? (data?.token ? 1 : 0);
    const bddTokenPreview = data?.token?.slice(0, 30);
    const localPreview = localToken?.slice(0, 30);
    const localMatch = !!(localPreview && bddTokenPreview && bddTokenPreview === localPreview);

    if (count > 0) {
      console.log(`[FCM_ENGINE] verifyInBdd OK | count=${count} | localMatch=${localMatch} | user=${userEmail}`);
      return { verified: true, count, localMatch };
    }

    // Aucun token actif en BDD → trigger repair silencieux
    console.warn(`[FCM_ENGINE] verifyInBdd | 0 token actif en BDD | user=${userEmail}`);
    setTimeout(() => FcmTokenEngine.repair(userEmail, 'verify_zero_token'), 500);
    return { verified: false, count: 0, tokens: [] };
  } catch (e) {
    // Erreur réseau / timeout → warning non bloquant, le save HTTP a déjà réussi
    console.warn(`[FCM_ENGINE] verifyInBdd | skip (${e?.message}) | user=${userEmail}`);
    return { verified: false, count: 0, tokens: [], skipped: true };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API PUBLIQUE
// ─────────────────────────────────────────────────────────────────────────────

const FcmTokenEngine = {

  /**
   * saveToken — Point d'entrée unique pour enregistrer un token.
   * Lit local → save backend → vérifie BDD → confirme.
   */
  async saveToken(userEmail, token, source = 'registration') {
    if (!userEmail || !token) {
      console.error(`[FCM_ENGINE] saveToken | params manquants | email=${!!userEmail} token=${!!token}`);
      return { success: false, error: 'MISSING_PARAMS' };
    }

    const preview = token.slice(0, 30);

    // Debounce anti-doublon
    if (shouldDebounce(userEmail, preview)) {
      console.log(`[FCM_ENGINE] saveToken | debounced | user=${userEmail} | source=${source}`);
      return { success: false, action: 'debounced' };
    }

    const { token: localToken } = readLocalToken();
    if (localToken) {
      console.log(`[FCM_TOKEN_LOCAL_FOUND] local=${localToken.slice(0, 30)}... | user=${userEmail}`);
    }

    const deviceMeta = getDeviceMeta();
    console.log(`[FCM_TOKEN_SAVE_START] user=${userEmail} | source=${source} | preview=${preview}... | device=${deviceMeta.device_id}`);

    const saveResult = await saveTokenToBackend(userEmail, token, deviceMeta);

    if (!saveResult?.success) {
      console.error(`[FCM_ENGINE] saveToken failed | error=${saveResult?.error} | user=${userEmail}`);
      return { success: false, error: saveResult?.error };
    }

    console.log(`[FCM_TOKEN_SAVE_SUCCESS] action=${saveResult.action} | token_id=${saveResult.token_id} | user=${userEmail}`);
    writeLocalToken(token, userEmail);

    // Vérification BDD post-save — best-effort via HTTP public (sans session requise)
    // Si verifyInBdd retourne skipped=true (backend indisponible) → on ne réessaie pas
    await new Promise(r => setTimeout(r, 1200));
    try {
      const verifyResult = await verifyInBdd(userEmail, token);
      if (verifyResult.verified) {
        console.log(`[FCM_TOKEN_VERIFY_SUCCESS] BDD confirmé | count=${verifyResult.count} | localMatch=${verifyResult.localMatch} | user=${userEmail}`);
        return { success: true, action: saveResult.action, token_id: saveResult.token_id, verified: true, count: verifyResult.count };
      }
      // skipped ou 0 token → le save HTTP a réussi, on retourne success sans bloquer
      if (!verifyResult.skipped) {
        console.warn(`[FCM_ENGINE] verify: 0 token actif post-save (repair déclenché) | user=${userEmail}`);
      }
    } catch (_) {
      // Jamais de crash ici — la vérif est best-effort
    }

    console.log(`[FCM_ENGINE] saveToken OK (verify best-effort) | user=${userEmail}`);
    return { success: true, action: saveResult.action, token_id: saveResult.token_id, verified: false };
  },

  /**
   * getActiveTokens — Lire les tokens actifs via backend public (évite 403 Base44).
   */
  async getActiveTokens(userEmail) {
    if (!userEmail) return { tokens: [], count: 0 };
    try {
      const res = await fetch(`${APP_BASE_URL}/functions/getCurrentFcmToken`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_email: userEmail }),
      });
      if (!res.ok) return { tokens: [], count: 0 };
      const data = await res.json().catch(() => ({}));
      return { tokens: data?.tokens || [], count: data?.count || 0 };
    } catch (e) {
      console.warn(`[FCM_ENGINE] getActiveTokens | skip (${e?.message}) | user=${userEmail}`);
      return { tokens: [], count: 0 };
    }
  },

  /**
   * repair — Déclencher la réparation si token_count=0.
   * Log la cause exacte + dispatch event pour FcmBootstrap.
   */
  async repair(userEmail, cause = 'unknown') {
    if (!userEmail) return;
    console.warn(`[FCM_ENGINE] repair() | cause=${cause} | user=${userEmail}`);
    try {
      localStorage.setItem('cdl_fcm_repair_triggered', new Date().toISOString());
      localStorage.setItem('cdl_fcm_repair_cause', cause);
    } catch (_) {}
    // Dispatcher event → FcmBootstrap l'écoute pour re-register
    window.dispatchEvent(new CustomEvent('cdl_fcm_force_register', {
      detail: { email: userEmail, cause, source: 'FcmTokenEngine.repair' }
    }));
  },

  /**
   * verify — Vérification explicite token local vs BDD.
   */
  async verify(userEmail) {
    const { token: localToken } = readLocalToken();
    return verifyInBdd(userEmail, localToken);
  },

  /**
   * getDiagnostics — Pour le dashboard de diagnostic.
   */
  async getDiagnostics(userEmail) {
    const deviceMeta = getDeviceMeta();
    const local = readLocalToken();

    let bddTokens = [];
    let bddError = null;
    try {
      // Via backend public pour éviter 403 Base44 auth-required sur APK
      const res = await fetch(`${APP_BASE_URL}/functions/getCurrentFcmToken`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_email: userEmail, include_all: true }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        bddTokens = data?.tokens || (data?.token ? [{ token: data.token, is_active: true }] : []);
      } else {
        bddError = `backend ${res.status}`;
      }
    } catch (e) {
      bddError = e?.message;
    }

    const activeTokens = (bddTokens || []).filter(t => t.is_active);
    const localPreview = local.token?.slice(0, 30);
    const localMatchInBdd = localPreview
      ? (bddTokens || []).find(t => t.token?.startsWith(localPreview))
      : null;

    let repairCause = null;
    let repairTriggered = null;
    try {
      repairCause = localStorage.getItem('cdl_fcm_repair_cause');
      repairTriggered = localStorage.getItem('cdl_fcm_repair_triggered');
    } catch (_) {}

    return {
      engine_version: ENGINE_VERSION,
      user_email: userEmail,
      device: deviceMeta,
      local_token: local.token ? local.token.slice(0, 40) + '...' : null,
      local_token_full: local.token,
      local_last_save: local.lastSave,
      local_user: local.lastUser,
      local_match_in_bdd: !!localMatchInBdd,
      bdd_total: (bddTokens || []).length,
      bdd_active: activeTokens.length,
      bdd_tokens: (bddTokens || []).map(t => ({
        id: t.id,
        token_preview: t.token?.slice(0, 40) + '...',
        device_type: t.device_type,
        platform: t.platform,
        is_active: t.is_active,
        registered_at: t.registered_at,
        last_used: t.last_used,
        age_hours: t.last_used ? Math.round((Date.now() - new Date(t.last_used).getTime()) / 3600000) : null,
      })),
      bdd_error: bddError,
      repair_cause: repairCause,
      repair_triggered: repairTriggered,
      status: activeTokens.length > 0 ? 'ok' : 'no_active_token',
    };
  },
};

export default FcmTokenEngine;