import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { profile_type } = payload;

    // Vérifier que l'utilisateur a ce profil et qu'il est actif
    const profile = await base44.entities.UserProfile.filter({
      user_email: user.email,
      profile_type,
      status: 'actif',
      deleted: false,
    });

    if (profile.length === 0) {
      // Permettre aussi les profils en_attente ou refusés si demande
      const anyProfile = await base44.entities.UserProfile.filter({
        user_email: user.email,
        profile_type,
        deleted: false,
      });
      if (anyProfile.length === 0 || !['actif', 'en_attente', 'refuse'].includes(anyProfile[0].status)) {
        return Response.json({ error: 'Profile not available for switching' }, { status: 404 });
      }
      // Sinon continuer avec le profil trouvé
      profile[0] = anyProfile[0];
    } else {
      profile[0] = profile[0];
    }

    // Désactiver l'ancien profil actif
    const oldProfile = await base44.entities.UserProfile.filter({
      user_email: user.email,
      is_active_profile: true,
      deleted: false,
    });

    if (oldProfile.length > 0) {
      await base44.entities.UserProfile.update(oldProfile[0].id, {
        is_active_profile: false,
      });
    }

    // Activer le nouveau profil
    await base44.entities.UserProfile.update(profile[0].id, {
      is_active_profile: true,
    });

    // Mettre à jour User
    await base44.auth.updateMe({
      active_profile_type: profile_type,
    });

    // Notifier
    await base44.entities.Notification.create({
      destinataire_email: user.email,
      destinataire_role: profile_type,
      titre: `✅ Profil changé`,
      message: `Vous êtes maintenant connecté en tant que ${profile_type}.`,
      type: 'success',
      lue: false,
    });

    return Response.json({
      success: true,
      activeProfileType: profile_type,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});