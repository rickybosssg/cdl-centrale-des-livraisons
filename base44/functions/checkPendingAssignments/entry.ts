/**
 * CDL — Vérification des assignations en attente (timeout 60s)
 *
 * Tournée toutes les 5 minutes (automation schedulée).
 * Pour chaque course en statut "assignee_attente" depuis plus de 60s :
 *   1. Vérifier que le livreur est toujours valide
 *   2. Si invalide ou timeout → marquer no_response, passer au suivant
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const TIMEOUT_MS = 60 * 1000; // 60 secondes

function isDriverStillValid(driver) {
  return (
    driver.driver_online === true &&
    driver.current_role === 'livreur' &&
    driver.profil_valide === true &&
    !driver.livreur_bloque &&
    (driver.nombre_courses_actives || 0) < 2
  );
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Vérifier le mode dispatch
    const configs = await base44.asServiceRole.entities.DispatchConfig.list('-updated_date', 1);
    const config = configs[0];
    if (config?.mode === 'manuel') {
      console.log('[CHECK] Mode manuel — skip');
      return Response.json({ success: true, blocked: true, reason: 'mode_manuel', reassigned: 0, skipped: 0 });
    }

    const coursesRaw = await base44.asServiceRole.entities.Course.filter({ statut: 'assignee_attente' });

    // Trier par urgence puis date
    const URGENCE_SCORE = { tres_urgent: 3, urgent: 2, normal: 1 };
    const courses = [...coursesRaw].sort((a, b) => {
      const diff = (URGENCE_SCORE[b.urgence] || 1) - (URGENCE_SCORE[a.urgence] || 1);
      return diff !== 0 ? diff : new Date(a.created_date) - new Date(b.created_date);
    });

    const now = Date.now();
    let reassigned = 0;
    let skipped = 0;

    for (const course of courses) {
      const assignedAt = course.heure_assignation ? new Date(course.heure_assignation).getTime() : 0;
      const elapsed = now - assignedAt;

      // Vérifier si le livreur actuel est toujours valide (sécurité pendant les 60s)
      let livreurInvalide = false;
      if (course.livreur_email) {
        const drivers = await base44.asServiceRole.entities.User.filter({ email: course.livreur_email });
        if (drivers.length > 0 && !isDriverStillValid(drivers[0])) {
          livreurInvalide = true;
          console.log(`[CHECK] Livreur ${course.livreur_email} invalide pendant attente — passage au suivant`);
        }
      }

      if (!livreurInvalide && elapsed < TIMEOUT_MS) {
        skipped++;
        continue;
      }

      console.log(`[CHECK] Course ${course.id} — ${livreurInvalide ? 'livreur invalide' : `timeout (${Math.round(elapsed / 1000)}s)`}`);

      // Mettre à jour l'historique
      let historique = [];
      try {
        if (course.historique_assignation) historique = JSON.parse(course.historique_assignation);
      } catch (_) {}

      const updatedHist = historique.map(h =>
        h.livreur_email === course.livreur_email && h.statut === 'proposee'
          ? { ...h, statut: 'no_response', note: livreurInvalide ? 'Livreur devenu invalide' : 'Timeout 60s' }
          : h
      );

      // Mettre à jour les métriques du livreur
      if (course.livreur_email) {
        const drivers = await base44.asServiceRole.entities.User.filter({ email: course.livreur_email });
        if (drivers.length > 0) {
          const driver = drivers[0];
          await base44.asServiceRole.entities.User.update(driver.id, {
            nombre_courses_actives: Math.max(0, (driver.nombre_courses_actives || 0) - 1),
            courses_refusees_consecutives: (driver.courses_refusees_consecutives || 0) + 1,
          }).catch(() => {});
        }
      }

      // Vérifier le seuil max tentatives
      const MAX_TENTATIVES = course.urgence === 'tres_urgent' ? 5 : 10;
      if ((course.nombre_tentatives || 0) >= MAX_TENTATIVES) {
        await base44.asServiceRole.entities.Course.update(course.id, {
          statut: 'aucun_livreur',
          livreur_email: '',
          livreur_name: '',
          historique_assignation: JSON.stringify(updatedHist),
          dispatch_fail_reason: 'Nombre maximum de tentatives atteint',
        });
        // Alerter les admins
        const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
        for (const admin of admins.slice(0, 3)) {
          await base44.asServiceRole.entities.Notification.create({
            destinataire_email: admin.email,
            destinataire_role: 'admin',
            titre: `⚠️ Course bloquée — ${course.nombre_tentatives} tentatives`,
            message: `Course ${course.quartier_depart}→${course.quartier_arrivee} sans livreur après ${course.nombre_tentatives} tentatives. Intervention manuelle requise.`,
            type: 'danger',
            lue: false,
            course_id: course.id,
            target_screen: '/dispatch-monitor',
          }).catch(() => {});
        }
        continue;
      }

      // Remettre la course en attente et relancer
      await base44.asServiceRole.entities.Course.update(course.id, {
        statut: 'en_attente',
        livreur_email: '',
        livreur_name: '',
        historique_assignation: JSON.stringify(updatedHist),
      });

      // Relancer le dispatch en excluant les livreurs déjà contactés
      const exclus = updatedHist
        .filter(h => ['refuse', 'no_response'].includes(h.statut))
        .map(h => h.livreur_email);

      await base44.asServiceRole.functions.invoke('autoDispatch', {
        course_id: course.id,
        exclude_emails: exclus,
      });
      reassigned++;
    }

    console.log(`[CHECK] ${reassigned} réassignées, ${skipped} encore en attente`);
    return Response.json({ success: true, reassigned, skipped, total: courses.length });

  } catch (error) {
    console.error('[CHECK] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});