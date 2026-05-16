import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Bascule le profil actif d'un utilisateur.
 * Réinitialise tous les statuts en ligne et active uniquement celui du profil choisi.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { profile_type } = await req.json();

    // Vérifier que le profil existe et est actif pour cet utilisateur
    // asServiceRole pour éviter tout blocage RLS sur les profils de l'utilisateur lui-même
    const profiles = await base44.asServiceRole.entities.UserProfile.filter({
      user_email: user.email,
      profile_type,
      deleted: false,
    });

    if (profiles.length === 0) {
      return Response.json({ error: 'Profil introuvable' }, { status: 404 });
    }

    // Accepter le profil actif en priorité, sinon le premier profil disponible
    const targetProfile = profiles.find(p => p.status === 'actif') || profiles[0];

    // Désactiver tous les anciens profils actifs (asServiceRole pour éviter RLS)
    const oldActives = await base44.asServiceRole.entities.UserProfile.filter({
      user_email: user.email,
      is_active_profile: true,
      deleted: false,
    });
    for (const p of oldActives) {
      if (p.id !== targetProfile.id) {
        await base44.asServiceRole.entities.UserProfile.update(p.id, { is_active_profile: false });
      }
    }

    // Activer le nouveau profil
    await base44.asServiceRole.entities.UserProfile.update(targetProfile.id, { is_active_profile: true });

    // Réinitialiser TOUS les statuts en ligne + activer uniquement le rôle choisi
    const onlineFields = {
      current_role: profile_type,
      driver_online: profile_type === 'livreur',
      client_online: profile_type === 'client',
      commercial_online: profile_type === 'commercial',
      partner_online: profile_type === 'partenaire',
      active_profile_type: profile_type,
      last_seen: new Date().toISOString(),
    };

    // Pour les livreurs, conserver le champ disponible selon leur préférence
    if (profile_type !== 'livreur') {
      onlineFields.disponible = false;
    }

    await base44.auth.updateMe(onlineFields);

    // Retourner le user actualisé pour que le frontend rafraîchisse AuthContext
    const updatedUser = await base44.auth.me().catch(() => null);

    console.log(`[SwitchProfile] ${user.email} → ${profile_type} | driver_online=${onlineFields.driver_online}`);

    return Response.json({ success: true, activeProfileType: profile_type, onlineFields, user: updatedUser });
  } catch (error) {
    console.error('[SwitchProfile] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});