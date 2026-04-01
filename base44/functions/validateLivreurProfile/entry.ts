import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { profile_id, action, refusal_reason } = await req.json();

    if (!profile_id || !['approve', 'reject'].includes(action)) {
      return Response.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    // Récupérer le profil
    const profiles = await base44.asServiceRole.entities.UserProfile.filter({
      id: profile_id,
    });

    if (profiles.length === 0) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    const profile = profiles[0];

    if (action === 'approve') {
      // Marquer comme validé
      await base44.asServiceRole.entities.UserProfile.update(profile_id, {
        status: 'actif',
        validated_at: new Date().toISOString(),
        validated_by: user.email,
      });

      // Pour livreur, créer l'entité Livreur
      if (profile.profile_type === 'livreur') {
        try {
          const data = JSON.parse(profile.data_json || '{}');
          const existingLivreur = await base44.asServiceRole.entities.User.filter({
            email: profile.user_email,
            user_type: 'livreur',
          });

          if (existingLivreur.length === 0) {
            // Créer enregistrement complet Livreur
            await base44.asServiceRole.functions.invoke('createClientOnUserCreation', {
              user_email: profile.user_email,
              user_type: 'livreur',
              data,
            });
          }
        } catch (e) {
          console.warn('[validateLivreurProfile] Erreur création livreur (non bloquant):', e.message);
        }
      }

      // Notifier l'utilisateur
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: profile.user_email,
        destinataire_role: profile.profile_type,
        titre: '✅ Profil validé !',
        message: `Votre profil ${profile.profile_type} a été validé. Bienvenue sur CDL !`,
        type: 'success',
        lue: false,
      });

      return Response.json({ success: true, message: 'Profile approved' });
    } else {
      // Rejeter
      await base44.asServiceRole.entities.UserProfile.update(profile_id, {
        status: 'refuse',
        refusal_reason: refusal_reason || 'Documents insuffisants',
        refused_at: new Date().toISOString(),
        refused_by: user.email,
      });

      // Notifier l'utilisateur
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: profile.user_email,
        destinataire_role: profile.profile_type,
        titre: '❌ Profil refusé',
        message: `Votre demande de profil ${profile.profile_type} a été refusée. Motif : ${refusal_reason || 'Documents insuffisants'}. Vous pouvez réessayer.`,
        type: 'danger',
        lue: false,
      });

      return Response.json({ success: true, message: 'Profile rejected' });
    }
  } catch (error) {
    console.error('[validateLivreurProfile] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});