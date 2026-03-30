import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const entity_name = body.entity_name || '';
    const entity_data = body.entity_data || {};

    let titre = '';
    let message = '';
    let notificationType = 'info';

    if (entity_name === 'Client') {
      const name = entity_data.nom_complet || entity_data.full_name || 'Client';
      const phone = entity_data.telephone || entity_data.numero_telephone || 'N/A';
      const zone = entity_data.quartier || entity_data.quartier_principal || 'N/A';
      
      // Only create if we have at least name and phone
      if (!name || phone === 'N/A') return Response.json({ skipped: true });
      
      titre = '👤 Nouveau client inscrit';
      message = `Nom: ${name} | Téléphone: ${phone} | Zone: ${zone}`;
      notificationType = 'info';
    } else if (entity_name === 'Livreur') {
      const name = entity_data.nom_complet || entity_data.full_name || 'Livreur';
      const phone = entity_data.telephone || 'N/A';
      const zone = entity_data.quartier || 'N/A';
      
      if (!name || phone === 'N/A') return Response.json({ skipped: true });
      
      titre = '🛵 Nouveau livreur inscrit';
      message = `Nom: ${name} | Téléphone: ${phone} | Zone: ${zone} | Statut: en attente de validation`;
      notificationType = 'info';
    } else if (entity_name === 'Partenaire') {
      const commerce = entity_data.nom_commerce || entity_data.full_name || 'Commerce';
      const type = entity_data.type_commerce || 'N/A';
      const phone = entity_data.telephone || 'N/A';
      const zone = entity_data.quartier || entity_data.quartier || 'N/A';
      
      if (!commerce || phone === 'N/A') return Response.json({ skipped: true });
      
      titre = '🏪 Nouveau partenaire inscrit';
      message = `Commerce: ${commerce} | Catégorie: ${type} | Téléphone: ${phone} | Zone: ${zone}`;
      notificationType = 'info';
    } else if (entity_name === 'CodePromo') {
      const name = entity_data.full_name || 'Commercial';
      const phone = entity_data.telephone || 'N/A';
      const zone = entity_data.quartier || 'N/A';
      
      if (!name || phone === 'N/A') return Response.json({ skipped: true });
      
      titre = '📣 Nouveau commercial inscrit';
      message = `Nom: ${name} | Téléphone: ${phone} | Zone: ${zone}`;
      notificationType = 'info';
    } else {
      return Response.json({ skipped: true });
    }

    // Récupérer tous les admins
    const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });

    // Créer une notification pour chaque admin (only if we have valid data)
    if (titre && message) {
      for (const admin of admins) {
        await base44.asServiceRole.entities.Notification.create({
          destinataire_email: admin.email,
          destinataire_role: 'admin',
          titre: titre,
          message: message,
          type: notificationType,
          lue: false,
        });
      }
    }

    return Response.json({ success: true, notified: admins.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});