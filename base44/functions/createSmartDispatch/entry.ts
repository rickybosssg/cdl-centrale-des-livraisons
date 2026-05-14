/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  createSmartDispatch — EXTENSION PURE v1.0                             ║
 * ║  ❌ NE MODIFIE AUCUNE FONCTION EXISTANTE                                ║
 * ║  ❌ NE TOUCHE PAS sendCdlNotification ni le FCM existant               ║
 * ║  ❌ NE REMPLACE PAS autoDispatch ni dispatchProgressif                  ║
 * ║  ✅ 100% ADDITIF — fallback vers autoDispatch si aucun livreur         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Flux :
 *  1. Récupère les livreurs éligibles (en ligne, validé, pas en course)
 *  2. Calcule un score pour chacun (distance + rapidité + perf + activité)
 *  3. Trie par score DESC, garde top 3
 *  4. Dispatch progressif : meilleur → 2e → 3e (60s chacun)
 *  5. Log chaque tentative dans SmartDispatchLog
 *  6. Fallback autoDispatch si aucun livreur éligible
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const L = (msg) => console.log(`[createSmartDispatch] ${new Date().toISOString()} | ${msg}`);

// ── Haversine distance (km) ────────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return 99;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Calcul score livreur ──────────────────────────────────────────────────
function computeDriverScore(driver, course) {
  // 1. Score distance (0-50 pts) — priorité forte
  const distKm = haversineKm(
    driver.gps_latitude, driver.gps_longitude,
    course.latitude_depart, course.longitude_depart
  );
  // 0 km = 50pts, 5 km = 0pts (linéaire)
  const scoreDistance = Math.max(0, 50 - distKm * 10);

  // 2. Bonus rapidité (0-20 pts) — temps moyen acceptation
  // avg_acceptance_time_s : plus bas = mieux (ex: 10s = 20pts, 60s = 0pts)
  const avgAccept = driver.avg_acceptance_time_s || 60;
  const scoreRapidite = Math.max(0, 20 - (avgAccept / 3));

  // 3. Bonus performance (0-20 pts)
  const nbCourses = driver.total_courses_livrees || 0;
  const tauxAnnulation = driver.taux_annulation || 0;
  const scoreCourses = Math.min(10, nbCourses / 5); // cap 10 pts à 50 courses
  const scoreTaux = Math.max(0, 10 - tauxAnnulation * 20); // 0% = 10pts, 50% = 0pts
  const scorePerf = scoreCourses + scoreTaux;

  // 4. Bonus activité récente (0-10 pts)
  const lastSeen = driver.last_seen || driver.updated_date || null;
  let scoreActivite = 0;
  if (lastSeen) {
    const minAgo = (Date.now() - new Date(lastSeen).getTime()) / 60000;
    scoreActivite = minAgo < 5 ? 10 : minAgo < 15 ? 7 : minAgo < 30 ? 4 : 0;
  }

  const total = scoreDistance + scoreRapidite + scorePerf + scoreActivite;
  return {
    score: Math.max(0, Math.min(100, Math.round(total))),
    distKm: Math.round(distKm * 10) / 10,
    scoreDistance: Math.round(scoreDistance),
    scoreRapidite: Math.round(scoreRapidite),
    scorePerf: Math.round(scorePerf),
    scoreActivite,
  };
}

// ── Vérifier si livreur a déjà reçu cette course ─────────────────────────
async function hasAlreadyBeenOffered(base44, courseId, driverEmail) {
  try {
    const logs = await base44.asServiceRole.entities.SmartDispatchLog.filter({
      course_id: courseId,
      driver_email: driverEmail,
    }, null, 1);
    return logs.length > 0;
  } catch (_) {
    return false;
  }
}

// ── Attendre que le livreur réponde (poll 5s pendant 65s max) ────────────
async function waitForResponse(base44, courseId, driverEmail, timeoutMs = 65000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const courses = await base44.asServiceRole.entities.Course.filter({ id: courseId }, null, 1);
      const c = courses[0];
      if (!c) return { result: 'error' };

      if (c.statut === 'acceptee' && c.livreur_email === driverEmail) {
        return { result: 'accepted', elapsed: Date.now() - start };
      }
      if (c.statut === 'acceptee' && c.livreur_email !== driverEmail) {
        // Acceptée par quelqu'un d'autre (dispatch classique en parallèle ?)
        return { result: 'taken_by_other' };
      }
      if (['annulee', 'livree'].includes(c.statut)) {
        return { result: 'cancelled' };
      }
      // Statut remis à en_attente = refus ou timeout du dispatch classique
      if (c.statut === 'en_attente' || !c.livreur_email) {
        // Ne pas interpréter ça comme un refus immédiat — continuer à attendre
      }
    } catch (_) {}
  }
  return { result: 'timeout', elapsed: timeoutMs };
}

// ── Envoyer la course à un livreur ────────────────────────────────────────
async function offerCourseToDriver(base44, course, driver, position) {
  const sentAt = new Date().toISOString();
  L(`OFFER pos=${position} → ${driver.email} (score=${driver._score} dist=${driver._distKm}km)`);

  // 1. Assigner la course en statut assignee_attente
  await base44.asServiceRole.entities.Course.update(course.id, {
    statut: 'assignee_attente',
    livreur_email: driver.email,
    livreur_name: driver.full_name,
    telephone_livreur: driver.telephone || '',
    heure_assignation: sentAt,
  });

  // 2. Log SmartDispatchLog
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

  // 3. Push notification via sendCdlNotification (sans toucher à sa logique)
  try {
    await base44.asServiceRole.functions.invoke('sendCdlNotification', {
      user_email: driver.email,
      title: '📦 Nouvelle course disponible',
      body: `Une course proche de vous est disponible : ${course.quartier_depart} → ${course.quartier_arrivee} (${course.prix || 0} F)`,
      data: {
        type: 'dispatch_offer',
        course_id: course.id,
        entity_id: course.id,
        entity_type: 'Course',
        notif_route: `/course-livreur/${course.id}`,
      },
    });
    L(`Push FCM envoyé → ${driver.email}`);
  } catch (e) {
    L(`Push FCM non-bloquant: ${e.message}`);
  }

  // 4. Attendre la réponse (65s)
  const response = await waitForResponse(base44, course.id, driver.email, 65000);
  const responseMs = response.elapsed || 65000;

  // 5. Mettre à jour le log
  const updateData = { response_time_ms: responseMs };
  if (response.result === 'accepted') {
    updateData.accepted = true;
    updateData.status = 'accepted';
  } else if (response.result === 'timeout') {
    updateData.status = 'timeout';
    // Remettre en attente si toujours assignée à ce livreur
    const fresh = await base44.asServiceRole.entities.Course.filter({ id: course.id }, null, 1).catch(() => []);
    if (fresh[0]?.livreur_email === driver.email && fresh[0]?.statut === 'assignee_attente') {
      await base44.asServiceRole.entities.Course.update(course.id, {
        statut: 'en_attente', livreur_email: null, livreur_name: null,
        telephone_livreur: null, heure_assignation: null,
      });
    }
  } else if (response.result === 'taken_by_other' || response.result === 'accepted') {
    updateData.status = 'accepted';
    updateData.accepted = true;
  } else {
    updateData.status = response.result === 'cancelled' ? 'skipped' : 'refused';
    updateData.refused = true;
  }

  await base44.asServiceRole.entities.SmartDispatchLog.update(logEntry.id, updateData).catch(() => {});

  L(`Response=${response.result} elapsed=${responseMs}ms`);
  return response.result;
}

// ── Handler principal ─────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const t0 = Date.now();
  L('=== START ===');

  const base44 = createClientFromRequest(req);

  // Auth admin obligatoire (appelé depuis automation entity ou admin)
  const user = await base44.auth.me().catch(() => null);
  // Permettre aussi l'appel depuis une automation (pas d'user) via service role
  if (user && user.role !== 'admin') {
    return Response.json({ error: 'Admin requis' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  // Supporte : appel direct { course_id } OU depuis automation entity { event: { entity_id } }
  const course_id = body.course_id || body.event?.entity_id || body.args?.course_id || null;

  if (!course_id) {
    return Response.json({ error: 'course_id requis' }, { status: 400 });
  }

  // ── 1. Charger la course ──────────────────────────────────────────────────
  let course = null;
  try {
    const courses = await base44.asServiceRole.entities.Course.filter({ id: course_id }, null, 1);
    course = courses[0] || null;
  } catch (_) { course = null; }
  if (!course) {
    return Response.json({ error: 'Course introuvable' }, { status: 404 });
  }

  if (!['en_attente', 'aucun_livreur'].includes(course.statut)) {
    L(`Course statut=${course.statut} — skip smart dispatch`);
    return Response.json({ ok: true, skipped: true, reason: `statut=${course.statut}` });
  }

  L(`Course ${course_id} | ${course.quartier_depart} → ${course.quartier_arrivee} | prix=${course.prix}`);

  // ── 2. Récupérer livreurs éligibles ────────────────────────────────────────
  let allUsers = [];
  try {
    allUsers = await base44.asServiceRole.entities.User.filter({ driver_online: true });
  } catch (e) {
    L(`Erreur chargement users: ${e.message}`);
    return Response.json({ ok: false, error: e.message });
  }

  // Filtrer : en ligne + validé + pas en course active
  const eligible = allUsers.filter(u => {
    if (!u.driver_online) return false;
    if (u.profil_valide !== true && u.statut_validation_livreur !== 'valide' && u.statut_validation_livreur !== 'actif') return false;
    if (u.livreur_bloque) return false;
    if ((u.nombre_courses_actives || 0) > 0) return false;
    return true;
  });

  L(`Livreurs éligibles: ${eligible.length}/${allUsers.length}`);

  if (eligible.length === 0) {
    L('Aucun livreur éligible → fallback autoDispatch');
    try {
      await base44.asServiceRole.functions.invoke('autoDispatch', { course_id });
      L('Fallback autoDispatch lancé');
    } catch (e) {
      L(`Fallback autoDispatch erreur: ${e.message}`);
    }
    return Response.json({ ok: true, fallback: true, reason: 'no_eligible_drivers' });
  }

  // ── 3. Calculer scores et trier ────────────────────────────────────────────
  const scored = eligible.map(driver => {
    const { score, distKm, ...breakdown } = computeDriverScore(driver, course);
    return { ...driver, _score: score, _distKm: distKm, _breakdown: breakdown };
  }).sort((a, b) => b._score - a._score);

  const top3 = scored.slice(0, 3);
  L(`Top 3 candidats: ${top3.map(d => `${d.email}(score=${d._score},dist=${d._distKm}km)`).join(' | ')}`);

  // ── 4. Dispatch progressif ─────────────────────────────────────────────────
  for (let i = 0; i < top3.length; i++) {
    const driver = top3[i];
    const position = i + 1;

    // Vérifier si course toujours disponible
    const freshCheck = await base44.asServiceRole.entities.Course.filter({ id: course_id }, null, 1).catch(() => []);
    const fresh = freshCheck?.[0];
    if (!fresh || !['en_attente', 'aucun_livreur'].includes(fresh.statut)) {
      L(`Course ${course_id} déjà prise/annulée — stop dispatch`);
      break;
    }

    // Vérifier si livreur a déjà été sollicité
    const alreadyOffered = await hasAlreadyBeenOffered(base44, course_id, driver.email);
    if (alreadyOffered) {
      L(`${driver.email} déjà sollicité — skip`);
      continue;
    }

    const result = await offerCourseToDriver(base44, course, driver, position);

    if (result === 'accepted' || result === 'taken_by_other') {
      L(`✅ Course acceptée par ${driver.email} (pos=${position})`);
      break;
    }
    if (result === 'cancelled') {
      L(`Course annulée — stop`);
      break;
    }

    L(`${driver.email} → ${result} — passage au suivant (pos=${position + 1})`);
  }

  // ── 5. Vérification finale — fallback si toujours en attente ──────────────
  const finalCheck = await base44.asServiceRole.entities.Course.filter({ id: course_id }, null, 1).catch(() => []);
  const finalCourse = finalCheck?.[0];
  if (finalCourse && ['en_attente', 'aucun_livreur'].includes(finalCourse.statut)) {
    L('Tous les top3 ont refusé/timeout → fallback autoDispatch');
    try {
      await base44.asServiceRole.functions.invoke('autoDispatch', { course_id });
    } catch (e) {
      L(`Fallback autoDispatch erreur: ${e.message}`);
    }
    // Log fallback
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

  const elapsed = Date.now() - t0;
  L(`=== DONE === | course=${course_id} | elapsed=${elapsed}ms`);

  return Response.json({
    ok: true,
    course_id,
    candidates_evaluated: eligible.length,
    top3: top3.map(d => ({ email: d.email, score: d._score, dist_km: d._distKm })),
    elapsed_ms: elapsed,
  });
});