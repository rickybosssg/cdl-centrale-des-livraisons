/**
 * AuditEngine — SOURCE UNIQUE pour les logs critiques et audits
 *
 * COMPATIBILITÉ : couche de logging non-destructive — ne modifie rien d'existant
 * Gère : recharge Bedou, crédits/débits, dispatch, profil, push, GPS, suppression user
 *
 * LOGS : [ENGINE_INIT] [ENGINE_READY] [ENGINE_MIGRATION_OK] [ENGINE_ERROR]
 * + Logs métier : [AUDIT_BEDOU] [AUDIT_DISPATCH] [AUDIT_PROFILE] [AUDIT_PUSH] [AUDIT_GPS] [AUDIT_USER]
 */

import { base44 } from '@/api/base44Client';

const ENGINE_VERSION = '1.0.0';

// Buffer pour batching des logs BDD (éviter trop d'appels)
const _buffer = [];
let _flushTimer = null;
const FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFER_SIZE = 20;



/** Flush buffer → BDD */
async function flushBuffer() {
  if (_buffer.length === 0) return;
  const toFlush = _buffer.splice(0, _buffer.length);
  for (const entry of toFlush) {
    base44.entities.AuditLog.create(entry).catch(() => {});
  }
}

/** Ajouter au buffer */
function bufferLog(entry) {
  _buffer.push({ ...entry, created_date: new Date().toISOString() });
  if (_buffer.length >= MAX_BUFFER_SIZE) {
    flushBuffer();
  } else {
    clearTimeout(_flushTimer);
    _flushTimer = setTimeout(flushBuffer, FLUSH_INTERVAL_MS);
  }
}

const AuditEngine = {
  version: ENGINE_VERSION,

  /**
   * Log générique
   * @param {string} category — catégorie ('bedou', 'dispatch', 'profile', 'push', 'gps', 'user', 'error')
   * @param {string} action — action effectuée
   * @param {object} meta — données supplémentaires
   */
  log(category, action, meta = {}) {
    const entry = {
      category,
      action,
      actor_email: meta.actor_email || meta.user_email || null,
      target_email: meta.target_email || null,
      entity_id: meta.entity_id || meta.course_id || meta.demande_id || null,
      entity_type: meta.entity_type || null,
      amount: meta.amount || meta.montant || null,
      status: meta.status || 'ok',
      details: JSON.stringify(meta),
      engine_version: ENGINE_VERSION,
    };
    console.log(`[AUDIT_${category.toUpperCase()}] action=${action} | ${JSON.stringify(meta)}`);
    bufferLog(entry);
  },

  // ── Bedou ──────────────────────────────────────────────────────────────────

  logBedouRecharge(actorEmail, targetEmail, montant, statut, demandeId) {
    this.log('bedou', 'recharge', { actor_email: actorEmail, target_email: targetEmail, amount: montant, status: statut, entity_id: demandeId, entity_type: 'DemandeRecharge' });
  },

  logBedouDebit(userEmail, montant, courseId) {
    this.log('bedou', 'debit', { user_email: userEmail, amount: montant, entity_id: courseId, entity_type: 'Course', status: 'ok' });
  },

  logBedouCredit(userEmail, montant, source, refId) {
    this.log('bedou', 'credit', { user_email: userEmail, amount: montant, source, entity_id: refId, status: 'ok' });
  },

  logBedouRetrait(userEmail, montant, statut, demandeId) {
    this.log('bedou', 'retrait', { user_email: userEmail, amount: montant, status: statut, entity_id: demandeId, entity_type: 'DemandeRetrait' });
  },

  // ── Dispatch ───────────────────────────────────────────────────────────────

  logDispatch(courseId, livreurEmail, mode, statut) {
    this.log('dispatch', 'assign', { entity_id: courseId, entity_type: 'Course', target_email: livreurEmail, mode, status: statut });
  },

  logDispatchModeChange(adminEmail, newMode, reason) {
    this.log('dispatch', 'mode_change', { actor_email: adminEmail, mode: newMode, reason, status: 'ok' });
  },

  // ── Profil ─────────────────────────────────────────────────────────────────

  logProfileChange(userEmail, oldType, newType) {
    this.log('profile', 'switch', { user_email: userEmail, from: oldType, to: newType, status: 'ok' });
  },

  logProfileValidation(adminEmail, targetEmail, profileType, statut, motif) {
    this.log('profile', 'validate', { actor_email: adminEmail, target_email: targetEmail, profile_type: profileType, status: statut, motif });
  },

  // ── Push / FCM ─────────────────────────────────────────────────────────────

  logPushSent(recipientEmail, title, success, tokenCount) {
    this.log('push', 'sent', { target_email: recipientEmail, title, status: success ? 'ok' : 'failed', token_count: tokenCount });
  },

  logPushError(recipientEmail, error, cause) {
    this.log('push', 'error', { target_email: recipientEmail, error, cause, status: 'error' });
  },

  // ── GPS ────────────────────────────────────────────────────────────────────

  logGpsError(userEmail, errorCode, message) {
    this.log('gps', 'error', { user_email: userEmail, error_code: errorCode, error: message, status: 'error' });
  },

  logGpsUpdate(userEmail, lat, lng, accuracy) {
    this.log('gps', 'update', { user_email: userEmail, lat, lng, accuracy, status: 'ok' });
  },

  // ── Utilisateurs ───────────────────────────────────────────────────────────

  logUserDeletion(adminEmail, targetEmail, reason) {
    this.log('user', 'delete', { actor_email: adminEmail, target_email: targetEmail, reason, status: 'ok' });
  },

  logUserLogin(userEmail, method) {
    this.log('user', 'login', { user_email: userEmail, method, status: 'ok' });
  },

  // ── Erreurs critiques ──────────────────────────────────────────────────────

  logError(context, error, meta = {}) {
    this.log('error', context, { ...meta, error: error?.message || String(error), status: 'error' });
  },

  /** Flush immédiat (avant navigation/logout) */
  async flush() {
    clearTimeout(_flushTimer);
    await flushBuffer();
    console.log(`[ENGINE_MIGRATION_OK] AuditEngine.flush | done`);
  },
};



export default AuditEngine;