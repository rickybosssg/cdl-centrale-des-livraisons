import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const PROFILE_REQUIREMENTS = {
  client: {
    immediate: true,
    fields: ['telephone', 'quartier'],
    documents: [],
    needsAdminValidation: false,
  },
  livreur: {
    immediate: false,
    fields: ['telephone', 'quartier', 'moyen_deplacement'],
    documents: ['photo_profil', 'photo_identite_recto', 'photo_identite_verso', 'photo_moyen_deplacement'],
    needsAdminValidation: true,
  },
  partenaire: {
    immediate: false,
    fields: ['nom_commerce', 'type_commerce', 'telephone', 'adresse'],
    documents: ['logo', 'photo_principale'],
    needsAdminValidation: true,
  },
  commercial: {
    immediate: false,
    fields: ['telephone', 'quartier', 'code_promo'],
    documents: [],
    needsAdminValidation: true,
  },
};

Deno.serve(async (req) => {
  try {
    console.log('[addProfileToUser] ====== DÉBUT CRÉATION PROFIL ======');
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      console.log('[addProfileToUser] ERROR: User not authenticated');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('[addProfileToUser] User:', user.email);

    const payload = await req.json();
    const { profile_type, data } = payload;
    console.log('[addProfileToUser] profile_type:', profile_type);
    console.log('[addProfileToUser] data:', data);

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

    // VALIDATION STRICTE: Vérifier les champs requis
    const missingFields = requirements.fields.filter(f => !data[f]);
    console.log('[addProfileToUser] Champs manquants:', missingFields);

    // VALIDATION STRICTE: Vérifier les documents requis
    const missingDocuments = requirements.documents.filter(docKey => !data[docKey]);
    console.log('[addProfileToUser] Documents manquants:', missingDocuments);

    // ❌ Refuser si données ou documents obligatoires manquent
    if (missingFields.length > 0 || missingDocuments.length > 0) {
      return Response.json({
        error: 'Incomplete profile: missing fields and/or documents',
        missingFields,
        missingDocuments,
        requiredFields: requirements.fields,
        requiredDocuments: requirements.documents,
      }, { status: 400 });
    }

    // Pour commercial : valider unicité du code promo AVANT toute création
    if (profile_type === 'commercial') {
      const codeValue = (data.code_promo || '').toUpperCase().trim();
      if (!codeValue || codeValue.length < 4 || codeValue.length > 12 || !/^[A-Z0-9]+$/.test(codeValue)) {
        return Response.json({ error: 'Code promo invalide : 4-12 caractères, lettres et chiffres uniquement' }, { status: 400 });
      }
      const existingCode = await base44.entities.CodePromo.filter({ code: codeValue });
      if (existingCode.length > 0) {
        return Response.json({ error: 'Ce code promo est déjà utilisé, veuillez en choisir un autre' }, { status: 400 });
      }
    }

    // Vérifier qu'on n'a pas déjà ce profil
    const existingProfile = await base44.entities.UserProfile.filter({
      user_email: user.email,
      profile_type,
      deleted: false,
    });

    console.log('[addProfileToUser] Profils existants du type', profile_type, ':', existingProfile.length);

    if (existingProfile.length > 0) {
      console.log('[addProfileToUser] ERROR: Profil', profile_type, 'déjà existant');
      return Response.json({
        error: 'User already has this profile type',
      }, { status: 400 });
    }

    // ✅ À ce stade: tous les champs et documents obligatoires sont fournis
    const status = profile_type === 'client' ? 'actif' : 'en_attente';
    console.log('[addProfileToUser] Statut du nouveau profil:', status);
    const userProfiles = user.profiles_list ? JSON.parse(user.profiles_list) : [];

    if (!userProfiles.includes(profile_type)) {
      userProfiles.push(profile_type);
    }

    // FIX 2: Seul client peut être actif immédiatement. Autres = toujours en_attente
    const isActiveProfile = profile_type === 'client' && !user.active_profile_type;

    console.log('[addProfileToUser] Création UserProfile...');
    // Extraire les URLs des documents pour tous les profils
    const docUrls = {};
    requirements.documents.forEach(docKey => {
      docUrls[docKey] = data[docKey] || null;
    });

    // Préparer les champs manquants et les documents manquants (à ce stade: vides)
    const createdProfile = await base44.entities.UserProfile.create({
      user_email: user.email,
      profile_type,
      status,
      is_active_profile: isActiveProfile,
      data_json: JSON.stringify(data),
      documents_json: Object.keys(docUrls).length > 0 ? JSON.stringify(docUrls) : null,
      completion_percentage: 100,
      missing_fields: JSON.stringify([]),
      missing_documents: JSON.stringify([]),
      validated_at: requirements.immediate ? new Date().toISOString() : null,
    });
    console.log('[addProfileToUser] UserProfile créé:', createdProfile.id);

    // Mettre à jour User (NE PAS écraser les autres profils)
    console.log('[addProfileToUser] Mise à jour User.profiles_list...');
    console.log('[addProfileToUser] Ancienne liste:', user.profiles_list);
    console.log('[addProfileToUser] Nouvelle liste:', JSON.stringify(userProfiles));
    await base44.auth.updateMe({
      profiles_list: JSON.stringify(userProfiles),
      active_profile_type: isActiveProfile ? profile_type : user.active_profile_type,
    });
    console.log('[addProfileToUser] User mis à jour');

    // Créer le code promo commercial
    if (profile_type === 'commercial') {
      const codeValue = (data.code_promo || '').toUpperCase().trim();
      await base44.entities.CodePromo.create({
        commercial_email: user.email,
        commercial_name: user.full_name,
        code: codeValue,
        statut: 'en_attente',
        actif: false,
        nombre_utilisations: 0,
        commission_due: 0,
        commission_payee: 0,
        statut_paiement: 'À jour',
      });
    }

    // Créer/mettre à jour l'entité associée si nécessaire
    if (profile_type === 'client') {
      const existingClient = await base44.entities.Client.filter({ email: user.email });
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
    console.log('[addProfileToUser] Notification utilisateur...');
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
    console.log('[addProfileToUser] Notification créée');

    // Notifier les admins si validation requise avec données détaillées
    if (requirements.needsAdminValidation) {
      console.log('[addProfileToUser] ← ADMIN NOTIFICATION: Envoi aux admins...');
      const admins = await base44.entities.User.filter({ role: 'admin' });
      console.log('[addProfileToUser] ← ADMIN NOTIFICATION: Nombre admins trouvés:', admins.length);
      if (admins.length === 0) {
        console.warn('[addProfileToUser] ⚠️ ATTENTION: Aucun admin trouvé pour notification!');
      }
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
      console.log('[addProfileToUser] ← COMPTEURS: Invocation recalculateProfileCounters...');
      await base44.asServiceRole.functions.invoke('recalculateProfileCounters', {});
      console.log('[addProfileToUser] ← COMPTEURS: Recalcul SUCCÈS');
    } catch (err) {
      console.warn('[addProfileToUser] Erreur recalcul compteurs (non bloquant):', err.message);
    }

    console.log('[addProfileToUser] ====== SUCCÈS CRÉATION PROFIL ======');
    return Response.json({
      success: true,
      profile: createdProfile,
      status,
      message: status === 'actif' ? 'Profile activated' : 'Profile pending admin validation',
    });
  } catch (error) {
    console.error('[addProfileToUser] ERROR:', error.message);
    console.error('[addProfileToUser] Stack:', error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});