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
    fields: ['telephone', 'quartier'],
    documents: [],
    needsAdminValidation: true,
    optionalDocuments: ['photo_profil', 'photo_identite_recto', 'photo_identite_verso', 'photo_moyen_deplacement'],
  },
  partenaire: {
    immediate: false,
    fields: ['nom_commerce', 'type_commerce', 'telephone', 'adresse'],
    documents: ['logo', 'photo_principale'],
    needsAdminValidation: true,
  },
  commercial: {
    immediate: false,
    fields: ['telephone', 'quartier'],
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

    // VALIDATION: Vérifier les champs requis
    const missingFields = requirements.fields.filter(f => !data[f]);
    console.log('[addProfileToUser] Champs manquants:', missingFields);

    // 🔴 DURCI : Téléphone obligatoire pour TOUS
    if (!data.telephone || !data.telephone.trim()) {
      console.log('[addProfileToUser] ERROR: Téléphone manquant ou vide');
      return Response.json({
        error: 'Phone number is mandatory for all profiles',
        code: 'PHONE_REQUIRED',
      }, { status: 400 });
    }

    // ❌ Refuser si champs obligatoires manquent
    if (missingFields.length > 0) {
      return Response.json({
        error: 'Incomplete profile: missing required fields',
        missingFields,
        requiredFields: requirements.fields,
      }, { status: 400 });
    }

    // Vérifier les documents (optionnels pour livreur à ce stade)
    const allDocKeys = [...requirements.documents, ...(requirements.optionalDocuments || [])];
    const missingDocuments = allDocKeys.filter(docKey => !data[docKey]);

    // Pour commercial : générer code unique automatiquement
    let generatedCode = null;
    if (profile_type === 'commercial') {
      // Générer un code unique : CDL + 5 chiffres aléatoires
      let codeAttempts = 0;
      while (!generatedCode && codeAttempts < 10) {
        const randomNum = Math.floor(Math.random() * 99999).toString().padStart(5, '0');
        const candidate = `CDL${randomNum}`;
        const existing = await base44.entities.CodePromo.filter({ code: candidate });
        if (!existing || existing.length === 0) {
          generatedCode = candidate;
        }
        codeAttempts++;
      }
      if (!generatedCode) {
        return Response.json({ error: 'Impossible de générer un code promo unique' }, { status: 500 });
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

    // Pour livreur sans docs → statut incomplet, sinon en_attente
    const livreurHasDocs = profile_type === 'livreur' && allDocKeys.every(k => data[k]);
    const statusForNonClient = livreurHasDocs ? 'en_attente' : (profile_type === 'livreur' ? 'incomplet' : 'en_attente');
    const finalStatus = profile_type === 'client' ? 'actif' : statusForNonClient;
    // Seul client peut être actif immédiatement.
    const isActiveProfile = profile_type === 'client' && !user.active_profile_type;

    console.log('[addProfileToUser] Création UserProfile...');
    // Extraire les URLs des documents pour tous les profils
    const docUrls = {};
    allDocKeys.forEach(docKey => {
      if (data[docKey]) docUrls[docKey] = data[docKey];
    });

    const createdProfile = await base44.entities.UserProfile.create({
      user_email: user.email,
      profile_type,
      status: finalStatus,
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
    const updateData = {
      profiles_list: JSON.stringify(userProfiles),
      active_profile_type: isActiveProfile ? profile_type : user.active_profile_type,
    };
    // Synchroniser le téléphone dans User s'il n'existe pas
    if (data.telephone && !user.telephone) {
      updateData.telephone = data.telephone;
    }
    await base44.auth.updateMe(updateData);
    console.log('[addProfileToUser] User mis à jour');

    // Créer le code promo commercial (auto-généré)
    if (profile_type === 'commercial' && generatedCode) {
      await base44.entities.CodePromo.create({
        commercial_email: user.email,
        commercial_name: user.full_name,
        code: generatedCode,
        statut: 'en_attente',
        actif: false,
        nombre_utilisations: 0,
        nombre_validations: 0,
        commission_due: 0,
        commission_payee: 0,
        statut_paiement: 'À jour',
      });
      console.log('[addProfileToUser] CodePromo créé:', generatedCode);
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
      titre: finalStatus === 'actif' 
        ? `✅ ${roleEmojis[profile_type] || ''} ${roleNames[profile_type] || profile_type} activé`
        : finalStatus === 'incomplet'
        ? `📋 ${roleEmojis[profile_type] || ''} Profil ${roleNames[profile_type] || profile_type} — documents requis`
        : `⏳ ${roleEmojis[profile_type] || ''} Demande en attente de validation`,
      message: finalStatus === 'actif'
        ? `Votre profil ${roleNames[profile_type] || profile_type} CDL a été activé avec succès. Bienvenue!`
        : finalStatus === 'incomplet'
        ? `Envoyez vos documents pour activer votre profil ${roleNames[profile_type] || profile_type}.`
        : `Votre demande de profil ${roleNames[profile_type] || profile_type} CDL est en attente de validation par l'équipe CDL.`,
      type: finalStatus === 'actif' ? 'success' : 'warning',
      lue: false,
    });
    console.log('[addProfileToUser] Notification créée');

    // Notifier les admins si validation requise (seulement si en_attente, pas incomplet)
    if (requirements.needsAdminValidation && finalStatus === 'en_attente') {
      console.log('[addProfileToUser] ← ADMIN NOTIFICATION: Envoi aux admins...');
      const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
      console.log('[addProfileToUser] ← ADMIN NOTIFICATION: Nombre admins trouvés:', admins.length);
      if (admins.length === 0) {
        console.warn('[addProfileToUser] ⚠️ ATTENTION: Aucun admin trouvé pour notification!');
      }
      let adminMessage = `Nom: ${user.full_name} | Email: ${user.email} | Téléphone: ${data.telephone || 'N/A'}`;
      
      if (profile_type === 'partenaire') {
        adminMessage = `Commerce: ${data.nom_commerce || 'N/A'} | Catégorie: ${data.type_commerce || 'N/A'} | Tél: ${data.telephone || 'N/A'} | Adresse: ${data.adresse || 'N/A'}`;
      } else if (profile_type === 'livreur' || profile_type === 'annonceur') {
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

    // ──────────────────────────────────────────────────────────────────────
    // CRÉATION CROISÉE AUTOMATIQUE : Client ↔ Commercial
    // ──────────────────────────────────────────────────────────────────────
    let autoPairedProfile = null;
    const PAIR_MAP = { client: 'commercial', commercial: 'client' };
    const pairedType = PAIR_MAP[profile_type];

    if (pairedType) {
      // Vérifier si le profil jumeau existe déjà
      const existingPair = await base44.entities.UserProfile.filter({
        user_email: user.email,
        profile_type: pairedType,
        deleted: false,
      });

      if (existingPair.length === 0) {
        console.log('[addProfileToUser] AUTO-PAIR: Création automatique du profil', pairedType);

        let pairCode = null;

        // Générer le code promo si le profil paired est commercial
        if (pairedType === 'commercial') {
          const baseName = (user.full_name || 'CDL').replace(/\s+/g, '').toUpperCase().slice(0, 4);
          let attempts = 0;
          while (!pairCode && attempts < 15) {
            const rand = Math.floor(100 + Math.random() * 9900).toString();
            const candidate = `${baseName}${rand}`.slice(0, 10);
            const existing = await base44.entities.CodePromo.filter({ code: candidate });
            if (!existing || existing.length === 0) pairCode = candidate;
            attempts++;
          }
          if (!pairCode) {
            // Fallback garanti unique
            pairCode = 'CDL' + Date.now().toString().slice(-6);
          }
        }

        // Statut : client = actif immédiat, commercial = en_attente
        const pairStatus = pairedType === 'client' ? 'actif' : 'en_attente';
        const pairData = {
          telephone: data.telephone || user.telephone || '',
          quartier: data.quartier || '',
          email: user.email,
          full_name: user.full_name,
          auto_created: true,
        };

        autoPairedProfile = await base44.entities.UserProfile.create({
          user_email: user.email,
          profile_type: pairedType,
          status: pairStatus,
          is_active_profile: false,
          data_json: JSON.stringify(pairData),
          documents_json: null,
          completion_percentage: pairedType === 'client' ? 100 : 60,
          missing_fields: JSON.stringify([]),
          missing_documents: JSON.stringify([]),
          validated_at: pairedType === 'client' ? new Date().toISOString() : null,
        });
        console.log('[addProfileToUser] AUTO-PAIR: Profil créé:', autoPairedProfile.id);

        // Mettre à jour la liste des profils
        const updatedProfilesList = userProfiles.includes(pairedType) ? userProfiles : [...userProfiles, pairedType];
        await base44.auth.updateMe({ profiles_list: JSON.stringify(updatedProfilesList) });

        // Créer le CodePromo si commercial auto-créé
        if (pairedType === 'commercial' && pairCode) {
          await base44.entities.CodePromo.create({
            commercial_email: user.email,
            commercial_name: user.full_name,
            code: pairCode,
            statut: 'en_attente',
            actif: false,
            nombre_utilisations: 0,
            nombre_validations: 0,
            commission_due: 0,
            commission_payee: 0,
            statut_paiement: 'À jour',
            auto_generated: true,
          });
          console.log('[addProfileToUser] AUTO-PAIR: CodePromo créé:', pairCode);
        }

        // Créer l'entité Client si client auto-créé
        if (pairedType === 'client') {
          const existingClient = await base44.entities.Client.filter({ email: user.email });
          if (existingClient.length === 0) {
            await base44.entities.Client.create({
              nom_complet: user.full_name,
              numero_telephone: data.telephone || user.telephone || '',
              email: user.email,
              quartier_principal: data.quartier || '',
              date_inscription: new Date().toISOString(),
              statut_client: 'Nouveau',
            });
          }
        }

        // Notification utilisateur — profil jumeau créé
        const pairEmoji = { client: '👤', commercial: '📣' };
        const pairLabel = { client: 'Client', commercial: 'Commercial' };
        await base44.entities.Notification.create({
          destinataire_email: user.email,
          destinataire_role: pairedType,
          titre: `🎉 Profil ${pairLabel[pairedType]} activé automatiquement`,
          message: pairedType === 'commercial'
            ? `Votre profil Commercial CDL a été activé automatiquement. Votre code promo ${pairCode} est prêt à être partagé pour gagner de l'argent.`
            : `Votre profil Client CDL a été activé automatiquement. Vous pouvez maintenant commander des livraisons.`,
          type: 'success',
          lue: false,
        });

        // Notification admin — création auto
        const adminsForPair = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
        await Promise.all(adminsForPair.map(admin =>
          base44.entities.Notification.create({
            destinataire_email: admin.email,
            destinataire_role: 'admin',
            titre: `🔗 Profil ${pairLabel[pairedType]} créé automatiquement`,
            message: `Compte: ${user.full_name} (${user.email})\nProfil principal créé: ${profile_type}\nProfil auto-créé: ${pairedType}${pairCode ? '\nCode promo: ' + pairCode : ''}\nSource: auto profile pairing`,
            type: 'info',
            lue: false,
            target_entity_id: user.id || user.email,
            target_entity_type: 'profil',
          })
        ));

        // Log traçabilité
        try {
          await base44.entities.AdminActionLog.create({
            admin_email: 'system',
            action: 'auto_profile_pairing',
            entity_type: 'UserProfile',
            entity_id: autoPairedProfile.id,
            details: JSON.stringify({
              user_email: user.email,
              primary_profile: profile_type,
              auto_created_profile: pairedType,
              promo_code: pairCode || null,
              source: 'auto profile pairing',
            }),
          });
        } catch (_) {}

        console.log('[addProfileToUser] AUTO-PAIR: Terminé avec succès');
      } else {
        console.log('[addProfileToUser] AUTO-PAIR: Profil', pairedType, 'existe déjà → pas de création');
      }
    }
    // ──────────────────────────────────────────────────────────────────────

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
      auto_paired: autoPairedProfile ? { type: PAIR_MAP[profile_type], id: autoPairedProfile.id } : null,
      status,
      message: status === 'actif' ? 'Profile activated' : 'Profile pending admin validation',
    });
  } catch (error) {
    console.error('[addProfileToUser] ERROR:', error.message);
    console.error('[addProfileToUser] Stack:', error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});