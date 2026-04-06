import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Correction rétroactive + synchronisation livreur.
 * Scanne tous les UserProfile livreur actifs et s'assure que
 * l'entité User correspondante a bien :
 *   - user_type = 'livreur'
 *   - statut_validation_livreur = 'valide'
 *   - profil_valide = true
 *   - actif = true
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Récupérer tous les UserProfile livreur validés
    const profiles = await base44.asServiceRole.entities.UserProfile.filter({
      profile_type: 'livreur',
      status: 'actif',
      deleted: false,
    });

    console.log(`[syncLivreurProfiles] ${profiles.length} profil(s) livreur actif(s) trouvés`);

    let synced = 0;
    let skipped = 0;
    const errors = [];

    for (const profile of profiles) {
      try {
        // Trouver l'utilisateur correspondant
        const users = await base44.asServiceRole.entities.User.filter({ email: profile.user_email });
        if (users.length === 0) {
          errors.push({ email: profile.user_email, reason: 'User not found' });
          continue;
        }

        const u = users[0];

        // Construire les données de mise à jour
        const updateData = {};
        let needsUpdate = false;

        if (u.user_type !== 'livreur') {
          updateData.user_type = 'livreur';
          needsUpdate = true;
        }
        if (u.statut_validation_livreur !== 'valide') {
          updateData.statut_validation_livreur = 'valide';
          needsUpdate = true;
        }
        if (!u.profil_valide) {
          updateData.profil_valide = true;
          needsUpdate = true;
        }
        if (!u.actif) {
          updateData.actif = true;
          needsUpdate = true;
        }

        // Copier téléphone et quartier depuis data_json si manquants
        if (!u.telephone || !u.quartier) {
          try {
            const data = JSON.parse(profile.data_json || '{}');
            if (!u.telephone && data.telephone) updateData.telephone = data.telephone;
            if (!u.quartier && data.quartier) updateData.quartier = data.quartier;
            if (!u.moyen_deplacement && data.moyen_deplacement) updateData.moyen_deplacement = data.moyen_deplacement;
            if (Object.keys(updateData).length > 0) needsUpdate = true;
          } catch (_) {}
        }

        if (needsUpdate) {
          await base44.asServiceRole.entities.User.update(u.id, updateData);
          console.log(`[syncLivreurProfiles] Synced: ${u.email} → user_type=livreur`);
          synced++;
        } else {
          skipped++;
        }
      } catch (err) {
        errors.push({ email: profile.user_email, reason: err.message });
      }
    }

    return Response.json({
      success: true,
      total: profiles.length,
      synced,
      skipped,
      errors,
    });

  } catch (error) {
    console.error('[syncLivreurProfiles] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});