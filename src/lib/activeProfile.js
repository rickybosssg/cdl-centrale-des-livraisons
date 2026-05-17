/**
 * activeProfile.js — SOURCE UNIQUE DE VÉRITÉ PROFIL RUNTIME
 *
 * RÈGLES :
 *   - Admin global    → user.role === 'admin'
 *   - Profil runtime  → user.active_profile_type (SEUL champ autorisé)
 */

/**
 * Retourne le type de profil actif pour un utilisateur.
 */
export function getActiveProfileType(user) {
  if (!user) return null;
  if (user.role === 'admin') return 'admin';
  if (user.active_profile_type) return user.active_profile_type;
  return null;
}

/**
 * Retourne true si l'utilisateur est admin global.
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
 * Log structuré d'un changement de profil (no-op en production).
 */
export function logProfileSwitch(_email, _fromType, _toType, _source = 'user_action') {
  // Silencieux en production
}