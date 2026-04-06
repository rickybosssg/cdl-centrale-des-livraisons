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
    const profiles = await base44.asServiceRole.entities.UserProfile.filter({ id: profile_id });
    if (profiles.length === 0) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }
    const profile = profiles[0];

    if (action === 'approve') {
      const now = new Date().toISOString();

      // 1. Valider le UserProfile
      await base44.asServiceRole.entities.UserProfile.update(profile_id, {
        status: 'actif',
        validated_at: now,
        validated_by: user.email,
        refusal_reason: null,
      });

      // 2. SYNCHRONISATION CRITIQUE — mettre à jour l'entité User
      if (profile.profile_type === 'livreur') {
        try {
          const users = await base44.asServiceRole.entities.User.filter({ email: profile.user_email });
          if (users.length > 0) {
            const u = users[0];
            const data = (() => { try { return JSON.parse(profile.data_json || '{}'); } catch (_) { return {}; } })();

            const updateData = {
              user_type: 'livreur',
              statut_validation_livreur: 'valide',
              profil_valide: true,
              actif: true,
              date_validation: now,
            };

            // Copier téléphone / quartier / moyen_deplacement depuis data_json si manquants sur User
            if (!u.telephone && data.telephone) updateData.telephone = data.telephone;
            if (!u.quartier && data.quartier) updateData.quartier = data.quartier;
            if (!u.moyen_deplacement && data.moyen_deplacement) updateData.moyen_deplacement = data.moyen_deplacement;

            await base44.asServiceRole.entities.User.update(u.id, updateData);
            console.log(`[validateLivreurProfile] User synchronisé: ${profile.user_email} → user_type=livreur, statut_validation_livreur=valide`);
          } else {
            console.warn(`[validateLivreurProfile] User introuvable pour ${profile.user_email}`);
          }
        } catch (e) {
          console.error('[validateLivreurProfile] Erreur synchro User:', e.message);
        }
      }

      // 3. Notifier l'utilisateur
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

      // Révoquer la validation livreur sur l'entité User si applicable
      if (profile.profile_type === 'livreur') {
        try {
          const users = await base44.asServiceRole.entities.User.filter({ email: profile.user_email });
          if (users.length > 0) {
            await base44.asServiceRole.entities.User.update(users[0].id, {
              statut_validation_livreur: 'refuse',
              profil_valide: false,
              motif_refus: refusal_reason || 'Documents insuffisants',
            });
          }
        } catch (_) {}
      }

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