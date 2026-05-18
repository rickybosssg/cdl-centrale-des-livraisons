/**
 * autoCleanupFcmTokens — Nettoyage automatique hebdomadaire des tokens FCM
 * Appelé par automation planifiée (pas d'auth user nécessaire).
 * - Supprime tokens inactifs > 30 jours
 * - Supprime doublons exacts
 * - Désactive doublons par device (garde le plus récent)
 * - Ne supprime JAMAIS le dernier token actif d'un user
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const INACTIVE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const t0 = Date.now();
    console.log(`[AUTO_FCM_CLEANUP_START] ts=${new Date().toISOString()}`);

    const allTokens = await base44.asServiceRole.entities.FcmToken.list('-created_date', 2000);
    const now = Date.now();

    // Index actifs par user
    const activeByUser = {};
    for (const t of allTokens) {
      if (t.is_active) {
        if (!activeByUser[t.user_email]) activeByUser[t.user_email] = [];
        activeByUser[t.user_email].push(t);
      }
    }

    // Tokens protégés (dernier actif par user)
    const protectedIds = new Set();
    for (const [, tokens] of Object.entries(activeByUser)) {
      if (tokens.length === 1) protectedIds.add(tokens[0].id);
    }

    // Doublons exacts
    const seen = new Map();
    const exactDups = [];
    for (const t of allTokens) {
      if (!t.token) continue;
      if (seen.has(t.token)) exactDups.push(t);
      else seen.set(t.token, t.id);
    }

    // Doublons device (actifs)
    const byUserDevice = {};
    for (const t of allTokens) {
      if (!t.is_active) continue;
      const key = `${t.user_email}__${t.device_id || 'unknown'}`;
      if (!byUserDevice[key]) byUserDevice[key] = [];
      byUserDevice[key].push(t);
    }
    const deviceDups = [];
    for (const tokens of Object.values(byUserDevice)) {
      if (tokens.length <= 1) continue;
      tokens.sort((a, b) => new Date(b.last_used || b.registered_at || 0) - new Date(a.last_used || a.registered_at || 0));
      deviceDups.push(...tokens.slice(1));
    }

    // Inactifs anciens
    const oldInactive = allTokens.filter(t => {
      if (t.is_active) return false;
      const ref = t.last_used || t.registered_at;
      if (!ref) return true;
      return now - new Date(ref).getTime() > INACTIVE_MAX_AGE_MS;
    });

    let deleted = 0, archived = 0;

    for (const t of exactDups) {
      if (protectedIds.has(t.id)) continue;
      await base44.asServiceRole.entities.FcmToken.delete(t.id).catch(() => {});
      deleted++;
    }
    for (const t of deviceDups) {
      if (protectedIds.has(t.id)) continue;
      await base44.asServiceRole.entities.FcmToken.update(t.id, { is_active: false }).catch(() => {});
      archived++;
    }
    for (const t of oldInactive) {
      if (protectedIds.has(t.id)) continue;
      await base44.asServiceRole.entities.FcmToken.delete(t.id).catch(() => {});
      deleted++;
    }

    const elapsed = Date.now() - t0;
    console.log(`[AUTO_FCM_CLEANUP_DONE] deleted=${deleted} archived=${archived} protected=${protectedIds.size} elapsed=${elapsed}ms`);

    return Response.json({ success: true, deleted, archived, protected: protectedIds.size, elapsed_ms: elapsed });
  } catch (err) {
    console.error('[AUTO_FCM_CLEANUP_ERROR]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});