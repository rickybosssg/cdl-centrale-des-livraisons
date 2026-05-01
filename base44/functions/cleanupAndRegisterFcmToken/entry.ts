/**
 * cleanupAndRegisterFcmToken — Nettoyage des tokens inactifs + enregistrement du dernier token
 * Appelé à chaque démarrage app pour assurer un token unique par user_id + device_id
 *
 * Actions :
 * 1. Chercher les anciens tokens du même user_id + device_id
 * 2. Supprimer les anciens tokens (garder le dernier)
 * 3. Enregistrer/mettre à jour le token actuel
 * 4. Retourner l'état du token
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { token, device_type = 'android_native', device_id = 'unknown' } = body;

    if (!token) {
      return Response.json({ error: 'Token required' }, { status: 400 });
    }

    const user_email = user.email;
    console.log(`[cleanup] user: ${user_email} | device_id: ${device_id} | token_len: ${token.length}`);

    // ── 1. Chercher les tokens existants du même user_id + device_id ──────
    const existingTokens = await base44.entities.FcmToken.filter({
      user_email: user_email,
      device_type: device_type,
    });

    console.log(`[cleanup] Found ${existingTokens.length} existing tokens for this user+device`);

    let old_token_removed = false;
    let old_token_id = null;

    // ── 2. Supprimer les anciens tokens (garder le dernier) ──────────────
    if (existingTokens.length > 0) {
      // Trier par created_date (plus récent d'abord)
      const sorted = existingTokens.sort(
        (a, b) => new Date(b.created_date) - new Date(a.created_date)
      );

      // Supprimer tous sauf le plus récent
      for (let i = 1; i < sorted.length; i++) {
        try {
          await base44.entities.FcmToken.delete(sorted[i].id);
          console.log(`[cleanup] Deleted old token: ${sorted[i].id}`);
          old_token_removed = true;
          old_token_id = sorted[i].id;
        } catch (e) {
          console.warn(`[cleanup] Failed to delete token ${sorted[i].id}:`, e?.message);
        }
      }

      // Vérifier si le token le plus récent est le même que le nouveau
      const latestToken = sorted[0];
      if (latestToken.token === token) {
        // Même token — juste mettre à jour last_used
        console.log(`[cleanup] Token already registered, updating last_used`);
        await base44.entities.FcmToken.update(latestToken.id, {
          last_used: new Date().toISOString(),
          is_active: true,
        });

        return Response.json({
          success: true,
          action: 'updated',
          token_id: latestToken.id,
          old_token_removed: false,
          message: 'Token already registered, last_used updated',
        });
      }
    }

    // ── 3. Enregistrer/créer le nouveau token ─────────────────────────────
    const now = new Date().toISOString();
    const newToken = await base44.entities.FcmToken.create({
      user_email: user_email,
      token: token,
      device_type: device_type,
      registered_at: now,
      last_used: now,
      is_active: true,
    });

    console.log(`[cleanup] New token registered: ${newToken.id}`);

    return Response.json({
      success: true,
      action: 'created',
      token_id: newToken.id,
      old_token_removed: old_token_removed,
      old_token_id: old_token_id,
      message: 'Token registered successfully',
    });
  } catch (error) {
    console.error('[cleanup] Error:', error?.message);
    return Response.json(
      { error: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
});