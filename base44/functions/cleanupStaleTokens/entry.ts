/**
 * cleanupStaleTokens — Nettoyage automatique des tokens FCM inactifs > 7 jours
 * 
 * Appelé par automation schedulée (quotidien) OU manuellement depuis /system-health
 * Admin only.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    // Récupérer tous les tokens inactifs
    const allInactive = await base44.asServiceRole.entities.FcmToken.filter(
      { is_active: false }, null, 500
    );

    const staleIds = (allInactive || [])
      .filter(t => {
        const ref = t.last_used || t.registered_at;
        if (!ref) return true; // pas de date → considéré périmé
        return Date.now() - new Date(ref).getTime() > STALE_THRESHOLD_MS;
      })
      .map(t => t.id);

    let deleted = 0;
    for (const id of staleIds) {
      try {
        await base44.asServiceRole.entities.FcmToken.delete(id);
        deleted++;
      } catch (_) {}
    }

    // Aussi dédupliquer les tokens actifs (garder le plus récent par user_email)
    const allActive = await base44.asServiceRole.entities.FcmToken.filter(
      { is_active: true }, null, 500
    );

    // Grouper par user_email
    const byUser = {};
    for (const t of (allActive || [])) {
      const email = t.user_email;
      if (!byUser[email]) byUser[email] = [];
      byUser[email].push(t);
    }

    let deduped = 0;
    for (const [email, tokens] of Object.entries(byUser)) {
      if (tokens.length <= 1) continue;
      // Trier par last_used desc, garder le premier
      tokens.sort((a, b) => {
        const ta = new Date(a.last_used || a.registered_at || 0).getTime();
        const tb = new Date(b.last_used || b.registered_at || 0).getTime();
        return tb - ta;
      });
      // Désactiver tous sauf le premier
      for (let i = 1; i < tokens.length; i++) {
        try {
          await base44.asServiceRole.entities.FcmToken.update(tokens[i].id, { is_active: false });
          deduped++;
        } catch (_) {}
      }
    }

    const elapsed = Date.now() - t0;
    console.log(`[FCM_CLEANUP] deleted_stale=${deleted} | deduped_active=${deduped} | elapsed=${elapsed}ms`);

    return Response.json({
      success: true,
      deleted_stale: deleted,
      deduped_active: deduped,
      elapsed_ms: elapsed,
    });

  } catch (e) {
    console.error(`[FCM_CLEANUP] ERROR: ${e.message}`);
    return Response.json({ error: e.message }, { status: 500 });
  }
});