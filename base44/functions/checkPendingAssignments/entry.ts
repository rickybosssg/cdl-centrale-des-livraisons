import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Vérifie toutes les 5 minutes les courses bloquées en assignee_attente
// et les réassigne automatiquement si le livreur ne répond pas
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Récupérer toutes les courses en assignee_attente
    const courses = await base44.asServiceRole.entities.Course.filter({ statut: 'assignee_attente' });

    const now = Date.now();
    const TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes sans réponse = timeout

    let reassigned = 0;
    let skipped = 0;

    for (const course of courses) {
      const assignedAt = course.heure_assignation ? new Date(course.heure_assignation).getTime() : 0;
      const elapsed = now - assignedAt;

      if (elapsed < TIMEOUT_MS) {
        skipped++;
        continue;
      }

      console.log(`[CHECK] Course ${course.id} bloquée depuis ${Math.round(elapsed / 60000)} min. Réassignation...`);

      // Marquer le livreur actuel comme sans_reponse dans l'historique
      const historique = [];
      try {
        if (course.historique_assignation) historique.push(...JSON.parse(course.historique_assignation));
      } catch (_) {}

      const updatedHist = historique.map(h =>
        h.livreur_email === course.livreur_email && h.statut === 'proposee'
          ? { ...h, statut: 'no_response', note: 'Timeout automatique' }
          : h
      );

      // Décrémenter le compteur du livreur actuel
      if (course.livreur_email) {
        const drivers = await base44.asServiceRole.entities.User.filter({ email: course.livreur_email });
        if (drivers.length > 0) {
          const driver = drivers[0];
          await base44.asServiceRole.entities.User.update(driver.id, {
            nombre_courses_actives: Math.max(0, (driver.nombre_courses_actives || 0) - 1),
          });
        }
      }

      // Remettre la course en attente
      await base44.asServiceRole.entities.Course.update(course.id, {
        statut: 'en_attente',
        livreur_email: '',
        livreur_name: '',
        historique_assignation: JSON.stringify(updatedHist),
      });

      // Relancer le dispatch
      await base44.asServiceRole.functions.invoke('autoDispatch', { course_id: course.id });
      reassigned++;
    }

    console.log(`[CHECK] ${reassigned} réassignées, ${skipped} encore en attente`);
    return Response.json({ success: true, reassigned, skipped, total: courses.length });

  } catch (error) {
    console.error('[CHECK] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});