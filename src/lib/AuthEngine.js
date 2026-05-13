/**
 * AuthEngine — SOURCE UNIQUE pour l'authentification et la session
 *
 * COMPATIBILITÉ : wrapper autour de base44.auth — aucun changement destructif
 * Utilisation progressive : importer AuthEngine au lieu de base44.auth directement
 *
 * LOGS : [ENGINE_INIT] [ENGINE_READY] [ENGINE_MIGRATION_OK] [ENGINE_ERROR]
 */

import { base44 } from '@/api/base44Client';

const ENGINE_VERSION = '1.0.0';
let _cachedUser = null;
let _cacheTs = 0;
const USER_CACHE_TTL_MS = 30_000; // 30s

// Profils → rôles UI
const PROFILE_ROLES = {
  admin:       { canAdmin: true, canOrder: false, canDeliver: false },
  client:      { canAdmin: false, canOrder: true, canDeliver: false },
  livreur:     { canAdmin: false, canOrder: false, canDeliver: true },
  partenaire:  { canAdmin: false, canOrder: false, canDeliver: false, canSell: true },
  commercial:  { canAdmin: false, canOrder: false, canDeliver: false, canPromo: true },
  annonceur:   { canAdmin: false, canOrder: false, canDeliver: false, canAds: true },
};

console.log(`[ENGINE_INIT] AuthEngine v${ENGINE_VERSION}`);

const AuthEngine = {
  version: ENGINE_VERSION,

  /** Utilisateur courant (avec cache 30s) */
  async me(force = false) {
    if (!force && _cachedUser && Date.now() - _cacheTs < USER_CACHE_TTL_MS) {
      return _cachedUser;
    }
    try {
      const user = await base44.auth.me();
      _cachedUser = user;
      _cacheTs = Date.now();
      console.log(`[ENGINE_READY] AuthEngine.me | email=${user?.email} | role=${user?.role}`);
      return user;
    } catch (e) {
      console.error(`[ENGINE_ERROR] AuthEngine.me | ${e.message}`);
      throw e;
    }
  },

  /** Vider le cache utilisateur */
  clearCache() {
    _cachedUser = null;
    _cacheTs = 0;
  },

  /** Vérifier si authentifié */
  async isAuthenticated() {
    try {
      return await base44.auth.isAuthenticated();
    } catch (e) {
      console.error(`[ENGINE_ERROR] AuthEngine.isAuthenticated | ${e.message}`);
      return false;
    }
  },

  /** Mettre à jour les données de l'utilisateur courant */
  async updateMe(data) {
    const result = await base44.auth.updateMe(data);
    this.clearCache(); // Invalider cache
    console.log(`[ENGINE_MIGRATION_OK] AuthEngine.updateMe | fields=${Object.keys(data).join(',')}`);
    return result;
  },

  /** Logout */
  logout(redirectUrl) {
    this.clearCache();
    console.log(`[ENGINE_MIGRATION_OK] AuthEngine.logout`);
    return base44.auth.logout(redirectUrl);
  },

  /** Redirect vers login */
  redirectToLogin(nextUrl) {
    return base44.auth.redirectToLogin(nextUrl);
  },

  /** Obtenir le type de profil actif */
  getActiveProfileType(user) {
    if (!user) return null;
    if (user.role === 'admin' || user.user_type === 'admin') return 'admin';
    return user.active_profile_type || user.user_type || null;
  },

  /** Vérifier si admin */
  isAdmin(user) {
    return user?.role === 'admin' || user?.user_type === 'admin';
  },

  /** Permissions liées au profil actif */
  getPermissions(profileType) {
    return PROFILE_ROLES[profileType] || {};
  },

  /** Vérifier une permission */
  can(user, permission) {
    const profileType = this.getActiveProfileType(user);
    return !!(PROFILE_ROLES[profileType]?.[permission]);
  },

  // ── Compat : accès direct à base44.auth pour migration progressive ──────────
  get _raw() { return base44.auth; },
};

console.log(`[ENGINE_READY] AuthEngine v${ENGINE_VERSION} chargé`);

export default AuthEngine;