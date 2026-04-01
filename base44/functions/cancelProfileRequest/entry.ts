import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    console.log('[cancelProfileRequest] ====== DÉBUT ANNULATION PROFIL ======');
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      console.log('[cancelProfileRequest] ERROR: User not authenticated');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { profile_id } = payload;

    console.log('[cancelProfileRequest] User:', user.email);
    console.log('[cancelProfileRequest] Profile ID à annuler:', profile_id);

    if (!profile_id) {
      return Response.json({ error: 'profile_id required' }, { status: 400 });
    }

    // Récupérer le profil
    const profile = await base44.entities.UserProfile.filter({
      id: profile_id,
      user_email: user.email,
      deleted: false,
    });

    if (profile.length === 0) {
      console.log('[cancelProfileRequest] ERROR: Profil non trouvé');
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    const profileData = profile[0];
    console.log('[cancelProfileRequest] Profil trouvé:', profileData.profile_type, '- statut:', profileData.status);

    // Vérifier que c'est bien une demande en attente ou refusée (annulable)
    if (!['en_attente', 'refuse'].includes(profileData.status)) {
      console.log('[cancelProfileRequest] ERROR: Profil non annulable (statut:', profileData.status, ')');
      return Response.json({
        error: 'Only pending or refused profiles can be canceled',
      }, { status: 400 });
    }

    // Soft delete du profil
    console.log('[cancelProfileRequest] Suppression du profil...');
    await base44.entities.UserProfile.update(profileData.id, {
      deleted: true,
      deleted_at: new Date().toISOString(),
    });
    console.log('[cancelProfileRequest] Profil supprimé');

    // Notifier l'utilisateur
    console.log('[cancelProfileRequest] Création notification utilisateur...');
    const roleNames = {
      client: 'Client',
      livreur: 'Livreur',
      partenaire: 'Partenaire',
      commercial: 'Commercial',
    };

    await base44.entities.Notification.create({
      destinataire_email: user.email,
      destinataire_role: 'user',
      titre: `❌ Demande de profil ${roleNames[profileData.profile_type] || profileData.profile_type} annulée`,
      message: `Votre demande de profil ${roleNames[profileData.profile_type] || profileData.profile_type} a été annulée. Vous pouvez la recréer ultérieurement.`,
      type: 'info',
      lue: false,
    });
    console.log('[cancelProfileRequest] Notification créée');

    // Notifier les admins (log)
    console.log('[cancelProfileRequest] LOG ADMIN: Profil annulé par utilisateur');
    try {
      await base44.entities.AdminActionLog.create({
        admin_email: 'system',
        object_type: 'user_profile',
        object_id: profileData.id,
        object_name: `${user.full_name} - ${profileData.profile_type}`,
        action: 'annule_par_utilisateur',
        reason: `Utilisateur a annulé sa demande de profil ${profileData.profile_type}`,
        target_email: user.email,
      });
      console.log('[cancelProfileRequest] AdminActionLog créé');
    } catch (err) {
      console.warn('[cancelProfileRequest] Erreur AdminActionLog (non bloquant):', err.message);
    }

    console.log('[cancelProfileRequest] ====== SUCCÈS ANNULATION ======');
    return Response.json({
      success: true,
      message: 'Profile request canceled successfully',
    });
  } catch (error) {
    console.error('[cancelProfileRequest] ERROR:', error.message);
    console.error('[cancelProfileRequest] Stack:', error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});