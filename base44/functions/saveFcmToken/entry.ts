/**
 * Sauvegarde le token FCM d'un utilisateur
 * Évite les doublons par (user_email + token)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const { token } = await req.json();
    if (!token) return Response.json({ error: "Token requis" }, { status: 400 });

    // Vérifier si ce token existe déjà pour cet utilisateur
    const existing = await base44.asServiceRole.entities.FcmToken.filter({
      user_email: user.email,
      token,
    });

    if (existing.length === 0) {
      await base44.asServiceRole.entities.FcmToken.create({
        user_email: user.email,
        token,
        user_role: user.role || "user",
        last_seen: new Date().toISOString(),
      });
    } else {
      // Mettre à jour last_seen
      await base44.asServiceRole.entities.FcmToken.update(existing[0].id, {
        last_seen: new Date().toISOString(),
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});