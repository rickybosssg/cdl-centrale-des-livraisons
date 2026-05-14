/**
 * CourseStatusEngine — SOURCE UNIQUE pour les transitions de statut de courses
 *
 * Gère : créée → proposée → acceptée → en cours → livrée → annulée / échouée
 * + déclenchement automatique du Bedou settlement à la livraison
 *
 * RÈGLES :
 * 1. Toute transition de statut passe par transition()
 * 2. Le settlement Bedou est déclenché automatiquement sur 'livree'
 * 3. Jamais de modification directe du statut sans passer par ce moteur
 */

import { base44 } from '@/api/base44Client';
import BedouEngine from './BedouEngine';

const ENGINE_VERSION = '1.0.0';

// Transitions valides — SOURCE UNIQUE DE VÉRITÉ
const VALID_TRANSITIONS = {
  en_attente:             ['assignee_attente', 'annulee', 'aucun_livreur'],
  assignee_attente:       ['acceptee', 'refusee', 'aucun_livreur', 'en_attente'],
  acceptee:               ['driver_en_route_pickup', 'en_cours', 'annulee', 'refusee'],
  driver_en_route_pickup: ['arrived_pickup', 'en_cours'],
  arrived_pickup:         ['en_cours'],
  en_cours:               ['arrived_dropoff', 'livree', 'annulee'],
  arrived_dropoff:        ['livree'],
  livree:                 [], // Terminal
  annulee:                [], // Terminal
  refusee:                ['en_attente'],
  aucun_livreur:          ['en_attente'],
};

const TERMINAL_STATUSES = ['livree', 'annulee'];

const CourseStatusEngine = {
  version: ENGINE_VERSION,

  /** Vérifier si une transition est valide */
  canTransition(currentStatus, newStatus) {
    return (VALID_TRANSITIONS[currentStatus] || []).includes(newStatus);
  },

  /** Effectuer une transition de statut */
  async transition(courseId, newStatus, extra = {}) {
    const courses = await base44.entities.Course.filter({ id: courseId }, null, 1);
    const course = courses[0];
    if (!course) throw new Error(`[CourseStatusEngine] Course ${courseId} introuvable`);

    if (!this.canTransition(course.statut, newStatus)) {
      throw new Error(`[CourseStatusEngine] Transition invalide: ${course.statut} → ${newStatus}`);
    }

    const updates = { statut: newStatus, ...extra };

    // Timestamps automatiques
    if (newStatus === 'acceptee') updates.date_acceptation = new Date().toISOString();
    if (newStatus === 'arrived_pickup') updates.date_recuperation = new Date().toISOString();
    if (newStatus === 'livree') updates.date_livraison = new Date().toISOString();

    await base44.entities.Course.update(courseId, updates);
    console.log(`[CourseStatusEngine] ${course.statut} → ${newStatus} | course=${courseId}`);

    // Déclencher Bedou settlement automatiquement sur 'livree'
    if (newStatus === 'livree' && course.settlement_status !== 'completed') {
      await this._triggerSettlement(course);
    }

    return { success: true, from: course.statut, to: newStatus };
  },

  /** Annuler une course */
  async cancel(courseId, { frais_annulation = 0, reason } = {}) {
    const courses = await base44.entities.Course.filter({ id: courseId }, null, 1);
    const course = courses[0];
    if (!course) throw new Error(`[CourseStatusEngine] Course ${courseId} introuvable`);
    if (TERMINAL_STATUSES.includes(course.statut)) {
      throw new Error(`[CourseStatusEngine] Annulation impossible — statut terminal: ${course.statut}`);
    }
    if (frais_annulation > 0) {
      return base44.functions.invoke('cancelCourseWithFees', { course_id: courseId, frais_annulation, reason });
    }
    await base44.entities.Course.update(courseId, { statut: 'annulee' });
    return { success: true };
  },

  /** Déclencher le settlement Bedou (interne) */
  async _triggerSettlement(course) {
    if (!course.prix || !course.client_email || !course.livreur_email) {
      console.error(`[CourseStatusEngine] Settlement impossible — données manquantes | course=${course.id}`);
      return;
    }
    console.log(`[CourseStatusEngine] Settlement déclenché | course=${course.id} | montant=${course.prix}`);
    BedouEngine.finaliserCourse({
      course_id: course.id,
      client_email: course.client_email,
      client_nom: course.client_name,
      livreur_email: course.livreur_email,
      livreur_nom: course.livreur_name,
      montant: course.prix,
    }).catch(e => console.error(`[CourseStatusEngine] Settlement error: ${e.message}`));
  },

  /** Lire une course */
  async get(courseId) {
    const list = await base44.entities.Course.filter({ id: courseId }, null, 1);
    return list[0] || null;
  },

  /** S'abonner aux changements de statut en temps réel */
  subscribe(callback) {
    return base44.entities.Course.subscribe(callback);
  },

  VALID_TRANSITIONS,
  TERMINAL_STATUSES,
};

export default CourseStatusEngine;