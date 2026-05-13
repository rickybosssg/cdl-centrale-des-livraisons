/**
 * DispatchEngine — SOURCE UNIQUE pour la logique de dispatch
 *
 * Gère : mode manuel/auto, sélection livreur, disponibilité, GPS, fallback, délai 60s
 *
 * RÈGLES :
 * 1. Tout changement de mode passe par setMode()
 * 2. Toute assignation passe par assign()
 * 3. La disponibilité livreur est lue via getAvailableDrivers()
 */

import { base44 } from '@/api/base44Client';

const ENGINE_VERSION = '1.0.0';
const ASSIGNMENT_TIMEOUT_MS = 60_000; // 60 secondes

const DispatchEngine = {
  version: ENGINE_VERSION,

  /** Lire le mode actuel (auto/manuel) */
  async getMode() {
    const configs = await base44.entities.DispatchConfig.list('-created_date', 1);
    return configs[0] || { mode: 'auto', force_override: false };
  },

  /** Changer le mode dispatch (admin) */
  async setMode(mode, reason) {
    return base44.functions.invoke('setDispatchMode', { mode, reason });
  },

  /** Obtenir les livreurs disponibles (GPS actif, en ligne) */
  async getAvailableDrivers(quartier_depart) {
    return base44.functions.invoke('selectSmartLivreurs', { quartier_depart });
  },

  /** Dispatcher une course (auto ou manuel) */
  async dispatch(course_id, options = {}) {
    const { mode = 'auto', livreur_email } = options;
    if (mode === 'manuel' && livreur_email) {
      return base44.functions.invoke('autoDispatch', {
        course_id,
        forced_livreur: livreur_email,
        mode: 'manuel',
      });
    }
    return base44.functions.invoke('autoDispatch', { course_id, mode: 'auto' });
  },

  /** Re-dispatcher une course (livreur a refusé ou timeout) */
  async reDispatch(course_id) {
    return base44.functions.invoke('reDispatch', { course_id });
  },

  /** Créer un dispatch smart (classement par score) */
  async createSmartDispatch(course_id) {
    return base44.functions.invoke('createSmartDispatch', { course_id });
  },

  /** Dispatch progressif (envoyer aux livreurs par vague) */
  async dispatchProgressif(course_id) {
    return base44.functions.invoke('dispatchProgressif', { course_id });
  },

  /** Vérifier les assignations en attente (timeout 60s) */
  async checkPendingAssignments() {
    return base44.functions.invoke('checkPendingAssignments', {});
  },

  /** S'abonner aux changements de statut des courses en temps réel */
  subscribeToCoursesChanges(callback) {
    return base44.entities.Course.subscribe(callback);
  },

  /** Timeout d'assignation (60s) */
  ASSIGNMENT_TIMEOUT_MS,
};

export default DispatchEngine;