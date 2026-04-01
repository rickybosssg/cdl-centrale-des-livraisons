import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    console.log('[updateProfileRequest] ====== DÉBUT UPDATE PROFIL ======');
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      console.log('[updateProfileRequest] ERROR: User not authenticated');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { profile_id, action } = payload; // action: "reopen" ou "resume"

    console.log('[updateProfileRequest] User:', user.email);
    console.log('[updateProfileRequest] Profile ID:', profile_id);
    console.log('[updateProfileRequest] Action:', action);

    if (!profile_id || !action) {
      return Response.json({ error: 'profile_id and action required' }, { status: 400 });
    }

    // Récupérer le profil
    const profile = await base44.entities.UserProfile.filter({
      id: profile_id,
      user_email: user.email,
      deleted: false,
    });

    if (profile.length === 0) {
      console.log('[updateProfileRequest] ERROR: Profil non trouvé');
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    const profileData = profile[0];
    console.log('[updateProfileRequest] Profil trouvé:', profileData.profile_type, '- statut:', profileData.status);

    // Vérifier que c'est un profil modifiable (en_attente ou refuse)
    if (!['en_attente', 'refuse'].includes(profileData.status)) {
      console.log('[updateProfileRequest] ERROR: Profil non modifiable (statut:', profileData.status, ')');
      return Response.json({
        error: 'Only pending or refused profiles can be updated',
      }, { status: 400 });
    }

    // "reopen" = réouvrir pour édition (interne, pas de changement BD ici)
    // "resume" = continuer l'inscription (interne, pas de changement BD ici)
    // Les deux redirectionnent vers /settings
    console.log('[updateProfileRequest] Action:', action, '→ redirection /settings');

    // Créer une notification utilisateur
    console.log('[updateProfileRequest] Création notification utilisateur...');
    const roleNames = {
      client: 'Client',
      livreur: 'Livreur',
      partenaire: 'Partenaire',
      commercial: 'Commercial',
    };

    const msgMap = {
      reopen: `Vous pouvez maintenant modifier votre demande de profil ${roleNames[profileData.profile_type] || profileData.profile_type}.`,
      resume: `Continuez votre inscription pour le profil ${roleNames[profileData.profile_type] || profileData.profile_type}.`,
    };

    await base44.entities.Notification.create({
      destinataire_email: user.email,
      destinataire_role: 'user',
      titre: `📝 ${action === 'reopen' ? 'Modification' : 'Reprise'} de profil`,
      message: msgMap[action] || 'Action sur votre profil',
      type: 'info',
      lue: false,
    });
    console.log('[updateProfileRequest] Notification créée');

    console.log('[updateProfileRequest] ====== SUCCÈS ======');
    return Response.json({
      success: true,
      action,
      profile_type: profileData.profile_type,
      message: `Profil ${action === 'reopen' ? 'réouvert' : 'repris'} avec succès`,
    });
  } catch (error) {
    console.error('[updateProfileRequest] ERROR:', error.message);
    console.error('[updateProfileRequest] Stack:', error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});