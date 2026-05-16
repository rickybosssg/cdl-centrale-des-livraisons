/**
 * ProfileEngine — SOURCE UNIQUE pour la gestion des profils utilisateurs
 *
 * Gère : profils disponibles, rôle actuel, changement de profil, permissions UI, sync temps réel
 *
 * RÈGLES :
 * 1. Lire le profil actif via getActive()
 * 2. Changer de profil via switchTo()
 * 3. Les permissions UI sont dérivées du profil actif, jamais hardcodées
 */

import { base44 } from '@/api/base44Client';
import { getActiveProfileType as _getActiveProfileType, isAdminUser, logProfileSwitch } from '@/lib/activeProfile';

const ENGINE_VERSION = '1.0.0';

// Map des permissions UI par type de profil
const PROFILE_PERMISSIONS = {
  admin: {
    canViewAdminDashboard: true, canManageUsers: true, canManageCourses: true,
    canManageBedou: true, canViewStats: true, canDispatch: true, canManageAds: true,
    homeRoute: '/admin-dashboard',
  },
  client: {
    canOrder: true, canTrackCourse: true, canViewBedou: true, canViewVitrines: true,
    homeRoute: '/',
  },
  livreur: {
    canAcceptCourse: true, canViewGains: true, canViewBedou: true, canUpdateLocation: true,
    homeRoute: '/courses-disponibles',
  },
  partenaire: {
    canManageCommandes: true, canManageProducts: true, canViewBedou: true,
    homeRoute: '/dashboard-partenaire',
  },
  commercial: {
    canViewBedou: true, canSharePromo: true,
    homeRoute: '/',
  },
  annonceur: {
    canCreateAd: true, canViewStats: true,
    homeRoute: '/dashboard-annonceur',
  },
};

const ProfileEngine = {
  version: ENGINE_VERSION,

  /** Obtenir tous les profils de l'utilisateur courant */
  async getAll(userEmail) {
    return base44.entities.UserProfile.filter({
      user_email: userEmail,
      deleted: false,
    });
  },

  /** Obtenir le profil actif — délègue à la source unique */
  getActiveType(user) {
    return _getActiveProfileType(user);
  },

  /** Changer de profil actif */
  async switchTo(profileType) {
    const res = await base44.functions.invoke('switchActiveProfile', { profile_type: profileType });
    logProfileSwitch('?', null, profileType, 'ProfileEngine.switchTo');
    return res.data;
  },

  /** Ajouter un nouveau profil */
  async add(profileType, data) {
    const res = await base44.functions.invoke('addProfileToUser', {
      profile_type: profileType,
      data,
    });
    return res.data;
  },

  /** Obtenir les permissions UI du profil actif */
  getPermissions(profileType) {
    return PROFILE_PERMISSIONS[profileType] || {};
  },

  /** Vérifier une permission spécifique */
  can(profileType, permission) {
    return !!(PROFILE_PERMISSIONS[profileType]?.[permission]);
  },

  /** Route d'accueil par profil */
  getHomeRoute(profileType) {
    return PROFILE_PERMISSIONS[profileType]?.homeRoute || '/';
  },

  /** S'abonner aux changements de profil en temps réel */
  subscribeToProfile(userEmail, callback) {
    return base44.entities.UserProfile.subscribe((event) => {
      if (event.data?.user_email === userEmail) callback(event);
    });
  },

  /** Profils disponibles à ajouter (non encore créés) */
  getAvailableToAdd(existingProfiles) {
    const AVAILABLE = ['client', 'livreur', 'partenaire', 'commercial', 'annonceur'];
    const existing = existingProfiles.map(p => p.profile_type);
    return AVAILABLE.filter(p => !existing.includes(p));
  },
};

export default ProfileEngine;