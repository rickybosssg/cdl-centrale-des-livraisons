/**
 * BedouEngine — SOURCE UNIQUE DE VÉRITÉ FINANCIÈRE
 *
 * Tous les débits, crédits, commissions, bonus, recharges, retraits, remboursements
 * passent par ce moteur. Appelle bedouEngine en backend.
 *
 * RÈGLES :
 * 1. Aucun composant ne modifie Bedou directement
 * 2. Toutes les opérations passent par BedouEngine.invoke(action, params)
 * 3. Erreur → jamais silencieuse, toujours propagée avec cause
 */

import { base44 } from '@/api/base44Client';

const ENGINE_VERSION = '1.0.0';

async function invoke(action, params = {}) {
  const res = await base44.functions.invoke('bedouEngine', { action, ...params });
  if (!res.data?.success && res.data?.error) {
    throw new Error(`[BedouEngine] ${action} failed: ${res.data.error}`);
  }
  return res.data;
}

const BedouEngine = {
  version: ENGINE_VERSION,

  /** Lire le solde et les transactions de l'utilisateur courant */
  async get() {
    return invoke('get_bedou');
  },

  /** Créer le compte Bedou si absent */
  async ensure(email, role, nom) {
    return invoke('ensure_bedou', { email, role, nom });
  },

  /** Demander une recharge (client/livreur/partenaire/commercial) */
  async demanderRecharge(montant, methode, preuve_paiement) {
    return invoke('demande_recharge', { montant, methode, preuve_paiement });
  },

  /** Valider une recharge (admin) */
  async validerRecharge(demande_id) {
    return invoke('valider_recharge', { demande_id });
  },

  /** Refuser une recharge (admin) */
  async refuserRecharge(demande_id, motif) {
    return invoke('refuser_recharge', { demande_id, motif });
  },

  /** Demander un retrait */
  async demanderRetrait(montant, methode, numero_reception, nom_compte) {
    return invoke('demande_retrait', { montant, methode, numero_reception, nom_compte });
  },

  /** Valider un retrait (admin) */
  async validerRetrait(demande_id) {
    return invoke('valider_retrait', { demande_id });
  },

  /** Refuser un retrait (admin) */
  async refuserRetrait(demande_id, motif) {
    return invoke('refuser_retrait', { demande_id, motif });
  },

  /** Finaliser une course : débit client + crédit livreur 80% + CDL 20% */
  async finaliserCourse({ course_id, client_email, client_nom, livreur_email, livreur_nom, montant }) {
    return invoke('finaliser_course', { course_id, client_email, client_nom, livreur_email, livreur_nom, montant });
  },

  /** Relancer un règlement bloqué (admin) */
  async relancerSettlement(course_id) {
    return invoke('relancer_settlement', { course_id });
  },

  /** Ajuster un solde manuellement (admin) */
  async ajusterSolde(target_email, montant, sens, description) {
    return invoke('ajuster_solde', { target_email, montant, sens, description });
  },

  /** Bonus commercial (parrainage première course) */
  async bonusCommercial(client_email, course_id) {
    return invoke('bonus_commercial', { client_email, course_id });
  },

  /** Audit règlements en attente (admin) */
  async auditSettlementPending() {
    return invoke('audit_settlement_pending');
  },
};

export default BedouEngine;