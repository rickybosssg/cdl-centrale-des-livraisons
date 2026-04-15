/**
 * saveFcmToken — Sauvegarde / mise à jour du token FCM
 *
 * CORRECTIONS :
 * - Déduplication par token (pas user+token) → un token = un enregistrement
 * - Si le token appartient à un autre user (ré-attribution device) → mettre à jour
 * - Nettoyage des tokens trop anciens (> 60 jours) du même user
 * - Logs complets
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const body = await req.json();
    const { token } = body;
    if (!token || typeof token !== 'string' || token.length < 20) {
      return Response.json({ error: "Token FCM invalide" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Chercher si ce token exact existe déjà (peu importe le user)
    const existingByToken = await base44.asServiceRole.entities.FcmToken.filter({ token });

    if (existingByToken.length > 0) {
      const existing = existingByToken[0];
      // Mettre à jour (y compris si changement d'utilisateur sur le même appareil)
      await base44.asServiceRole.entities.FcmToken.update(existing.id, {
        user_email: user.email,
        user_role: user.role || "user",
        last_seen: now,
      });
      console.log(`[saveFcmToken] Token mis à jour pour ${user.email} (id: ${existing.id})`);
    } else {
      // Nouveau token → créer
      await base44.asServiceRole.entities.FcmToken.create({
        user_email: user.email,
        token,
        user_role: user.role || "user",
        last_seen: now,
      });
      console.log(`[saveFcmToken] Nouveau token créé pour ${user.email}`);
    }

    // 2. Nettoyer les tokens anciens (> 60 jours) du même utilisateur
    const allUserTokens = await base44.asServiceRole.entities.FcmToken.filter({ user_email: user.email });
    const staleTokens = allUserTokens.filter(t =>
      t.token !== token &&
      t.last_seen &&
      t.last_seen < sixtyDaysAgo
    );
    if (staleTokens.length > 0) {
      await Promise.all(staleTokens.map(t =>
        base44.asServiceRole.entities.FcmToken.delete(t.id).catch(() => {})
      ));
      console.log(`[saveFcmToken] ${staleTokens.length} token(s) périmé(s) supprimé(s) pour ${user.email}`);
    }

    return Response.json({ success: true, email: user.email });
  } catch (error) {
    console.error('[saveFcmToken] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});