import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { entity_name, entity_data } = await req.json();

    // Mapper les informations par type
    const getTitle = () => {
      if (entity_name === 'Client') return '🎯 Nouveau client inscrit';
      if (entity_name === 'Livreur') return '🛵 Nouveau livreur en attente de validation';
      if (entity_name === 'Partenaire') return '🏪 Nouveau partenaire';
      if (entity_name === 'CodePromo') return '🎟️ Nouveau code promo créé';
      return 'Nouvelle inscription';
    };

    const getMessage = () => {
      if (entity_name === 'Client') {
        return `${entity_data.nom_complet || 'Client'} s'est inscrit\n📱 ${entity_data.numero_telephone || entity_data.telephone}\n📍 ${entity_data.quartier_principal || entity_data.quartier || 'N/A'}`;
      }
      if (entity_name === 'Livreur') {
        return `${entity_data.nom_complet || entity_data.full_name || 'Livreur'} a soumis son dossier livreur.\n📱 ${entity_data.telephone || 'N/A'}\n📍 ${entity_data.quartier || 'N/A'}\n✉️ ${entity_data.email || 'N/A'}\n👉 Rendez-vous dans Validation Livreurs pour examiner le dossier.`;
      }
      if (entity_name === 'Partenaire') {
        return `${entity_data.nom_commerce || 'Commerce'} s'est inscrit\n📞 ${entity_data.telephone}\n🏷️ ${entity_data.type_commerce}`;
      }
      if (entity_name === 'CodePromo') {
        return `Code: ${entity_data.code}\nCommercial: ${entity_data.commercial_name || 'N/A'}`;
      }
      return JSON.stringify(entity_data);
    };

    // Récupérer tous les admins
    const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });

    // Créer une notification pour chaque admin
    for (const admin of admins) {
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: admin.email,
        destinataire_role: 'admin',
        titre: getTitle(),
        message: getMessage(),
        type: 'success',
        lue: false,
      });
    }

    return Response.json({ success: true, notified: admins.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});