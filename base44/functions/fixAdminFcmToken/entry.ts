/**
 * fixAdminFcmToken — Réassigner TOUS les tokens FCM actifs à weezyh2@gmail.com
 * (Admin email correct pour Bedou push)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Récupérer tous les tokens actifs
    const allTokens = await base44.asServiceRole.entities.FcmToken.filter({ is_active: true });
    console.log(`[fixAdminFcmToken] Tokens trouvés: ${allTokens.length}`);

    if (!allTokens || allTokens.length === 0) {
      return Response.json({ error: 'Aucun token trouvé' }, { status: 404 });
    }

    const updates = [];
    for (const token of allTokens) {
      if (token.user_email !== 'weezyh2@gmail.com') {
        console.log(`[fixAdminFcmToken] Réassignant token de ${token.user_email} à weezyh2@gmail.com`);
        updates.push(
          base44.asServiceRole.entities.FcmToken.update(token.id, {
            user_email: 'weezyh2@gmail.com',
          })
        );
      }
    }

    await Promise.allSettled(updates);

    return Response.json({
      success: true,
      message: `${updates.length} token(s) réassigné(s) à weezyh2@gmail.com`,
      updated_count: updates.length,
    });
  } catch (err) {
    console.error('[fixAdminFcmToken] error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});