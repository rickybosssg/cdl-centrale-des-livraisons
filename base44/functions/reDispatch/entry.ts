import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Réutilise la même logique en appelant autoDispatch
Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const courseId = body.event?.entity_id || body.course_id;

    if (!courseId) {
      return Response.json({ error: 'course_id manquant' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // Récupérer la course mise à jour
    const courses = await base44.asServiceRole.entities.Course.filter({ id: courseId });
    if (!courses || courses.length === 0) {
      return Response.json({ error: 'Course introuvable' }, { status: 404 });
    }
    const course = courses[0];

    // Enregistrer le refus dans l'historique
    const historique = [];
    if (course.historique_assignation) {
      try { historique.push(...JSON.parse(course.historique_assignation)); } catch (_) {}
    }

    const now = new Date().toISOString();
    // Marquer la dernière entrée comme refusée si livreur assigné
    const derniere = historique[historique.length - 1];
    if (derniere && derniere.statut === 'proposee') {
      derniere.statut = 'refuse';
      derniere.heure_refus = now;
    }

    await base44.asServiceRole.entities.Course.update(courseId, {
      historique_assignation: JSON.stringify(historique),
    });

    // Relancer le dispatch (appel interne)
    const result = await base44.asServiceRole.functions.invoke('autoDispatch', { course_id: courseId });
    console.log(`[REDISPATCH] Résultat pour course ${courseId}:`, result);

    return Response.json({ success: true, redispatch: result });
  } catch (error) {
    console.error('[REDISPATCH] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});