/**
 * activeProfile.js — SOURCE UNIQUE DE VÉRITÉ PROFIL RUNTIME v1.0
 *
 * RÈGLE ABSOLUE :
 *   - Admin global    → user.role === 'admin'
 *   - Profil runtime  → user.active_profile_type  (SEUL champ autorisé)
 *
 * INTERDIT :
 *   - user.user_type       ❌
 *   - user.current_role    ❌
 *   - user.activeRole      ❌
 *   - OR logic multi-champs ❌
 *   - fallback localStorage seul (sans BDD) ❌
 *
 * LOGS : [PROFILE_SOURCE] [PROFILE_SWITCH] [PROFILE_ADMIN] [PROFILE_ERROR]
 */

const VERSION = 'activeProfile_v1.0';

/**
 * Retourne le type de profil actif pour un utilisateur.
 * @param {object} user — objet user tel que retourné par base44.auth.me()
 * @returns {string|null} — 'admin' | 'client' | 'livreur' | 'partenaire' | 'commercial' | 'annonceur' | null
 */
export function getActiveProfileType(user) {
  if (!user) {
    console.warn(`[PROFILE_ERROR] getActiveProfileType | user=null`);
    return null;
  }

  // ── Règle 1 : Admin global — toujours prioritaire ────────────────────────────
  if (user.role === 'admin') {
    console.log(`[PROFILE_ADMIN] getActiveProfileType | email=${user.email} | source=user.role | value=admin`);
    return 'admin';
  }

  // ── Règle 2 : Profil runtime — SEULE source autorisée ───────────────────────
  if (user.active_profile_type) {
    console.log(`[PROFILE_SOURCE] getActiveProfileType | email=${user.email} | source=active_profile_type | value=${user.active_profile_type}`);
    return user.active_profile_type;
  }

  // ── Règle 3 : Aucun profil actif défini — null (jamais de fallback) ──────────
  console.warn(`[PROFILE_ERROR] getActiveProfileType | email=${user.email} | active_profile_type=undefined | no_fallback`);
  return null;
}

/**
 * Retourne true si l'utilisateur est admin global.
 * SEULE vérification autorisée pour l'accès admin.
 */
export function isAdminUser(user) {
  return user?.role === 'admin';
}

/**
 * Retourne true si le profil actif correspond au type demandé.
 */
export function hasActiveProfile(user, profileType) {
  return getActiveProfileType(user) === profileType;
}

/**
 * Log structuré d'un changement de profil (pour observabilité).
 */
export function logProfileSwitch(email, fromType, toType, source = 'user_action') {
  console.log(`[PROFILE_SWITCH] email=${email} | from=${fromType || 'none'} | to=${toType} | source=${source} | ts=${new Date().toISOString()} | v=${VERSION}`);
}

export const ACTIVE_PROFILE_VERSION = VERSION;