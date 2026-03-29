import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Déclenché par automation entity sur Course (event: create)
// Notifie tous les livreurs disponibles + validés qu'une nouvelle course est dispo
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const course = body.data;

    if (!course || course.statut !== 'en_attente') {
      return Response.json({ skipped: true });
    }

    // Récupérer les livreurs disponibles et validés
    const livreurs = await base44.asServiceRole.entities.User.filter({
      disponible: true,
      statut_validation_livreur: 'valide',
    });

    const notifPromises = livreurs.map(livreur =>
      base44.asServiceRole.entities.Notification.create({
        destinataire_email: livreur.email,
        destinataire_role: 'livreur',
        titre: '🛵 Nouvelle course disponible !',
        message: `De ${course.quartier_depart} → ${course.quartier_arrivee} · ${course.type_colis}${course.prix ? ` · ${course.prix} FCFA` : ''}`,
        type: 'success',
        lue: false,
        course_id: course.id,
      })
    );

    await Promise.all(notifPromises);
    return Response.json({ notified: livreurs.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});