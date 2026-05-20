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

// ── Vérification BDD ──────────────────────────────────────────────────────────
async function verifyInBdd(userEmail, localToken) {
  try {
    // Chercher d'abord les tokens actifs
    const tokens = await base44.entities.FcmToken.filter({ user_email: userEmail, is_active: true }).catch(() => []);
    const valid = (tokens || []).filter(t => {
      if (!t.is_active || !t.token) return false;
      const ref = t.last_used || t.registered_at;
      if (!ref) return true;
      return Date.now() - new Date(ref).getTime() < TOKEN_MAX_AGE_MS;
    });

    if (valid.length === 0) {
      // Fallback : chercher les tokens inactifs récents (couvre bdd_active=0 après désactivation)
      const allTokens = await base44.entities.FcmToken.filter({ user_email: userEmail }, '-updated_date', 10).catch(() => []);
      const recentInactive = (allTokens || []).filter(t => {
        const ref = t.last_used || t.registered_at;
        if (!ref) return false;
        return Date.now() - new Date(ref).getTime() < TOKEN_MAX_AGE_MS;
      });
      if (recentInactive.length > 0) {
        console.warn(`[FCM_ENGINE] verifyInBdd | bdd_active=0 mais ${recentInactive.length} token(s) inactif(s) récent(s) → trigger repair | user=${userEmail}`);
        // Déclencher repair sans bloquer
        setTimeout(() => FcmTokenEngine.repair(userEmail, 'inactive_token_detected'), 100);
      } else {
        console.error(`[FCM_ENGINE] verifyInBdd | 0 token actif | user=${userEmail}`);
      }
      return { verified: false, count: 0, tokens: [], recentInactiveCount: recentInactive.length };
    }

    // Vérifier correspondance local vs BDD
    const localPreview = localToken?.slice(0, 30);
    const match = localPreview
      ? valid.find(t => t.token?.startsWith(localPreview))
      : null;

    if (localPreview && !match) {
      console.warn(`[FCM_ENGINE] verifyInBdd | local≠BDD | local=${localPreview} | bdd=${valid[0].token?.slice(0, 30)} | user=${userEmail}`);
    }

    console.log(`[FCM_ENGINE] verifyInBdd OK | count=${valid.length} | match=${!!match} | user=${userEmail}`);
    return { verified: true, count: valid.length, tokens: valid, localMatch: !!match };
  } catch (e) {
    console.error(`[FCM_ENGINE] verifyInBdd error | ${e?.message} | user=${userEmail}`);
    return { verified: false, count: 0, tokens: [], error: e?.message };
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

    // Vérification BDD post-save avec retries — silencieuse si session expirée
    // (le save a déjà réussi via HTTP public, la vérif est best-effort)
    for (let attempt = 1; attempt <= VERIFY_RETRIES; attempt++) {
      await new Promise(r => setTimeout(r, 600 * attempt));
      try {
        const { verified, count, localMatch } = await verifyInBdd(userEmail, token);
        if (verified) {
          console.log(`[FCM_TOKEN_VERIFY_SUCCESS] BDD confirmé | count=${count} | localMatch=${localMatch} | attempt=${attempt} | user=${userEmail}`);
          return { success: true, action: saveResult.action, token_id: saveResult.token_id, verified: true, count };
        }
        console.warn(`[FCM_ENGINE] verify attempt ${attempt}/${VERIFY_RETRIES} failed | user=${userEmail}`);
      } catch (verifyErr) {
        // Session expirée → ne pas bloquer, le save HTTP a déjà réussi
        console.warn(`[FCM_ENGINE] verify attempt ${attempt} skipped (session) | user=${userEmail} | ${verifyErr?.message}`);
        break;
      }
    }

    console.log(`[FCM_ENGINE] saveToken OK (verify best-effort) | user=${userEmail}`);
    return { success: true, action: saveResult.action, verified: false };
  },

  /**
   * getActiveTokens — Lire les tokens actifs en BDD (utilisé par sendCdlNotification).
   */
  async getActiveTokens(userEmail) {
    if (!userEmail) return { tokens: [], count: 0 };
    try {
      const tokens = await base44.entities.FcmToken.filter({ user_email: userEmail, is_active: true });
      const valid = (tokens || []).filter(t => {
        if (!t.is_active || !t.token) return false;
        const ref = t.last_used || t.registered_at;
        if (!ref) return true;
        return Date.now() - new Date(ref).getTime() < TOKEN_MAX_AGE_MS;
      });
      return { tokens: valid, count: valid.length };
    } catch (e) {
      console.error(`[FCM_ENGINE] getActiveTokens error | ${e?.message} | user=${userEmail}`);
      return { tokens: [], count: 0, error: e?.message };
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
      bddTokens = await base44.entities.FcmToken.filter({ user_email: userEmail }, '-updated_date', 20);
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