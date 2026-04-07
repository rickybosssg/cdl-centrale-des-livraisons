import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { commande_id } = await req.json();

    // ── Vérification STRICTE du mode dispatch ──────────────────────────────
    const configs = await base44.asServiceRole.entities.DispatchConfig.list('-updated_date', 1);
    const config = configs[0];
    console.log(`[autoDispatchMallCourse] MODE ACTIF : ${(config?.mode || 'auto').toUpperCase()}`);
    if (config?.mode === 'manuel') {
      console.log('DISPATCH REFUSÉ – MODE MANUEL ACTIF (autoDispatchMallCourse)');
      return Response.json({ success: false, blocked: true, reason: 'mode_manuel', message: 'Dispatch automatique désactivé — mode manuel actif' });
    }

    // Récupérer la commande
    const commande = await base44.entities.CommandePartenaire.list();
    const cmd = commande.find(c => c.id === commande_id);
    if (!cmd) {
      return Response.json({ error: 'Commande non trouvée' }, { status: 404 });
    }

    // Récupérer les livreurs disponibles (en ligne)
    const livreurs = await base44.entities.User.filter({ 
      user_type: 'livreur',
      disponible: true,
      statut_validation_livreur: 'valide'
    });

    if (!livreurs || livreurs.length === 0) {
      // Aucun livreur disponible - créer alerte admin
      await base44.entities.Notification.create({
        destinataire_email: 'admin@cdl.local',
        destinataire_role: 'admin',
        titre: '⚠️ Aucun livreur pour commande Mall',
        message: `Commande ${cmd.id} (${cmd.partenaire_nom}) sans livreur dispo. Zone : ${cmd.quartier_livraison}`,
        type: 'warning',
        lue: false,
      });
      return Response.json({ 
        success: false, 
        message: 'Aucun livreur disponible - alerte admin envoyée' 
      });
    }

    // Sélectionner le livreur le plus proche ou le premier disponible
    const selectedLivreur = livreurs[0];

    // Créer la Course CDL
    const dateFin = new Date();
    dateFin.setHours(dateFin.getHours() + 2);
    
    const courseRes = await base44.entities.Course.create({
      type_mission: 'envoyer',
      quartier_depart: cmd.partenaire_email, // À améliorer avec address réelle
      quartier_arrivee: cmd.quartier_livraison,
      nom_expediteur: cmd.partenaire_nom,
      telephone_expediteur: 'N/A',
      nom_destinataire: cmd.client_nom,
      telephone_destinataire: cmd.client_telephone,
      type_colis: 'Petit colis',
      description: `Commande Mall : ${cmd.partenaire_nom}`,
      statut: 'assignee_attente',
      mode_paiement: cmd.mode_paiement,
      statut_paiement: cmd.mode_paiement === 'Paiement à la livraison' ? 'paiement_livraison' : 'paye',
      client_email: cmd.client_email,
      client_name: cmd.client_nom,
      livreur_email: selectedLivreur.email,
      livreur_name: selectedLivreur.full_name,
      telephone_livreur: selectedLivreur.telephone,
      prix: cmd.montant_livraison || 2500,
      mode_assignation: 'auto',
      source: 'mall',
    });

    // Lier la commande à la course
    await base44.entities.CommandePartenaire.update(cmd.id, {
      course_id: courseRes.id,
      statut: 'en_livraison',
    });

    // Notifier le livreur
    await base44.entities.Notification.create({
      destinataire_email: selectedLivreur.email,
      destinataire_role: 'livreur',
      titre: '🆕 Nouvelle course assignée',
      message: `Nouvelle livraison : ${cmd.client_nom} à ${cmd.quartier_livraison}. ${(cmd.montant_livraison || 2500).toLocaleString()}F.`,
      type: 'info',
      lue: false,
    });

    return Response.json({ 
      success: true, 
      message: `Course créée et assignée à ${selectedLivreur.full_name}`,
      course_id: courseRes.id,
    });
  } catch (error) {
    console.error('[autoDispatchMallCourse] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});