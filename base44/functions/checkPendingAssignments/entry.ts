/**
 * CDL — Vérification des assignations en attente (timeout 60s) v2
 *
 * - Automation schedulée (ex. toutes les 5 min) : traite toutes les courses en assignee_attente.
 * - Appel ciblé : POST { "course_id": "..." } depuis l'app dès expiration du timer 60s (relance rapide).
 *
 * Pour chaque course en statut "assignee_attente" depuis plus de 60s (ou livreur devenu invalide) :
 *   1. Marquer no_response dans l'historique
 *   2. Décrémenter nombre_courses_actives du livreur
 *   3. Remettre en en_attente et relancer autoDispatch
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const TIMEOUT_MS = 60 * 1000; // 60 secondes

/** Appel avec course_id : livreur assigné ou staff (aligné sur adminCourseAction) */
function canTriggerDispatchForCourse(
  user: { email?: string; role?: string; user_type?: string } | null,
  course: { livreur_email?: string },
): boolean {
  if (!user?.email) return false;
  if (user.email === course.livreur_email) return true;
  return user.role === 'admin' || user.role === 'dispatcher' || user.user_type === 'admin';
}

function isDriverStillValid(driver) {
  return (
    driver.driver_online === true &&
    driver.profil_valide === true &&
    !driver.livreur_bloque &&
    !driver.livreur_suspendu &&
    driver.disponible !== false &&
    (driver.nombre_courses_actives || 0) < 3
  );
}

type ProcessResult = 'skipped' | 'reassigned' | 'max_tentatives';

async function processOnePendingCourse(
  base44: any,
  course: Record<string, unknown>,
  now: number,
  forceImmediate: boolean,
): Promise<ProcessResult> {
  const assignedAt = course.heure_assignation ? new Date(String(course.heure_assignation)).getTime() : 0;
  const elapsed = now - assignedAt;

  let livreurInvalide = false;
  const livreurEmail = course.livreur_email as string | undefined;
  if (livreurEmail) {
    const drivers = await base44.asServiceRole.entities.User.filter({ email: livreurEmail });
    if (drivers.length > 0 && !isDriverStillValid(drivers[0])) {
      livreurInvalide = true;
      console.log(`[CHECK] Livreur ${livreurEmail} invalide pendant attente — passage au suivant`);
    }
  }

  if (!livreurInvalide && !forceImmediate && elapsed < TIMEOUT_MS) {
    return 'skipped';
  }

  console.log(
    `[CHECK] Course ${course.id} — ${livreurInvalide ? 'livreur invalide' : forceImmediate ? 'déclenché client' : `timeout (${Math.round(elapsed / 1000)}s)`}`,
  );

  let historique: Record<string, unknown>[] = [];
  try {
    if (course.historique_assignation) historique = JSON.parse(String(course.historique_assignation));
  } catch (_) {}

  const updatedHist = historique.map((h: Record<string, unknown>) =>
    h.livreur_email === livreurEmail && h.statut === 'proposee'
      ? {
          ...h,
          statut: 'no_response',
          note: livreurInvalide ? 'Livreur devenu invalide' : 'Timeout 60s',
        }
      : h,
  );

  if (livreurEmail) {
    const drivers = await base44.asServiceRole.entities.User.filter({ email: livreurEmail });
    if (drivers.length > 0) {
      const driver = drivers[0];
      await base44.asServiceRole.entities.User.update(driver.id, {
        nombre_courses_actives: Math.max(0, (driver.nombre_courses_actives || 0) - 1),
        courses_refusees_consecutives: (driver.courses_refusees_consecutives || 0) + 1,
      }).catch(() => {});
    }
  }

  const MAX_TENTATIVES = course.urgence === 'tres_urgent' ? 5 : 10;
  const nTent = Number(course.nombre_tentatives) || 0;
  if (nTent >= MAX_TENTATIVES) {
    await base44.asServiceRole.entities.Course.update(course.id as string, {
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
        titre: `⚠️ Course bloquée — ${course.nombre_tentatives} tentatives`,
        message: `Course ${course.quartier_depart}→${course.quartier_arrivee} sans livreur après ${course.nombre_tentatives} tentatives. Intervention manuelle requise.`,
        type: 'danger',
        lue: false,
        course_id: course.id,
        target_screen: '/dispatch-monitor',
      }).catch(() => {});
    }
    return 'max_tentatives';
  }

  await base44.asServiceRole.entities.Course.update(course.id as string, {
    statut: 'en_attente',
    livreur_email: '',
    livreur_name: '',
    historique_assignation: JSON.stringify(updatedHist),
  });

  const exclus = updatedHist
    .filter((h: Record<string, unknown>) => ['refuse', 'no_response'].includes(String(h.statut)))
    .map((h: Record<string, unknown>) => h.livreur_email as string);

  await base44.asServiceRole.functions.invoke('autoDispatch', {
    course_id: course.id,
    exclude_emails: exclus,
  });
  return 'reassigned';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let body: Record<string, unknown> = {};
    try {
      if (req.method === 'POST') body = await req.json();
    } catch (_) {}

    const singleCourseId = typeof body.course_id === 'string' ? body.course_id : undefined;
    /** true = appel depuis le timer livreur : traiter sans attendre le cron */
    const forceImmediateTrigger = body.force_immediate === true;

    const configs = await base44.asServiceRole.entities.DispatchConfig.list('-updated_date', 1);
    const config = configs[0];
    if (config?.mode === 'manuel' && !forceImmediateTrigger) {
      console.log('[CHECK] Mode manuel — skip (pas de cron)');
      return Response.json({ success: true, blocked: true, reason: 'mode_manuel', reassigned: 0, skipped: 0 });
    }

    let coursesRaw: Record<string, unknown>[];

    if (singleCourseId) {
      const user = await base44.auth.me();
      if (!user?.email) {
        return Response.json({ error: 'Authentification requise' }, { status: 401 });
      }
      const one = await base44.asServiceRole.entities.Course.filter({ id: singleCourseId });
      const c = one?.[0];
      if (!c || c.statut !== 'assignee_attente') {
        return Response.json({
          success: true,
          reassigned: 0,
          skipped: 1,
          total: 0,
          note: 'Course absente ou déjà traitée',
        });
      }
      if (!canTriggerDispatchForCourse(user, c as { livreur_email?: string })) {
        return Response.json({ error: 'Non autorisé' }, { status: 403 });
      }
      coursesRaw = [c];
    } else {
      coursesRaw = await base44.asServiceRole.entities.Course.filter({ statut: 'assignee_attente' });
    }

    const URGENCE_SCORE: Record<string, number> = { tres_urgent: 3, urgent: 2, normal: 1 };
    const courses = [...coursesRaw].sort((a, b) => {
      const diff =
        (URGENCE_SCORE[String(b.urgence)] || 1) - (URGENCE_SCORE[String(a.urgence)] || 1);
      return diff !== 0 ? diff : new Date(String(a.created_date)).getTime() - new Date(String(b.created_date)).getTime();
    });

    const now = Date.now();
    let reassigned = 0;
    let skipped = 0;

    for (const course of courses) {
      const immediate = Boolean(singleCourseId && forceImmediateTrigger);
      const r = await processOnePendingCourse(base44, course, now, immediate);
      if (r === 'skipped') skipped++;
      if (r === 'reassigned') reassigned++;
    }

    console.log(`[CHECK] ${reassigned} réassignées, ${skipped} encore en attente`);
    return Response.json({ success: true, reassigned, skipped, total: courses.length });

  } catch (error) {
    const err = error as Error;
    console.error('[CHECK] Erreur:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});
