/**
 * reassignAdminFcmToken — Réassigner un token FCM à l'email admin correct
 * 
 * Trouve le token FCM actuel et le réaffecte à weezyh2@gmail.com
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { token_to_reassign, new_admin_email } = body;

    if (!token_to_reassign || !new_admin_email) {
      return Response.json({ error: 'token_to_reassign et new_admin_email requis' }, { status: 400 });
    }

    // Trouver le token
    const tokens = await base44.asServiceRole.entities.FcmToken.filter({ token: token_to_reassign });
    if (!tokens || tokens.length === 0) {
      return Response.json({ error: 'Token non trouvé' }, { status: 404 });
    }

    const tokenRecord = tokens[0];
    console.log(`[reassignAdminFcmToken] Avant: email=${tokenRecord.user_email} token=${tokenRecord.token.slice(0, 20)}...`);

    // Réassigner
    await base44.asServiceRole.entities.FcmToken.update(tokenRecord.id, {
      user_email: new_admin_email,
    });

    console.log(`[reassignAdminFcmToken] Après: email=${new_admin_email}`);

    return Response.json({
      success: true,
      message: `Token réassigné à ${new_admin_email}`,
      token_id: tokenRecord.id,
      old_email: tokenRecord.user_email,
      new_email: new_admin_email,
    });
  } catch (err) {
    console.error('[reassignAdminFcmToken] error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});