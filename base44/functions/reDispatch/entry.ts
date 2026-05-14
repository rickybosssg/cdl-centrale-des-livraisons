/**
 * reDispatch — Refus livreur → reset course → autoDispatch
 *
 * VERROU MANUEL ABSOLU :
 *   Si mode GLOBAL = "manuel" → BLOQUÉ. Aucun re-dispatch automatique.
 *   Aucun fallback vers 'auto'.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CANONICAL_KEY = 'GLOBAL';

function canRefuseAssignedCourse(user, livreurEmail) {
  if (!user?.email) return false;
  if (user.email === livreurEmail) return true;
  return user.role === 'admin' || user.role === 'dispatcher' || user.user_type === 'admin';
}

async function getCanonicalMode(base44) {
  const allConfigs = await base44.asServiceRole.entities.DispatchConfig.list('-updated_date', 50).catch(() => []);
  const canonical = allConfigs.find(c => c.mode_key === CANONICAL_KEY);
  const mode = canonical?.mode === 'manuel' ? 'manuel' : canonical?.mode === 'auto' ? 'auto' : null;
  console.log(`[DISPATCH_CANONICAL_READ] reDispatch | CANONICAL=${!!canonical} | mode=${mode} | id=${canonical?.id || 'none'}`);
  return { mode, configId: canonical?.id || null };
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const courseId = body.event?.entity_id || body.course_id;

    if (!courseId) {
      return Response.json({ error: 'course_id manquant' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.email) {
      return Response.json({ error: 'Authentification requise' }, { status: 401 });
    }

    const courses = await base44.asServiceRole.entities.Course.filter({ id: courseId });
    if (!courses || courses.length === 0) {
      return Response.json({ error: 'Course introuvable' }, { status: 404 });
    }
    const course = courses[0];

    if (course.statut !== 'assignee_attente') {
      return Response.json({ success: true, note: 'Statut non concerné', statut: course.statut });
    }

    if (!canRefuseAssignedCourse(user, course.livreur_email)) {
      return Response.json({ error: 'Non autorisé' }, { status: 403 });
    }

    // ── VERROU CANONIQUE ABSOLU — AUCUN FALLBACK VERS AUTO ───────────────────
    const { mode, configId } = await getCanonicalMode(base44);

    if (mode === null) {
      console.error(`[AUTO_DISPATCH_BLOCKED_MANUAL_MODE] reDispatch BLOQUÉ — aucun doc GLOBAL | course=${courseId} | function=reDispatch`);
      return Response.json({ success: false, blocked: true, reason: 'no_canonical_config' });
    }

    if (mode === 'manuel') {
      console.log(`[AUTO_DISPATCH_BLOCKED_MANUAL_MODE] BLOQUÉ — mode=manuel | course=${courseId} | configId=${configId} | function=reDispatch`);
      console.log(`[MANUAL_MODE_PROTECTED] reDispatch bloqué par verrou manuel | course=${courseId}`);
      return Response.json({ success: false, blocked: true, reason: 'manual_mode_active' });
    }

    const now = new Date().toISOString();
    let historique = [];
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
      .map((h) => h.livreur_email);

    // autoDispatch vérifiera lui-même le mode canonique
    const result = await base44.asServiceRole.functions.invoke('autoDispatch', {
      course_id: courseId,
      exclude_emails: exclus,
      force: true,
    });

    console.log(`[REDISPATCH] Résultat pour course ${courseId}:`, result);
    return Response.json({ success: true, redispatch: result });

  } catch (error) {
    console.error('[REDISPATCH] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});