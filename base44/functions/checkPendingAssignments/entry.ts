/**
 * CDL — checkPendingAssignments v4 UNIFIÉ
 *
 * SOURCE UNIQUE : DispatchModeState
 * CRITÈRES LIVREUR : isDriverEligible() — identiques à autoDispatch/createSmartDispatch
 * VERROU ABSOLU mode=manuel : aucune réassignation automatique, même avec force_immediate
 *
 * Déclenché : automation scheduled toutes les 5 minutes
 *
 * LOGS :
 *   [DISPATCH_MODE_READ]
 *   [AUTO_DISPATCH_BLOCKED_MANUAL_MODE]
 *   [CHECK_PENDING]
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TAG = 'checkPendingAssignments';
const TIMEOUT_MS = 60 * 1000;

// ── Statuts réellement actifs ─────────────────────────────────────────────────
const ACTIVE_STATUTS = new Set([
  'assignee_attente', 'acceptee', 'driver_en_route_pickup',
  'arrived_pickup', 'en_cours', 'arrived_dropoff',
]);

// ── Recalcul réel depuis BDD ──────────────────────────────────────────────────
async function getRealActiveCount(base44, email) {
  const courses = await base44.asServiceRole.entities.Course.filter({ livreur_email: email });
  return courses.filter(c => ACTIVE_STATUTS.has(c.statut)).length;
}

// ── Critères d'éligibilité UNIFIÉS ────────────────────────────────────────────
function isDriverEligible(d, realCount = null) {
  if (d.driver_online !== true) return false;
  if (d.profil_valide !== true && d.statut_validation_livreur !== 'valide' && d.statut_validation_livreur !== 'actif') return false;
  if (d.livreur_bloque) return false;
  if (d.livreur_suspendu) return false;
  if (d.disponible === false) return false;
  const count = realCount !== null ? realCount : (d.nombre_courses_actives || 0);
  if (count >= 2) return false;
  return true;
}

// ── Lecture exclusive DispatchModeState ───────────────────────────────────────
async function readDispatchMode(base44) {
  const rows = await base44.asServiceRole.entities.DispatchModeState.list('-updated_date', 1).catch(() => []);
  const doc = rows[0];
  const mode = doc?.mode === 'manuel' ? 'manuel' : 'auto';
  console.log(`[DISPATCH_MODE_READ] source=DispatchModeState | fn=${TAG} | mode=${mode} | id=${doc?.id || 'none'} | ts=${new Date().toISOString()}`);
  return { mode, configId: doc?.id || null };
}

async function processOnePendingCourse(base44, course, now, forceImmediate) {
  // ── VERROU ABSOLU mode manuel : jamais réassigner une course assignée manuellement ──
  // mode_assignation = 'manuel' OU 'manuel_admin' OU 'manuel_force' → intouchable par l'automatisme
  const modeAssign = (course.mode_assignation || '').toLowerCase();
  if (modeAssign === 'manuel' || modeAssign === 'manuel_admin' || modeAssign === 'manuel_force') {
    console.log(`[CHECK_PENDING] SKIPPED — mode_assignation=manuel | course=${course.id} | livreur=${course.livreur_email}`);
    return 'skipped_manual';
  }

  const assignedAt = course.heure_assignation ? new Date(course.heure_assignation).getTime() : 0;
  const elapsed = now - assignedAt;
  const livreurEmail = course.livreur_email;

  let livreurInvalide = false;
  if (livreurEmail) {
    const drivers = await base44.asServiceRole.entities.User.filter({ email: livreurEmail });
    if (drivers.length > 0) {
      // Vérifier avec le vrai compteur BDD (pas le cache User)
      const realCount = await getRealActiveCount(base44, livreurEmail);
      if (!isDriverEligible(drivers[0], realCount)) {
        livreurInvalide = true;
      }
    }
  }

  if (!livreurInvalide && !forceImmediate && elapsed < TIMEOUT_MS) {
    return 'skipped';
  }

  const raison = livreurInvalide ? 'livreur invalide' : forceImmediate ? 'force_immediate' : `timeout (${Math.round(elapsed / 1000)}s)`;
  console.log(`[CHECK_PENDING] fn=${TAG} | course=${course.id} | raison=${raison} | ts=${new Date().toISOString()}`);

  let historique = [];
  try { if (course.historique_assignation) historique = JSON.parse(course.historique_assignation); } catch (_) {}

  const updatedHist = historique.map(h =>
    h.livreur_email === livreurEmail && h.statut === 'proposee'
      ? { ...h, statut: 'no_response', note: livreurInvalide ? 'Livreur invalide' : 'Timeout 60s' }
      : h
  );

  if (livreurEmail) {
    const drivers = await base44.asServiceRole.entities.User.filter({ email: livreurEmail });
    if (drivers.length > 0) {
      // Recalculer depuis la BDD (pas décrementer un cache qui peut être faux)
      const realCount = await getRealActiveCount(base44, livreurEmail);
      await base44.asServiceRole.entities.User.update(drivers[0].id, {
        nombre_courses_actives: realCount,
        courses_refusees_consecutives: (drivers[0].courses_refusees_consecutives || 0) + 1,
      }).catch(() => {});
    }
  }

  const MAX_TENTATIVES = course.urgence === 'tres_urgent' ? 5 : 10;
  const nTent = Number(course.nombre_tentatives) || 0;

  if (nTent >= MAX_TENTATIVES) {
    await base44.asServiceRole.entities.Course.update(course.id, {
      statut: 'aucun_livreur',
      livreur_email: '',
      livreur_name: '',
      historique_assignation: JSON.stringify(updatedHist),
      dispatch_fail_reason: 'Nombre maximum de tentatives atteint',
    });
    const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
    for (const admin of admins.slice(0, 3)) {
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: admin.email,
        destinataire_role: 'admin',
        titre: `⚠️ Course bloquée — ${nTent} tentatives`,
        message: `Course ${course.quartier_depart}→${course.quartier_arrivee} sans livreur après ${nTent} tentatives.`,
        type: 'danger',
        lue: false,
        course_id: course.id,
        target_screen: '/dispatch-monitor',
        notification_key: `${admin.email}__course_blocked__${course.id}`,
      }).catch(() => {});
    }
    return 'max_tentatives';
  }

  await base44.asServiceRole.entities.Course.update(course.id, {
    statut: 'en_attente',
    livreur_email: '',
    livreur_name: '',
    historique_assignation: JSON.stringify(updatedHist),
  });

  const exclus = updatedHist
    .filter(h => ['refuse', 'no_response'].includes(h.statut))
    .map(h => h.livreur_email);

  // cdlDispatch (moteur unifié) vérifiera lui-même le mode
  await base44.asServiceRole.functions.invoke('cdlDispatch', {
    course_id: course.id,
    exclude_emails: exclus,
  });

  return 'reassigned';
}

Deno.serve(async (req) => {
  const ts = new Date().toISOString();
  try {
    const base44 = createClientFromRequest(req);

    let body = {};
    try { if (req.method === 'POST') body = await req.json(); } catch (_) {}

    const singleCourseId = body.course_id || null;
    const forceImmediateTrigger = body.force_immediate === true;

    // ── VERROU ABSOLU — même avec force_immediate ─────────────────────────────
    const { mode, configId } = await readDispatchMode(base44);
    if (mode === 'manuel') {
      console.log(`[AUTO_DISPATCH_BLOCKED_MANUAL_MODE] fn=${TAG} BLOQUÉ | configId=${configId} | forceImmediate=${forceImmediateTrigger} | ts=${ts}`);
      return Response.json({ success: true, blocked: true, reason: 'manual_mode_active', reassigned: 0, skipped: 0, fn: TAG, ts });
    }

    let coursesToProcess = [];

    if (singleCourseId) {
      const user = await base44.auth.me();
      if (!user?.email) return Response.json({ error: 'Authentification requise' }, { status: 401 });
      const one = await base44.asServiceRole.entities.Course.filter({ id: singleCourseId });
      const c = one?.[0];
      // GARDE : cours supprimée ou non dispatchable → skip immédiat
      if (!c || c.is_deleted || c.statut !== 'assignee_attente') {
        return Response.json({ success: true, reassigned: 0, skipped: 1, total: 0, note: 'Course absente, supprimée ou déjà traitée' });
      }
      const isAuthorized = user.role === 'admin' || user.email === c.livreur_email;
      if (!isAuthorized) return Response.json({ error: 'Non autorisé' }, { status: 403 });
      coursesToProcess = [c];
    } else {
      const raw = await base44.asServiceRole.entities.Course.filter({ statut: 'assignee_attente' });
      // GARDE : exclure les cours supprimées logiquement
      coursesToProcess = raw.filter(c => !c.is_deleted);
    }

    const URGENCE_SCORE = { tres_urgent: 3, urgent: 2, normal: 1 };
    coursesToProcess.sort((a, b) => {
      const diff = (URGENCE_SCORE[b.urgence] || 1) - (URGENCE_SCORE[a.urgence] || 1);
      return diff !== 0 ? diff : new Date(a.created_date).getTime() - new Date(b.created_date).getTime();
    });

    const now = Date.now();
    let reassigned = 0;
    let skipped = 0;

    for (const course of coursesToProcess) {
      const immediate = Boolean(singleCourseId && forceImmediateTrigger);
      const r = await processOnePendingCourse(base44, course, now, immediate);
      if (r === 'skipped') skipped++;
      if (r === 'reassigned') reassigned++;
    }

    console.log(`[CHECK_PENDING] fn=${TAG} | ${reassigned} réassignées | ${skipped} en attente | total=${coursesToProcess.length} | ts=${ts}`);
    return Response.json({ success: true, reassigned, skipped, total: coursesToProcess.length, fn: TAG, ts });

  } catch (error) {
    console.error(`[CHECK_PENDING] fn=${TAG} | error=${error.message} | ts=${new Date().toISOString()}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});