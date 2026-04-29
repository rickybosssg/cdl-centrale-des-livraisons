import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * cleanupFcmTokens — Désactive les tokens FCM non utilisés depuis plus de X jours
 * Appelé via automation schedulée (ex: quotidiennement)
 * Accessible aussi manuellement par un admin
 */
const INACTIVE_DAYS = 30; // Désactiver après 30 jours sans utilisation

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Vérification admin
    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Admin uniquement' }, { status: 403 });
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - INACTIVE_DAYS);
    const cutoffISO = cutoffDate.toISOString();

    console.log(`[cleanupFcmTokens] Désactivation des tokens sans activité depuis ${INACTIVE_DAYS} jours (avant ${cutoffISO})`);

    // Récupérer tous les tokens actifs
    const allActiveTokens = await base44.asServiceRole.entities.FcmToken.filter(
      { is_active: true },
      '-registered_at',
      500
    );

    let deactivated = 0;
    const toDeactivate = allActiveTokens.filter(t => {
      const lastActivity = t.last_used || t.registered_at;
      return lastActivity && lastActivity < cutoffISO;
    });

    for (const token of toDeactivate) {
      await base44.asServiceRole.entities.FcmToken.update(token.id, {
        is_active: false,
      });
      deactivated++;
      console.log(`[cleanupFcmTokens] Token désactivé: ${token.user_email} | ${token.token.slice(0, 20)}... | last_used: ${token.last_used || token.registered_at}`);
    }

    console.log(`[cleanupFcmTokens] ✅ ${deactivated}/${allActiveTokens.length} tokens désactivés`);

    return Response.json({
      success: true,
      scanned: allActiveTokens.length,
      deactivated,
      cutoff_date: cutoffISO,
      inactive_days_threshold: INACTIVE_DAYS,
    });

  } catch (error) {
    console.error('[cleanupFcmTokens] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});