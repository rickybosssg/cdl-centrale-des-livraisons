import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const PROFILE_REQUIREMENTS = {
  client: {
    immediate: true,
    fields: ['email', 'full_name', 'telephone'],
    needsAdminValidation: false,
  },
  livreur: {
    immediate: false,
    fields: ['telephone', 'quartier', 'moyen_deplacement'],
    needsAdminValidation: true,
    documents: ['photo_profil', 'photo_identite_recto', 'photo_identite_verso', 'photo_moyen_deplacement'],
  },
  partenaire: {
    immediate: false,
    fields: ['nom_commerce', 'type_commerce', 'telephone', 'adresse'],
    needsAdminValidation: true,
    documents: ['logo', 'photo_principale'],
  },
  commercial: {
    immediate: false,
    fields: ['telephone', 'quartier'],
    needsAdminValidation: true,
  },
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { profile_type, data } = payload;

    // SÉCURITÉ ABSOLUE : interdire la création d'un profil admin
    if (['admin', 'dispatcher', 'administrator'].includes(profile_type)) {
      return Response.json({ error: 'Forbidden: cannot create admin profile via this endpoint' }, { status: 403 });
    }

    // Vérifier aussi que l'appelant n'essaie pas de devenir admin via data
    if (data?.role === 'admin' || data?.user_type === 'admin') {
      return Response.json({ error: 'Forbidden: cannot set admin role' }, { status: 403 });
    }

    if (!profile_type || !PROFILE_REQUIREMENTS[profile_type]) {
      return Response.json({ error: 'Invalid profile_type' }, { status: 400 });
    }

    const requirements = PROFILE_REQUIREMENTS[profile_type];

    // Vérifier les champs requis
    const missingFields = requirements.fields.filter(f => !data[f]);
    if (missingFields.length > 0) {
      return Response.json({
        error: 'Missing required fields',
        missingFields,
      }, { status: 400 });
    }

    // Vérifier qu'on n'a pas déjà ce profil
    const existingProfile = await base44.entities.UserProfile.filter({
      user_email: user.email,
      profile_type,
      deleted: false,
    });

    if (existingProfile.length > 0) {
      return Response.json({
        error: 'User already has this profile type',
      }, { status: 400 });
    }

    // Créer le profil
    const status = requirements.immediate ? 'actif' : 'en_attente';
    const userProfiles = user.profiles_list ? JSON.parse(user.profiles_list) : [];

    if (!userProfiles.includes(profile_type)) {
      userProfiles.push(profile_type);
    }

    // Si c'est le premier profil ou si immediate, le rendre actif
    const isActiveProfile = !user.active_profile_type || requirements.immediate;

    const createdProfile = await base44.entities.UserProfile.create({
      user_email: user.email,
      profile_type,
      status,
      is_active_profile: isActiveProfile,
      data_json: JSON.stringify(data),
      validated_at: requirements.immediate ? new Date().toISOString() : null,
    });

    // Mettre à jour User
    await base44.auth.updateMe({
      profiles_list: JSON.stringify(userProfiles),
      active_profile_type: isActiveProfile ? profile_type : user.active_profile_type,
    });

    // Créer/mettre à jour l'entité associée si nécessaire
    if (profile_type === 'client') {
      const existingClient = await base44.entities.Client.filter({
        email: user.email,
      });
      if (existingClient.length === 0) {
        await base44.entities.Client.create({
          nom_complet: user.full_name,
          numero_telephone: data.telephone,
          email: user.email,
          quartier_principal: data.quartier,
          date_inscription: new Date().toISOString(),
          statut_client: 'Nouveau',
        });
      }
    }

    // Notifier l'utilisateur avec données réelles
    const roleEmojis = { client: '👤', livreur: '🛵', partenaire: '🏪', commercial: '📣' };
    const roleNames = { client: 'Client', livreur: 'Livreur', partenaire: 'Partenaire', commercial: 'Commercial' };
    
    await base44.entities.Notification.create({
      destinataire_email: user.email,
      destinataire_role: profile_type,
      titre: status === 'actif' 
        ? `✅ ${roleEmojis[profile_type] || ''} ${roleNames[profile_type] || profile_type} activé`
        : `⏳ ${roleEmojis[profile_type] || ''} Demande en attente de validation`,
      message: status === 'actif'
        ? `Votre profil ${roleNames[profile_type] || profile_type} CDL a été activé avec succès. Bienvenue!`
        : `Votre demande de profil ${roleNames[profile_type] || profile_type} CDL est en attente de validation par l'équipe CDL.`,
      type: status === 'actif' ? 'success' : 'warning',
      lue: false,
    });

    // Notifier les admins si validation requise avec données détaillées
    if (requirements.needsAdminValidation) {
      const admins = await base44.entities.User.filter({ role: 'admin' });
      let adminMessage = `Nom: ${user.full_name} | Email: ${user.email} | Téléphone: ${data.telephone || 'N/A'}`;
      
      if (profile_type === 'partenaire') {
        adminMessage = `Commerce: ${data.nom_commerce || 'N/A'} | Catégorie: ${data.type_commerce || 'N/A'} | Tél: ${data.telephone || 'N/A'} | Adresse: ${data.adresse || 'N/A'}`;
      } else if (profile_type === 'livreur') {
        adminMessage = `Nom: ${user.full_name} | Tél: ${data.telephone || 'N/A'} | Zone: ${data.quartier || 'N/A'} | Transport: ${data.moyen_deplacement || 'N/A'}`;
      }
      
      await Promise.all(
        admins.map(admin =>
          base44.entities.Notification.create({
            destinataire_email: admin.email,
            destinataire_role: 'admin',
            titre: `📋 Nouvelle demande de profil ${profile_type}`,
            message: adminMessage,
            type: 'info',
            lue: false,
          })
        )
      );
    }

    // Déclencher le recalcul des compteurs en tâche de fond (non bloquant)
    try {
      await base44.asServiceRole.functions.invoke('recalculateProfileCounters', {});
    } catch (_) {}

    return Response.json({
      success: true,
      profile: createdProfile,
      status,
      message: status === 'actif' ? 'Profile activated' : 'Profile pending admin validation',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});