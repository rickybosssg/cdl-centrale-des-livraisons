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

    // Trouver et soft-delete le profil
    const profile = await base44.entities.UserProfile.filter({
      user_email: user.email,
      profile_type,
      deleted: false,
    });

    if (profile.length === 0) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    await base44.entities.UserProfile.update(profile[0].id, {
      deleted: true,
      deleted_at: new Date().toISOString(),
    });

    // Mettre à jour la liste des profils
    const userProfiles = user.profiles_list ? JSON.parse(user.profiles_list) : [];
    const updatedProfiles = userProfiles.filter(p => p !== profile_type);

    // Si c'était le profil actif, changer vers un autre
    let newActiveProfile = user.active_profile_type;
    if (user.active_profile_type === profile_type && updatedProfiles.length > 0) {
      newActiveProfile = updatedProfiles[0];
    }

    await base44.auth.updateMe({
      profiles_list: JSON.stringify(updatedProfiles),
      active_profile_type: newActiveProfile || null,
    });

    // Notifier
    await base44.entities.Notification.create({
      destinataire_email: user.email,
      destinataire_role: profile_type,
      titre: `🔒 Profil retiré`,
      message: `Votre profil ${profile_type} CDL a été retiré.`,
      type: 'warning',
      lue: false,
    });

    return Response.json({
      success: true,
      remainingProfiles: updatedProfiles,
      activeProfileType: newActiveProfile,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});