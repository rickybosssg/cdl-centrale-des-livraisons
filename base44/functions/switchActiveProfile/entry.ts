import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { profile_type } = await req.json();

    // Vérifier que le profil existe pour cet utilisateur
    const profiles = await base44.entities.UserProfile.filter({
      user_email: user.email,
      profile_type,
      deleted: false,
    });

    if (profiles.length === 0) {
      return Response.json({ error: 'Profil introuvable' }, { status: 404 });
    }

    // Désactiver l'ancien profil actif
    const oldActives = await base44.entities.UserProfile.filter({
      user_email: user.email,
      is_active_profile: true,
      deleted: false,
    });
    for (const p of oldActives) {
      if (p.id !== profiles[0].id) {
        await base44.entities.UserProfile.update(p.id, { is_active_profile: false });
      }
    }

    // Activer le nouveau profil
    await base44.entities.UserProfile.update(profiles[0].id, { is_active_profile: true });

    // Mettre à jour le user
    await base44.auth.updateMe({ active_profile_type: profile_type });

    return Response.json({ success: true, activeProfileType: profile_type });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});