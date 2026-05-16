/**
 * CDL — createSmartDispatch v4 UNIFIÉ
 *
 * SOURCE UNIQUE : DispatchModeState
 * CRITÈRES LIVREUR : isDriverEligible() — identiques à autoDispatch
 * VERROU ABSOLU mode=manuel : aucune assignation, aucun fallback, aucun retry
 * DÉCLENCHEMENT : automation entity Course.create (statut=en_attente) UNIQUEMENT
 *
 * LOGS :
 *   [DISPATCH_MODE_READ]
 *   [AUTO_DISPATCH_BLOCKED_MANUAL_MODE]
 *   [DISPATCH_ELIGIBLE]
 *   [DISPATCH_ASSIGNED]
 *   [DISPATCH_FAIL]
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TAG = 'createSmartDispatch';
const L = (msg) => console.log(`[${TAG}] ${new Date().toISOString()} | ${msg}`);

// ── Critères d'éligibilité UNIFIÉS (identiques à autoDispatch) ───────────────
function isDriverEligible(d, dejaContactes = new Set()) {
  if (dejaContactes.has(d.email)) return false;
  if (d.driver_online !== true) return false;
  if (d.profil_valide !== true && d.statut_validation_livreur !== 'valide' && d.statut_validation_livreur !== 'actif') return false;
  if (d.livreur_bloque) return false;
  if (d.livreur_suspendu) return false;
  if (d.disponible === false) return false;
  if ((d.nombre_courses_actives || 0) >= 2) return false;
  return true;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return 99;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeDriverScore(driver, course) {
  const distKm = haversineKm(driver.gps_latitude, driver.gps_longitude, course.latitude_depart, course.longitude_depart);
  const scoreDistance = Math.max(0, 50 - distKm * 10);
  const avgAccept = driver.avg_acceptance_time_s || 60;
  const scoreRapidite = Math.max(0, 20 - (avgAccept / 3));
  const nbCourses = driver.total_courses_livrees || 0;
  const tauxAnnulation = driver.taux_annulation || 0;
  const scoreCourses = Math.min(10, nbCourses / 5);
  const scoreTaux = Math.max(0, 10 - tauxAnnulation * 20);
  const lastSeen = driver.last_seen || driver.updated_date || null;
  let scoreActivite = 0;
  if (lastSeen) {
    const minAgo = (Date.now() - new Date(lastSeen).getTime()) / 60000;
    scoreActivite = minAgo < 5 ? 10 : minAgo < 15 ? 7 : minAgo < 30 ? 4 : 0;
  }
  const total = scoreDistance + scoreRapidite + scoreCourses + scoreTaux + scoreActivite;
  return { score: Math.max(0, Math.min(100, Math.round(total))), distKm: Math.round(distKm * 10) / 10 };
}

// ── Lecture exclusive DispatchModeState ───────────────────────────────────────
async function readDispatchMode(base44) {
  const rows = await base44.asServiceRole.entities.DispatchModeState.list('-updated_date', 1).catch(() => []);
  const doc = rows[0];
  const mode = doc?.mode === 'manuel' ? 'manuel' : 'auto';
  console.log(`[DISPATCH_MODE_READ] source=DispatchModeState | fn=${TAG} | mode=${mode} | id=${doc?.id || 'none'} | ts=${new Date().toISOString()}`);
  return { mode, configId: doc?.id || null };
}

async function hasAlreadyBeenOffered(base44, courseId, driverEmail) {
  try {
    const logs = await base44.asServiceRole.entities.SmartDispatchLog.filter({ course_id: courseId, driver_email: driverEmail }, null, 1);
    return logs.length > 0;
  } catch (_) { return false; }
}

async function waitForResponse(base44, courseId, driverEmail, timeoutMs = 65000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const courses = await base44.asServiceRole.entities.Course.filter({ id: courseId }, null, 1);
      const c = courses[0];
      if (!c) return { result: 'error' };
      if (c.statut === 'acceptee' && c.livreur_email === driverEmail) return { result: 'accepted', elapsed: Date.now() - start };
      if (c.statut === 'acceptee' && c.livreur_email !== driverEmail) return { result: 'taken_by_other' };
      if (['annulee', 'livree'].includes(c.statut)) return { result: 'cancelled' };
    } catch (_) {}
  }
  return { result: 'timeout', elapsed: timeoutMs };
}

async function offerCourseToDriver(base44, course, driver, position) {
  const sentAt = new Date().toISOString();
  L(`OFFER pos=${position} → ${driver.email} | score=${driver._score} | dist=${driver._distKm}km`);

  await base44.asServiceRole.entities.Course.update(course.id, {
    statut: 'assignee_attente',
    livreur_email: driver.email,
    livreur_name: driver.full_name,
    telephone_livreur: driver.telephone || '',
    heure_assignation: sentAt,
    mode_assignation: 'auto',
  });

  const logEntry = await base44.asServiceRole.entities.SmartDispatchLog.create({
    course_id: course.id,
    driver_email: driver.email,
    driver_name: driver.full_name || driver.email,
    score: driver._score,
    position,
    distance_km: driver._distKm,
    sent_at: sentAt,
    accepted: false,
    refused: false,
    status: 'sent',
  });

  // Notification in-app
  await base44.asServiceRole.entities.Notification.create({
    destinataire_email: driver.email,
    destinataire_role: 'livreur',
    titre: '🛵 Nouvelle course !',
    message: `${course.quartier_depart} → ${course.quartier_arrivee}. ${course.prix} FCFA. Répondez en 60 secondes.`,
    type: 'success',
    lue: false,
    course_id: course.id,
    target_screen: `/course-livreur/${course.id}`,
    target_entity_id: course.id,
    target_entity_type: 'course',
    notification_key: `${driver.email}__assignee_attente__${course.id}`,
  }).catch(() => {});

  // Push FCM
  await base44.asServiceRole.functions.invoke('sendCdlNotification', {
    user_email: driver.email,
    title: '📦 Nouvelle course disponible',
    body: `${course.quartier_depart} → ${course.quartier_arrivee} (${course.prix || 0} F)`,
    data: { type: 'dispatch_offer', course_id: course.id, entity_id: course.id, entity_type: 'Course', notif_route: `/course-livreur/${course.id}` },
  }).catch(e => L(`Push FCM non-bloquant: ${e.message}`));

  const response = await waitForResponse(base44, course.id, driver.email, 65000);
  const responseMs = response.elapsed || 65000;

  const updateData = { response_time_ms: responseMs };
  if (response.result === 'accepted' || response.result === 'taken_by_other') {
    updateData.accepted = true;
    updateData.status = 'accepted';
  } else if (response.result === 'timeout') {
    updateData.status = 'timeout';
    // Reset course seulement si elle est toujours assignée à ce livreur
    const fresh = await base44.asServiceRole.entities.Course.filter({ id: course.id }, null, 1).catch(() => []);
    if (fresh[0]?.livreur_email === driver.email && fresh[0]?.statut === 'assignee_attente') {
      await base44.asServiceRole.entities.Course.update(course.id, {
        statut: 'en_attente',
        livreur_email: null,
        livreur_name: null,
        telephone_livreur: null,
        heure_assignation: null,
      });
    }
  } else {
    updateData.status = response.result === 'cancelled' ? 'skipped' : 'refused';
    updateData.refused = true;
  }

  await base44.asServiceRole.entities.SmartDispatchLog.update(logEntry.id, updateData).catch(() => {});
  L(`Response=${response.result} | elapsed=${responseMs}ms`);
  return response.result;
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  const ts = new Date().toISOString();
  L(`=== START === ts=${ts}`);

  const base44 = createClientFromRequest(req);

  const body = await req.json().catch(() => ({}));
  const course_id = body.course_id || body.event?.entity_id || body.args?.course_id || null;

  if (!course_id) return Response.json({ error: 'course_id requis' }, { status: 400 });

  // ── VERROU ABSOLU — première instruction ──────────────────────────────────
  const { mode, configId } = await readDispatchMode(base44);
  if (mode === 'manuel') {
    L(`[AUTO_DISPATCH_BLOCKED_MANUAL_MODE] BLOQUÉ mode=manuel | course=${course_id} | configId=${configId} | ts=${ts}`);
    return Response.json({ ok: true, blocked: true, reason: 'manual_mode_active', fn: TAG, ts });
  }

  L(`mode=auto autorisé | course=${course_id} | configId=${configId}`);

  // ── Charger la course ─────────────────────────────────────────────────────
  let course = null;
  try {
    const courses = await base44.asServiceRole.entities.Course.filter({ id: course_id }, null, 1);
    course = courses[0] || null;
  } catch (_) { course = null; }
  if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

  if (!['en_attente', 'aucun_livreur'].includes(course.statut)) {
    L(`Course statut=${course.statut} — skip`);
    return Response.json({ ok: true, skipped: true, reason: `statut=${course.statut}` });
  }

  L(`Course ${course_id} | ${course.quartier_depart} → ${course.quartier_arrivee} | prix=${course.prix}`);

  // ── Historique déjà-contactés ─────────────────────────────────────────────
  let historique = [];
  try { if (course.historique_assignation) historique = JSON.parse(course.historique_assignation); } catch (_) {}
  const dejaContactes = new Set(
    historique.filter(h => ['refuse', 'no_response'].includes(h.statut)).map(h => h.livreur_email)
  );

  // ── Livreurs éligibles (critères UNIFIÉS) ─────────────────────────────────
  let allUsers = [];
  try {
    allUsers = await base44.asServiceRole.entities.User.filter({ driver_online: true });
  } catch (e) {
    L(`Erreur chargement users: ${e.message}`);
    return Response.json({ ok: false, error: e.message });
  }

  const eligible = allUsers.filter(d => isDriverEligible(d, dejaContactes));
  console.log(`[DISPATCH_ELIGIBLE] fn=${TAG} | total=${allUsers.length} | eligibles=${eligible.length} | ts=${ts}`);

  if (eligible.length === 0) {
    L(`[DISPATCH_FAIL] Aucun livreur éligible — fallback autoDispatch | mode=auto`);
    try {
      await base44.asServiceRole.functions.invoke('autoDispatch', { course_id });
    } catch (e) {
      L(`Fallback autoDispatch erreur: ${e.message}`);
    }
    return Response.json({ ok: true, fallback: true, reason: 'no_eligible_drivers', fn: TAG, ts });
  }

  // ── Scoring et top 3 ─────────────────────────────────────────────────────
  const scored = eligible.map(driver => {
    const { score, distKm } = computeDriverScore(driver, course);
    return { ...driver, _score: score, _distKm: distKm };
  }).sort((a, b) => b._score - a._score);

  const top3 = scored.slice(0, 3);
  L(`Top3: ${top3.map(d => `${d.email}(score=${d._score},dist=${d._distKm}km)`).join(' | ')}`);

  // ── Dispatch progressif top 3 ────────────────────────────────────────────
  for (let i = 0; i < top3.length; i++) {
    const driver = top3[i];

    // Vérifier la course toujours disponible
    const freshCheck = await base44.asServiceRole.entities.Course.filter({ id: course_id }, null, 1).catch(() => []);
    const fresh = freshCheck?.[0];
    if (!fresh || !['en_attente', 'aucun_livreur'].includes(fresh.statut)) {
      L(`Course ${course_id} plus disponible — stop`);
      break;
    }

    // Re-vérifier le mode à chaque itération (peut changer pendant les 65s)
    const { mode: recheckMode } = await readDispatchMode(base44);
    if (recheckMode === 'manuel') {
      L(`[AUTO_DISPATCH_BLOCKED_MANUAL_MODE] mode basculé en manuel pendant dispatch — arrêt immédiat | pos=${i + 1} | ts=${new Date().toISOString()}`);
      return Response.json({ ok: true, blocked: true, reason: 'manual_mode_active_mid_dispatch', fn: TAG });
    }

    const alreadyOffered = await hasAlreadyBeenOffered(base44, course_id, driver.email);
    if (alreadyOffered) { L(`${driver.email} déjà sollicité — skip`); continue; }

    const result = await offerCourseToDriver(base44, course, driver, i + 1);

    if (result === 'accepted' || result === 'taken_by_other') {
      L(`✅ Course acceptée | livreur=${driver.email} | pos=${i + 1}`);
      console.log(`[DISPATCH_ASSIGNED] fn=${TAG} | course=${course_id} | livreur=${driver.email} | score=${driver._score} | pos=${i + 1} | ts=${new Date().toISOString()}`);
      break;
    }
    if (result === 'cancelled') { L(`Course annulée — stop`); break; }
    L(`${driver.email} → ${result} — suivant`);
  }

  // ── Fallback final — RE-VÉRIFICATION MODE obligatoire ─────────────────────
  const finalCheck = await base44.asServiceRole.entities.Course.filter({ id: course_id }, null, 1).catch(() => []);
  const finalCourse = finalCheck?.[0];
  if (finalCourse && ['en_attente', 'aucun_livreur'].includes(finalCourse.statut)) {
    const { mode: finalMode, configId: finalConfigId } = await readDispatchMode(base44);
    if (finalMode === 'manuel') {
      L(`[AUTO_DISPATCH_BLOCKED_MANUAL_MODE] Fallback final BLOQUÉ — mode=manuel | configId=${finalConfigId}`);
    } else {
      L(`Top3 tous refusés/timeout → fallback autoDispatch | mode=auto`);
      try {
        await base44.asServiceRole.functions.invoke('autoDispatch', { course_id });
      } catch (e) {
        L(`Fallback autoDispatch erreur: ${e.message}`);
      }
      await base44.asServiceRole.entities.SmartDispatchLog.create({
        course_id,
        driver_email: 'fallback',
        driver_name: 'autoDispatch fallback',
        score: 0,
        position: 99,
        sent_at: new Date().toISOString(),
        status: 'skipped',
        fallback_used: true,
      }).catch(() => {});
    }
  }

  const elapsed = Date.now() - t0;
  L(`=== DONE === | course=${course_id} | elapsed=${elapsed}ms`);

  return Response.json({
    ok: true,
    course_id,
    candidates_evaluated: eligible.length,
    top3: top3.map(d => ({ email: d.email, score: d._score, dist_km: d._distKm })),
    elapsed_ms: elapsed,
    fn: TAG,
    ts,
  });
});