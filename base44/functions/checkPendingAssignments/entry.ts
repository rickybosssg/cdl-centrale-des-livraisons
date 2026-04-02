import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Vérifie toutes les 5 minutes les courses bloquées en assignee_attente
// et les réassigne automatiquement si le livreur ne répond pas
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Récupérer toutes les courses en assignee_attente
    const coursesRaw = await base44.asServiceRole.entities.Course.filter({ statut: 'assignee_attente' });

    // Trier par priorité urgence (tres_urgent > urgent > normal) puis par date
    const URGENCE_SCORE = { tres_urgent: 3, urgent: 2, normal: 1 };
    const courses = [...coursesRaw].sort((a, b) => {
      const ua = URGENCE_SCORE[a.urgence] || 1;
      const ub = URGENCE_SCORE[b.urgence] || 1;
      if (ub !== ua) return ub - ua;
      return new Date(a.created_date) - new Date(b.created_date);
    });

    const now = Date.now();
    // Timeout 60s pour urgent/tres_urgent, 2min pour normal
    const getTimeout = (course) => {
      if (course.urgence === 'tres_urgent') return 60 * 1000;
      if (course.urgence === 'urgent') return 60 * 1000;
      return 2 * 60 * 1000;
    };

    let reassigned = 0;
    let skipped = 0;

    for (const course of courses) {
      const assignedAt = course.heure_assignation ? new Date(course.heure_assignation).getTime() : 0;
      const elapsed = now - assignedAt;

      const TIMEOUT_MS = getTimeout(course);
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

      // Décrémenter le compteur du livreur + mettre à jour métriques d'apprentissage
      if (course.livreur_email) {
        const drivers = await base44.asServiceRole.entities.User.filter({ email: course.livreur_email });
        if (drivers.length > 0) {
          const driver = drivers[0];
          // Temps de non-réponse = temps écoulé depuis assignation (en secondes)
          const tempsNonReponse = Math.round(elapsed / 1000);
          const newMoyenne = driver.temps_reponse_moyen_sec
            ? Math.round((driver.temps_reponse_moyen_sec * 0.8) + (tempsNonReponse * 0.2))
            : tempsNonReponse;
          await base44.asServiceRole.entities.User.update(driver.id, {
            nombre_courses_actives: Math.max(0, (driver.nombre_courses_actives || 0) - 1),
            courses_refusees_consecutives: (driver.courses_refusees_consecutives || 0) + 1,
            temps_reponse_moyen_sec: newMoyenne,
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

      // Alerte admin si trop de tentatives
      const MAX_TENTATIVES = course.urgence === 'tres_urgent' ? 5 : 10;
      if ((course.nombre_tentatives || 0) >= MAX_TENTATIVES) {
        const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
        for (const admin of admins) {
          try {
            await base44.asServiceRole.entities.Notification.create({
              destinataire_email: admin.email,
              destinataire_role: 'admin',
              titre: `⚠️ Course bloquée — ${course.urgence === 'tres_urgent' ? 'TRÈS URGENT' : course.urgence === 'urgent' ? 'URGENT' : 'Normal'}`,
              message: `La course #${course.id?.slice(0,8)} (${course.quartier_depart} → ${course.quartier_arrivee}) a ${course.nombre_tentatives} tentatives sans livreur. Intervention manuelle requise.`,
              type: 'danger',
              lue: false,
            });
          } catch (_) {}
        }
        // Ne pas relancer si dépassement max tentatives — laisser à l'admin
        continue;
      }

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