import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Déclenché par automation entity sur Course (event: update, statut = livree)
// Notifie tous les admins qu'une livraison est complétée
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const course = body.data;
    const oldCourse = body.old_data;

    // Ne traiter que si le statut vient de changer vers "livree"
    if (!course || course.statut !== 'livree' || oldCourse?.statut === 'livree') {
      return Response.json({ skipped: true });
    }

    // Récupérer tous les admins
    const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });

    const notifPromises = admins.map(admin =>
      base44.asServiceRole.entities.Notification.create({
        destinataire_email: admin.email,
        destinataire_role: 'admin',
        titre: '✅ Livraison complétée',
        message: `${course.quartier_depart} → ${course.quartier_arrivee}${course.livreur_name ? ` · Livreur: ${course.livreur_name}` : ''}${course.prix ? ` · ${course.prix} FCFA` : ''}`,
        type: 'success',
        lue: false,
        course_id: course.id,
      })
    );

    await Promise.all(notifPromises);
    return Response.json({ notified: admins.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});