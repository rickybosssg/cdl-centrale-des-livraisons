/**
 * CDL — reDispatch v4 UNIFIÉ
 *
 * SOURCE UNIQUE : DispatchModeState (suppression de DispatchConfig)
 * VERROU ABSOLU mode=manuel : aucun re-dispatch automatique
 *
 * LOGS :
 *   [DISPATCH_MODE_READ]
 *   [AUTO_DISPATCH_BLOCKED_MANUAL_MODE]
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TAG = 'reDispatch';

function canRefuse(user, livreurEmail) {
  if (!user?.email) return false;
  if (user.email === livreurEmail) return true;
  return user.role === 'admin' || user.role === 'dispatcher';
}

// ── Lecture exclusive DispatchModeState ───────────────────────────────────────
async function readDispatchMode(base44) {
  const rows = await base44.asServiceRole.entities.DispatchModeState.list('-updated_date', 1).catch(() => []);
  const doc = rows[0];
  const mode = doc?.mode === 'manuel' ? 'manuel' : 'auto';
  console.log(`[DISPATCH_MODE_READ] source=DispatchModeState | fn=${TAG} | mode=${mode} | id=${doc?.id || 'none'} | ts=${new Date().toISOString()}`);
  return { mode, configId: doc?.id || null };
}

Deno.serve(async (req) => {
  const ts = new Date().toISOString();
  try {
    const body = await req.json();
    const courseId = body.event?.entity_id || body.course_id;

    if (!courseId) return Response.json({ error: 'course_id manquant' }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.email) return Response.json({ error: 'Authentification requise' }, { status: 401 });

    const courses = await base44.asServiceRole.entities.Course.filter({ id: courseId });
    if (!courses?.length) return Response.json({ error: 'Course introuvable' }, { status: 404 });
    const course = courses[0];

    if (course.statut !== 'assignee_attente') {
      return Response.json({ success: true, note: 'Statut non concerné', statut: course.statut });
    }
    if (!canRefuse(user, course.livreur_email)) {
      return Response.json({ error: 'Non autorisé' }, { status: 403 });
    }

    // ── VERROU ABSOLU ─────────────────────────────────────────────────────────
    const { mode, configId } = await readDispatchMode(base44);
    if (mode === 'manuel') {
      console.log(`[AUTO_DISPATCH_BLOCKED_MANUAL_MODE] fn=${TAG} BLOQUÉ | course=${courseId} | configId=${configId} | ts=${ts}`);
      return Response.json({ success: false, blocked: true, reason: 'manual_mode_active', fn: TAG, ts });
    }

    const now = new Date().toISOString();
    let historique = [];
    try { if (course.historique_assignation) historique = JSON.parse(course.historique_assignation); } catch (_) {}

    const updatedHist = historique.map((h) =>
      h.livreur_email === course.livreur_email && h.statut === 'proposee'
        ? { ...h, statut: 'refuse', heure_refus: now }
        : h,
    );

    if (course.livreur_email) {
      const drivers = await base44.asServiceRole.entities.User.filter({ email: course.livreur_email });
      if (drivers.length > 0) {
        // Recalcul réel depuis BDD — cohérent avec updateCourseDelivered et cancelCourseAction
        const ACTIVE_STATUTS = new Set(['assignee_attente','acceptee','driver_en_route_pickup','arrived_pickup','en_cours','arrived_dropoff']);
        const allCourses = await base44.asServiceRole.entities.Course.filter({ livreur_email: course.livreur_email });
        const realCount = allCourses.filter(x => x.id !== courseId && ACTIVE_STATUTS.has(x.statut) && !x.is_deleted).length;
        await base44.asServiceRole.entities.User.update(drivers[0].id, {
          nombre_courses_actives: realCount,
          courses_refusees_consecutives: (drivers[0].courses_refusees_consecutives || 0) + 1,
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
      return Response.json({ success: true, maxed: true, fn: TAG, ts });
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

    // cdlDispatch (moteur unifié) — jamais force=true
    const result = await base44.asServiceRole.functions.invoke('cdlDispatch', {
      course_id: courseId,
      exclude_emails: exclus,
    });

    console.log(`[DISPATCH_MODE_READ] fn=${TAG} | re-dispatch lancé | course=${courseId} | ts=${ts}`);
    return Response.json({ success: true, redispatch: result, fn: TAG, ts });

  } catch (error) {
    console.error(`[DISPATCH_MODE_READ] fn=${TAG} | error=${error.message} | ts=${new Date().toISOString()}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});