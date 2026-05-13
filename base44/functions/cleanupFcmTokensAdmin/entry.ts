/**
 * cleanupFcmTokensAdmin — Nettoyage sécurisé des tokens FCM
 *
 * RÈGLES DE SÉCURITÉ :
 * 1. Jamais supprimer le dernier token actif d'un utilisateur
 * 2. Ordre : rapport → protéger → supprimer doublons → supprimer inactifs anciens
 * 3. Conserver 1 token actif par (user_email + device_id)
 *
 * LOGS :
 * [FCM_CLEANUP_START]
 * [FCM_CLEANUP_REPORT]
 * [FCM_CLEANUP_DUPLICATES_REMOVED]
 * [FCM_CLEANUP_INACTIVE_ARCHIVED]
 * [FCM_CLEANUP_LAST_ACTIVE_PROTECTED]
 * [FCM_CLEANUP_DONE]
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const INACTIVE_MAX_AGE_DAYS = 30; // Supprimer inactifs > 30 jours

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin requis' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { dry_run = true } = body; // Par défaut : rapport seulement, pas de suppression

    console.log(`[FCM_CLEANUP_START] admin=${user.email} | dry_run=${dry_run} | ts=${new Date().toISOString()}`);

    // ── 1. Charger TOUS les tokens ────────────────────────────────────────────
    const allTokens = await base44.asServiceRole.entities.FcmToken.list('-created_date', 2000);
    const total = allTokens.length;
    const now = Date.now();
    const inactiveAgeMs = INACTIVE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

    // ── 2. Analyser ───────────────────────────────────────────────────────────
    const activeTokens = allTokens.filter(t => t.is_active);
    const inactiveTokens = allTokens.filter(t => !t.is_active);

    // Grouper actifs par user_email
    const activeByUser = {};
    for (const t of activeTokens) {
      if (!activeByUser[t.user_email]) activeByUser[t.user_email] = [];
      activeByUser[t.user_email].push(t);
    }

    // Grouper actifs par (user_email + device_id) pour détecter doublons
    const activeByUserDevice = {};
    for (const t of activeTokens) {
      const key = `${t.user_email}__${t.device_id || 'unknown'}`;
      if (!activeByUserDevice[key]) activeByUserDevice[key] = [];
      activeByUserDevice[key].push(t);
    }

    // Détecter doublons exacts (même token)
    const tokenValues = new Map();
    const exactDuplicates = [];
    for (const t of allTokens) {
      if (!t.token) continue;
      if (tokenValues.has(t.token)) {
        exactDuplicates.push(t);
      } else {
        tokenValues.set(t.token, t.id);
      }
    }

    // Doublons par (user_email + device_id) — garder le plus récent, supprimer les autres
    const deviceDuplicatesToRemove = [];
    for (const [key, tokens] of Object.entries(activeByUserDevice)) {
      if (tokens.length <= 1) continue;
      // Trier par last_used desc → garder le premier
      tokens.sort((a, b) => new Date(b.last_used || b.registered_at || 0) - new Date(a.last_used || a.registered_at || 0));
      // Les autres sont des doublons
      deviceDuplicatesToRemove.push(...tokens.slice(1));
    }

    // Inactifs anciens (> 30 jours sans utilisation)
    const oldInactiveToRemove = inactiveTokens.filter(t => {
      const ref = t.last_used || t.registered_at || t.updated_date;
      if (!ref) return true; // Pas de date → considéré vieux
      return now - new Date(ref).getTime() > inactiveAgeMs;
    });

    // ── 3. Calcul tokens à protéger (dernier actif par user) ─────────────────
    const protectedIds = new Set();
    for (const [email, tokens] of Object.entries(activeByUser)) {
      if (tokens.length === 1) {
        protectedIds.add(tokens[0].id);
        console.log(`[FCM_CLEANUP_LAST_ACTIVE_PROTECTED] user=${email} | token_id=${tokens[0].id}`);
      }
    }

    // Filtrer les doublons à supprimer : ne jamais toucher un token protégé
    const safeDeviceDups = deviceDuplicatesToRemove.filter(t => !protectedIds.has(t.id));
    const safeExactDups = exactDuplicates.filter(t => !protectedIds.has(t.id));
    const safeOldInactive = oldInactiveToRemove.filter(t => !protectedIds.has(t.id));

    // Stats par user
    const tokensByUser = {};
    for (const t of allTokens) {
      if (!tokensByUser[t.user_email]) tokensByUser[t.user_email] = { total: 0, active: 0, inactive: 0 };
      tokensByUser[t.user_email].total++;
      if (t.is_active) tokensByUser[t.user_email].active++;
      else tokensByUser[t.user_email].inactive++;
    }

    // Stats par device_id
    const tokensByDevice = {};
    for (const t of allTokens) {
      const did = t.device_id || 'unknown';
      if (!tokensByDevice[did]) tokensByDevice[did] = 0;
      tokensByDevice[did]++;
    }

    // ── 4. RAPPORT ────────────────────────────────────────────────────────────
    const report = {
      total_tokens: total,
      active_tokens: activeTokens.length,
      inactive_tokens: inactiveTokens.length,
      exact_duplicates: safeExactDups.length,
      device_duplicates: safeDeviceDups.length,
      old_inactive_to_remove: safeOldInactive.length,
      protected_last_active: protectedIds.size,
      total_to_delete: safeExactDups.length + safeDeviceDups.length + safeOldInactive.length,
      tokens_by_user: Object.entries(tokensByUser)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 20)
        .map(([email, stats]) => ({ email, ...stats })),
      top_devices_by_count: Object.entries(tokensByDevice)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([device_id, count]) => ({ device_id, count })),
    };

    console.log(`[FCM_CLEANUP_REPORT] total=${total} | active=${activeTokens.length} | inactive=${inactiveTokens.length} | exactDups=${safeExactDups.length} | deviceDups=${safeDeviceDups.length} | oldInactive=${safeOldInactive.length} | protected=${protectedIds.size} | totalToDelete=${report.total_to_delete}`);

    if (dry_run) {
      return Response.json({ success: true, dry_run: true, report, message: 'Rapport généré. Relancer avec dry_run=false pour appliquer.' });
    }

    // ── 5. SUPPRESSION (si dry_run=false) ────────────────────────────────────
    let deletedExact = 0, deletedDevice = 0, deletedInactive = 0;

    // 5a. Supprimer doublons exacts
    for (const t of safeExactDups) {
      await base44.asServiceRole.entities.FcmToken.delete(t.id).catch(() => {});
      deletedExact++;
    }
    if (deletedExact > 0) console.log(`[FCM_CLEANUP_DUPLICATES_REMOVED] exact_duplicates_deleted=${deletedExact}`);

    // 5b. Désactiver doublons device (pas supprimer — archiver)
    for (const t of safeDeviceDups) {
      await base44.asServiceRole.entities.FcmToken.update(t.id, {
        is_active: false,
        last_used: t.last_used || t.registered_at,
      }).catch(() => {});
      deletedDevice++;
    }
    if (deletedDevice > 0) console.log(`[FCM_CLEANUP_DUPLICATES_REMOVED] device_duplicates_archived=${deletedDevice}`);

    // 5c. Supprimer inactifs anciens
    for (const t of safeOldInactive) {
      await base44.asServiceRole.entities.FcmToken.delete(t.id).catch(() => {});
      deletedInactive++;
    }
    if (deletedInactive > 0) console.log(`[FCM_CLEANUP_INACTIVE_ARCHIVED] old_inactive_deleted=${deletedInactive}`);

    const summary = {
      exact_duplicates_deleted: deletedExact,
      device_duplicates_archived: deletedDevice,
      old_inactive_deleted: deletedInactive,
      total_cleaned: deletedExact + deletedDevice + deletedInactive,
      protected: protectedIds.size,
    };

    console.log(`[FCM_CLEANUP_DONE] admin=${user.email} | cleaned=${summary.total_cleaned} | protected=${summary.protected} | ts=${new Date().toISOString()}`);

    return Response.json({ success: true, dry_run: false, report, summary });
  } catch (error) {
    console.error('[FCM_CLEANUP_ERROR]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});