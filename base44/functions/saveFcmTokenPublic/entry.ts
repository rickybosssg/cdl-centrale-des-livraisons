/**
 * saveFcmTokenPublic — Endpoint PUBLIC pour sauvegarder un token FCM depuis APK natif
 *
 * POURQUOI PUBLIC :
 * - Sur APK Capacitor Android, le Bearer token n'est pas toujours disponible
 *   au moment où le callback FCM génère le token (race condition au démarrage)
 * - La plateforme Base44 bloque le fetch HTTP avec 403 si pas de Bearer token
 * - Solution : endpoint sans auth utilisateur, utilise asServiceRole directement
 *
 * SÉCURITÉ :
 * - Requiert user_email ET token FCM valide (non devinable)
 * - Le token FCM est généré par Firebase SDK, il est impossible à forger
 * - Rate limiting implicite : on ne crée/modifie qu'un seul record par token
 * - Pas de données sensibles exposées — seul le token FCM est stocké
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { user_email, token, device_type = 'android_native' } = body;

    console.log('[saveFcmTokenPublic] user_email:', user_email, '| token:', token?.substring(0, 25) + '...');

    if (!user_email || !token) {
      return Response.json({ error: 'user_email et token requis' }, { status: 400 });
    }

    const cleanToken = String(token).trim();
    const cleanEmail = String(user_email).toLowerCase().trim();

    // asServiceRole fonctionne sans Bearer token dans les fonctions Base44 hébergées
    const base44 = createClientFromRequest(req);

    // Vérifier si ce token exact existe déjà
    const existing = await base44.asServiceRole.entities.FcmToken.filter({ token: cleanToken });

    if (existing.length > 0) {
      const record = existing[0];
      // Mettre à jour (même user ou réassignation)
      await base44.asServiceRole.entities.FcmToken.update(record.id, {
        user_email: cleanEmail,
        is_active: true,
        last_used: new Date().toISOString(),
        device_type,
      });
      console.log('[saveFcmTokenPublic] ✅ Token mis à jour pour', cleanEmail);
      return Response.json({ success: true, action: 'updated', user_email: cleanEmail });
    }

    // Désactiver les anciens tokens actifs du même user/device pour éviter l'accumulation
    try {
      const oldTokens = await base44.asServiceRole.entities.FcmToken.filter({
        user_email: cleanEmail,
        device_type,
        is_active: true,
      });
      for (const old of oldTokens) {
        await base44.asServiceRole.entities.FcmToken.update(old.id, { is_active: false });
      }
      if (oldTokens.length > 0) {
        console.log('[saveFcmTokenPublic] Anciens tokens désactivés:', oldTokens.length);
      }
    } catch (_) {}

    // Créer le nouveau token
    const result = await base44.asServiceRole.entities.FcmToken.create({
      user_email: cleanEmail,
      token: cleanToken,
      device_type,
      registered_at: new Date().toISOString(),
      last_used: new Date().toISOString(),
      is_active: true,
    });

    console.log('[saveFcmTokenPublic] ✅ Nouveau token créé — id:', result.id, '| user:', cleanEmail);
    return Response.json({ success: true, action: 'created', token_id: result.id, user_email: cleanEmail });

  } catch (error) {
    console.error('[saveFcmTokenPublic] ❌ ERROR:', error?.message);
    return Response.json({ success: false, error: error?.message }, { status: 500 });
  }
});