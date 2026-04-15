import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * saveFcmToken — Enregistrer le token FCM natif en BDD
 * Appelée par AppLayoutWrapper quand le token est reçu
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { token } = await req.json();
    if (!token) {
      return Response.json({ error: 'Token requis' }, { status: 400 });
    }

    console.log(`[saveFcmToken] Sauvegarde token pour ${user.email}:`, token.substring(0, 25) + '...');

    // 1. Vérifier si un token existe déjà pour cet utilisateur
    const existing = await base44.asServiceRole.entities.FcmToken.filter({
      user_email: user.email,
    });

    // 2. Supprimer les anciens tokens (garder un seul token actif par user)
    for (const old of existing) {
      try {
        await base44.asServiceRole.entities.FcmToken.delete(old.id);
        console.log(`[saveFcmToken] Token ancien supprimé: ${old.id}`);
      } catch (_) {}
    }

    // 3. Créer le nouveau token
    const result = await base44.asServiceRole.entities.FcmToken.create({
      user_email: user.email,
      token,
      device_type: 'android_native',
      registered_at: new Date().toISOString(),
    });

    console.log(`[saveFcmToken] ✅ Token enregistré:`, result.id);
    return Response.json({
      success: true,
      token_id: result.id,
      message: `Token FCM enregistré pour ${user.email}`,
    });
  } catch (error) {
    console.error('[saveFcmToken] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});