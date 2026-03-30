import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const entity_name = body.entity_name || '';
    const entity_data = body.entity_data || {};

    let titre = 'Nouvelle inscription';
    let message = JSON.stringify(entity_data);

    if (entity_name === 'Client') {
      titre = '🎯 Nouveau client inscrit';
      message = `${entity_data.nom_complet || 'Client'} s'est inscrit\n📱 ${entity_data.telephone || entity_data.numero_telephone || 'N/A'}\n📍 ${entity_data.quartier || entity_data.quartier_principal || 'N/A'}`;
    } else if (entity_name === 'Livreur') {
      titre = '🛵 Nouveau livreur en attente de validation';
      message = `${entity_data.nom_complet || entity_data.full_name || 'Livreur'} a soumis son dossier.\n📱 ${entity_data.telephone || 'N/A'}\n📍 ${entity_data.quartier || 'N/A'}\n👉 Rendez-vous dans Validation Livreurs.`;
    } else if (entity_name === 'Partenaire') {
      titre = '🏪 Nouveau partenaire';
      message = `${entity_data.nom_commerce || 'Commerce'} s'est inscrit\n📞 ${entity_data.telephone || 'N/A'}\n🏷️ ${entity_data.type_commerce || 'N/A'}`;
    } else if (entity_name === 'CodePromo') {
      titre = '🎟️ Nouveau code promo créé';
      message = `Code: ${entity_data.code || 'N/A'}\nCommercial: ${entity_data.commercial_name || 'N/A'}`;
    }

    // Récupérer tous les admins
    const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });

    // Créer une notification pour chaque admin
    for (const admin of admins) {
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: admin.email,
        destinataire_role: 'admin',
        titre: titre,
        message: message,
        type: 'success',
        lue: false,
      });
    }

    return Response.json({ success: true, notified: admins.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});