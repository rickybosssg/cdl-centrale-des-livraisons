import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * processFirstCourse — ROUTEUR SETTLEMENT v2
 *
 * SOURCE UNIQUE : toutes les opérations Bedou passent par bedouEngine (action finaliser_course).
 * Ce fichier ne modifie JAMAIS directement l'entité Bedou.
 *
 * Rôle de ce fichier :
 * 1. Vérifier si première course (code promo → bonus commercial via bedouEngine.bonus_commercial)
 * 2. Router le settlement vers bedouEngine.finaliser_course (anti-doublon settlement_status)
 * 3. Mettre à jour les compteurs Client uniquement
 *
 * [FIRST_COURSE_ROUTE] → bedouEngine.finaliser_course → [SETTLEMENT_COMPLETED]
 */

const L = (msg) => console.log(`[processFirstCourse] ${new Date().toISOString()} | ${msg}`);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { course_id, action } = await req.json();
    if (!course_id || !action) {
      return Response.json({ error: 'course_id and action required' }, { status: 400 });
    }

    L(`action=${action} | course=${course_id}`);

    // ── Charger la course ──────────────────────────────────────────────────────
    const coursesData = await base44.asServiceRole.entities.Course.filter({ id: course_id });
    if (coursesData.length === 0) return Response.json({ error: 'Course not found' }, { status: 404 });
    const course = coursesData[0];

    // ── Anti-doublon settlement_status ────────────────────────────────────────
    if (course.settlement_status === 'completed') {
      L(`SKIP — settlement_status=completed`);
      return Response.json({ success: true, alreadyDone: true, source: 'settlement_status_check' });
    }

    // ── Charger/créer client ───────────────────────────────────────────────────
    const clientsData = await base44.asServiceRole.entities.Client.filter({ email: course.client_email });
    const client = clientsData[0] || null;
    let clientId = client?.id;
    if (!client) {
      const newClient = await base44.asServiceRole.entities.Client.create({
        email: course.client_email,
        nom_complet: course.client_name,
        numero_telephone: course.telephone_expediteur,
        nombre_total_courses: 0,
        nombre_courses_terminees: 0,
        premiere_course_effectuee: false,
        statut_client: 'Nouveau',
      });
      clientId = newClient.id;
    }

    // ── Détecter première course ───────────────────────────────────────────────
    const completedCourses = await base44.asServiceRole.entities.Course.filter({
      client_email: course.client_email,
      statut: 'livree',
    });
    const isFirstCompletedCourse = completedCourses.length === 1 && completedCourses[0].id === course_id;
    L(`isFirst=${isFirstCompletedCourse} | completed=${completedCourses.length}`);

    if (!['validate_first_course', 'validate_normal_course'].includes(action)) {
      return Response.json({ error: 'Invalid action' }, { status: 400 });
    }

    if (action === 'validate_first_course' && !isFirstCompletedCourse) {
      return Response.json({ error: 'Not the first course' }, { status: 400 });
    }
    if (action === 'validate_normal_course' && isFirstCompletedCourse) {
      return Response.json({ error: 'Should use first course logic' }, { status: 400 });
    }

    // ── SETTLEMENT via bedouEngine (SOURCE UNIQUE) ────────────────────────────
    // Anti-doublon garanti par bedouEngine.finaliser_course (settlement_status + Transaction check)
    L(`→ bedouEngine.finaliser_course | montant=${course.prix}`);
    console.log(`[FIRST_COURSE_ROUTE] course_id=${course_id} | action=${action} | isFirst=${isFirstCompletedCourse} | → bedouEngine.finaliser_course`);

    const settlementRes = await base44.asServiceRole.functions.invoke('bedouEngine', {
      action: 'finaliser_course',
      course_id,
      client_email: course.client_email,
      client_nom: course.client_name,
      livreur_email: course.livreur_email,
      livreur_nom: course.livreur_name,
      montant: course.prix,
    });

    const settlementData = settlementRes?.data || {};
    L(`bedouEngine.finaliser_course → success=${settlementData.success} alreadyDone=${settlementData.alreadyDone}`);

    if (!settlementData.success && !settlementData.alreadyDone) {
      L(`SETTLEMENT FAILED: ${settlementData.error || 'unknown'}`);
      return Response.json({ success: false, error: settlementData.error || 'Settlement failed' }, { status: 500 });
    }

    // ── Bonus commercial si première course + code promo (via bedouEngine) ────
    if (isFirstCompletedCourse) {
      L(`→ bedouEngine.bonus_commercial`);
      base44.asServiceRole.functions.invoke('bedouEngine', {
        action: 'bonus_commercial',
        client_email: course.client_email,
        course_id,
      }).catch(e => L(`bonus_commercial non-bloquant: ${e.message}`));
    }

    // ── Mettre à jour compteurs Client uniquement ─────────────────────────────
    try {
      const isFirst = isFirstCompletedCourse;
      await base44.asServiceRole.entities.Client.update(clientId, {
        nombre_total_courses: (client?.nombre_total_courses || 0) + 1,
        nombre_courses_terminees: (client?.nombre_courses_terminees || 0) + 1,
        total_depense: (client?.total_depense || 0) + (course.prix || 0),
        ...(isFirst ? { date_premiere_course: new Date().toISOString(), premiere_course_effectuee: true, statut_client: 'Actif' } : {}),
        ...(!isFirst ? { date_derniere_course: new Date().toISOString(), statut_client: (client?.nombre_courses_terminees || 0) >= 5 ? 'Fidèle' : 'Actif' } : {}),
      });
    } catch (e) {
      L(`Client update non-bloquant: ${e.message}`);
    }

    L(`DONE | gainLivreur=${settlementData.gainLivreur} | commissionCdl=${settlementData.commissionCdl}`);
    return Response.json({
      success: true,
      message: isFirstCompletedCourse ? 'Première course validée' : 'Course normale validée',
      source: 'bedouEngine.finaliser_course',
      data: {
        isFirstCourse: isFirstCompletedCourse,
        gainLivreur: settlementData.gainLivreur,
        commissionCdl: settlementData.commissionCdl,
        alreadyDone: settlementData.alreadyDone || false,
      },
    });

  } catch (error) {
    console.error('[processFirstCourse] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});