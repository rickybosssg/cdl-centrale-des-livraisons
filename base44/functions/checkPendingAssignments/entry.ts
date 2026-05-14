/**
 * CDL — Vérification des assignations en attente (timeout 60s)
 *
 * - Automation schedulée (toutes les 5 min) : traite toutes les courses en assignee_attente.
 * - Appel ciblé : POST { "course_id": "...", "force_immediate": true } depuis l'app.
 *
 * Pour chaque course en statut "assignee_attente" depuis plus de 60s :
 *   1. Marquer no_response dans l'historique
 *   2. Décrémenter nombre_courses_actives du livreur
 *   3. Remettre en en_attente et relancer autoDispatch
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TIMEOUT_MS = 60 * 1000; // 60 secondes

function isDriverStillValid(driver) {
  return (
    driver.driver_online === true &&
    driver.profil_valide === true &&
    !driver.livreur_bloque &&
    !driver.livreur_suspendu &&
    driver.disponible !== false &&
    (driver.nombre_courses_actives || 0) < 2
  );
}

async function processOnePendingCourse(base44, course, now, forceImmediate) {
  const assignedAt = course.heure_assignation ? new Date(course.heure_assignation).getTime() : 0;
  const elapsed = now - assignedAt;
  const livreurEmail = course.livreur_email;

  let livreurInvalide = false;
  if (livreurEmail) {
    const drivers = await base44.asServiceRole.entities.User.filter({ email: livreurEmail });
    if (drivers.length > 0 && !isDriverStillValid(drivers[0])) {
      livreurInvalide = true;
      console.log(`[CHECK] Livreur ${livreurEmail} invalide — passage au suivant`);
    }
  }

  if (!livreurInvalide && !forceImmediate && elapsed < TIMEOUT_MS) {
    return 'skipped';
  }

  console.log(
    `[CHECK] Course ${course.id} — ${livreurInvalide ? 'livreur invalide' : forceImmediate ? 'déclenché client' : `timeout (${Math.round(elapsed / 1000)}s)`}`
  );

  let historique = [];
  try {
    if (course.historique_assignation) historique = JSON.parse(course.historique_assignation);
  } catch (_) {}

  const updatedHist = historique.map(h =>
    h.livreur_email === livreurEmail && h.statut === 'proposee'
      ? { ...h, statut: 'no_response', note: livreurInvalide ? 'Livreur devenu invalide' : 'Timeout 60s' }
      : h
  );

  if (livreurEmail) {
    const drivers = await base44.asServiceRole.entities.User.filter({ email: livreurEmail });
    if (drivers.length > 0) {
      await base44.asServiceRole.entities.User.update(drivers[0].id, {
        nombre_courses_actives: Math.max(0, (drivers[0].nombre_courses_actives || 0) - 1),
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
    // Notifier admins
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

  await base44.asServiceRole.functions.invoke('autoDispatch', {
    course_id: course.id,
    exclude_emails: exclus,
  });

  return 'reassigned';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let body = {};
    try {
      if (req.method === 'POST') body = await req.json();
    } catch (_) {}

    const singleCourseId = body.course_id || null;
    const forceImmediateTrigger = body.force_immediate === true;

    const allConfigs = await base44.asServiceRole.entities.DispatchConfig.list('-updated_date', 50);
    const canonicalConfig = allConfigs.find(c => c.mode_key === 'GLOBAL');
    const activeConfig = canonicalConfig || allConfigs[0] || null;
    const mode = activeConfig?.mode || 'auto';

    console.log(`[DISPATCH_WRITE_SOURCE] checkPendingAssignments | CANONICAL=${!!canonicalConfig} | mode=${mode} | id=${activeConfig?.id || 'none'} | totalDocs=${allConfigs.length}`);

    if (mode === 'manuel' && !forceImmediateTrigger) {
      console.log(`[DISPATCH_MODE_NOT_OVERWRITTEN] SKIP — mode manuel respecté par checkPendingAssignments`);
      return Response.json({ success: true, blocked: true, reason: 'mode_manuel', reassigned: 0, skipped: 0 });
    }

    let coursesToProcess = [];

    if (singleCourseId) {
      const user = await base44.auth.me();
      if (!user?.email) {
        return Response.json({ error: 'Authentification requise' }, { status: 401 });
      }
      const one = await base44.asServiceRole.entities.Course.filter({ id: singleCourseId });
      const c = one?.[0];
      if (!c || c.statut !== 'assignee_attente') {
        return Response.json({ success: true, reassigned: 0, skipped: 1, total: 0, note: 'Course absente ou déjà traitée' });
      }
      // Vérifier autorisation : livreur assigné ou admin
      const isAuthorized = user.role === 'admin' || user.email === c.livreur_email;
      if (!isAuthorized) {
        return Response.json({ error: 'Non autorisé' }, { status: 403 });
      }
      coursesToProcess = [c];
    } else {
      coursesToProcess = await base44.asServiceRole.entities.Course.filter({ statut: 'assignee_attente' });
    }

    // Trier par urgence puis par date
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

    console.log(`[CHECK] ${reassigned} réassignées, ${skipped} encore en attente sur ${coursesToProcess.length} total`);
    return Response.json({ success: true, reassigned, skipped, total: coursesToProcess.length });

  } catch (error) {
    console.error('[CHECK] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});