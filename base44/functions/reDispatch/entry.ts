import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Refus livreur (CoursePendante) — aligné sur checkPendingAssignments :
 * historique refuse, décrément nombre_courses_actives, remise en en_attente, autoDispatch.
 * Avant : seul l'historique était mis à jour → autoDispatch refusé (statut assignee_attente non éligible).
 */
Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const courseId = body.event?.entity_id || body.course_id;

    if (!courseId) {
      return Response.json({ error: 'course_id manquant' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    const courses = await base44.asServiceRole.entities.Course.filter({ id: courseId });
    if (!courses || courses.length === 0) {
      return Response.json({ error: 'Course introuvable' }, { status: 404 });
    }
    const course = courses[0];

    if (course.statut !== 'assignee_attente') {
      return Response.json({ success: true, note: 'Statut non concerné', statut: course.statut });
    }

    const configs = await base44.asServiceRole.entities.DispatchConfig.list('-updated_date', 1);
    if (configs[0]?.mode === 'manuel') {
      return Response.json({ success: false, blocked: true, reason: 'mode_manuel' });
    }

    const now = new Date().toISOString();
    let historique: Record<string, unknown>[] = [];
    try {
      if (course.historique_assignation) historique = JSON.parse(course.historique_assignation);
    } catch (_) {}

    const updatedHist = historique.map((h) =>
      h.livreur_email === course.livreur_email && h.statut === 'proposee'
        ? { ...h, statut: 'refuse', heure_refus: now }
        : h,
    );

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

    const MAX_TENTATIVES = course.urgence === 'tres_urgent' ? 5 : 10;
    if ((course.nombre_tentatives || 0) >= MAX_TENTATIVES) {
      await base44.asServiceRole.entities.Course.update(courseId, {
        statut: 'aucun_livreur',
        livreur_email: '',
        livreur_name: '',
        historique_assignation: JSON.stringify(updatedHist),
        dispatch_fail_reason: 'Nombre maximum de tentatives atteint',
      });
      return Response.json({ success: true, maxed: true });
    }

    await base44.asServiceRole.entities.Course.update(courseId, {
      statut: 'en_attente',
      livreur_email: '',
      livreur_name: '',
      telephone_livreur: '',
      heure_assignation: null,
      historique_assignation: JSON.stringify(updatedHist),
    });

    const exclus = updatedHist
      .filter((h) => ['refuse', 'no_response'].includes(String(h.statut)))
      .map((h) => h.livreur_email as string);

    const result = await base44.asServiceRole.functions.invoke('autoDispatch', {
      course_id: courseId,
      exclude_emails: exclus,
      force: true,
    });

    console.log(`[REDISPATCH] Résultat pour course ${courseId}:`, result);

    return Response.json({ success: true, redispatch: result });
  } catch (error) {
    const err = error as Error;
    console.error('[REDISPATCH] Erreur:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});
