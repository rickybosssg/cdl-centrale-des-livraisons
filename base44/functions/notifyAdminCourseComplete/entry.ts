import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Appelé par automation entity sur Course (update) quand statut = "livree"
Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const base44 = createClientFromRequest(req);

    const courseId = body.event?.entity_id || body.course_id;
    const courseData = body.data;

    if (!courseId || !courseData) {
      return Response.json({ error: 'Données manquantes' }, { status: 400 });
    }

    // Récupérer tous les admins
    const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });

    const msg = `Livraison terminée : ${courseData.quartier_depart || '?'} → ${courseData.quartier_arrivee || '?'}. Livreur: ${courseData.livreur_name || '?'}. Montant: ${courseData.prix || '?'} FCFA.`;

    await Promise.all(admins.map(admin =>
      base44.asServiceRole.entities.Notification.create({
        destinataire_email: admin.email,
        destinataire_role: 'admin',
        titre: '✅ Livraison complétée',
        message: msg,
        type: 'success',
        lue: false,
        course_id: courseId,
      })
    ));

    console.log(`[NOTIFY_ADMIN] Course ${courseId} livrée — ${admins.length} admin(s) notifié(s)`);
    return Response.json({ success: true, admins_notifies: admins.length });

  } catch (error) {
    console.error('[NOTIFY_ADMIN] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});