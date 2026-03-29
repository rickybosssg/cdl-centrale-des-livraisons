import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Récupérer tous les livreurs en attente de validation
    const livreurs = await base44.asServiceRole.entities.User.filter({
      user_type: 'livreur',
      statut_validation_livreur: 'en_attente',
    });

    // Récupérer tous les admins
    const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });

    let created = 0;
    for (const livreur of livreurs) {
      // Vérifier si une notification existe déjà pour ce livreur
      const existingNotifs = await base44.asServiceRole.entities.Notification.filter({
        destinataire_role: 'admin',
        titre: '🛵 Livreur en attente de validation',
      });

      const alreadyNotified = existingNotifs.some(n => n.message?.includes(livreur.email));

      if (!alreadyNotified) {
        for (const admin of admins) {
          await base44.asServiceRole.entities.Notification.create({
            destinataire_email: admin.email,
            destinataire_role: 'admin',
            titre: '🛵 Livreur en attente de validation',
            message: `${livreur.full_name || 'Livreur'} attend la validation de son profil.\n📱 ${livreur.telephone || 'N/A'}\n📍 ${livreur.quartier || 'N/A'}\n✉️ ${livreur.email}\n👉 Rendez-vous dans Validation Livreurs.`,
            type: 'warning',
            lue: false,
          });
          created++;
        }
      }
    }

    return Response.json({ success: true, livreurs_en_attente: livreurs.length, notifications_creees: created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});