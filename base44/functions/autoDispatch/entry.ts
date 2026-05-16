/**
 * CDL — Moteur autoDispatch v4 UNIFIÉ
 *
 * SOURCE UNIQUE : DispatchModeState
 * CRITÈRES LIVREUR : isDriverEligible() — identique à createSmartDispatch
 * VERROU ABSOLU mode=manuel : aucune assignation, aucun fallback, aucun retry
 *
 * LOGS :
 *   [DISPATCH_MODE_READ]
 *   [AUTO_DISPATCH_BLOCKED_MANUAL_MODE]
 *   [DISPATCH_ELIGIBLE]
 *   [DISPATCH_ASSIGNED]
 *   [DISPATCH_FAIL]
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TAG = 'autoDispatch';

// ── Critères d'éligibilité UNIFIÉS (identiques à createSmartDispatch) ────────
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

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sortByProximity(drivers, course) {
  if (!course.latitude_depart || !course.longitude_depart) {
    return [...drivers].sort((a, b) => {
      const noteDiff = (b.note_moyenne || 0) - (a.note_moyenne || 0);
      if (noteDiff !== 0) return noteDiff;
      return (a.nombre_courses_actives || 0) - (b.nombre_courses_actives || 0);
    });
  }
  const lat1 = parseFloat(course.latitude_depart);
  const lng1 = parseFloat(course.longitude_depart);
  const avecGPS = drivers.filter(d => d.gps_latitude && d.gps_longitude);
  const sansGPS = drivers.filter(d => !d.gps_latitude || !d.gps_longitude);
  avecGPS.sort((a, b) =>
    distanceKm(a.gps_latitude, a.gps_longitude, lat1, lng1) -
    distanceKm(b.gps_latitude, b.gps_longitude, lat1, lng1)
  );
  return [...avecGPS, ...sansGPS];
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
    const courseId = body.course_id || body.event?.entity_id;
    const excludeEmails = body.exclude_emails || [];

    if (!courseId) {
      return Response.json({ error: 'course_id manquant' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // ── VERROU ABSOLU — première instruction, aucun fallback ──────────────────
    const { mode, configId } = await readDispatchMode(base44);
    if (mode === 'manuel') {
      console.log(`[AUTO_DISPATCH_BLOCKED_MANUAL_MODE] fn=${TAG} | course=${courseId} | configId=${configId} | ts=${ts}`);
      return Response.json({ success: false, blocked: true, reason: 'manual_mode_active', fn: TAG, ts });
    }

    // ── Récupérer la course ────────────────────────────────────────────────────
    const courses = await base44.asServiceRole.entities.Course.filter({ id: courseId });
    if (!courses?.length) return Response.json({ error: 'Course introuvable' }, { status: 404 });
    const course = courses[0];

    const ELIGIBLE_STATUTS = ['en_attente', 'aucun_livreur'];
    if (!ELIGIBLE_STATUTS.includes(course.statut)) {
      return Response.json({ success: false, message: `Statut non éligible: ${course.statut}` });
    }

    // ── Historique des déjà-contactés ─────────────────────────────────────────
    let historique = [];
    try { if (course.historique_assignation) historique = JSON.parse(course.historique_assignation); } catch (_) {}
    const dejaContactes = new Set([
      ...excludeEmails,
      ...historique.filter(h => ['refuse', 'no_response'].includes(h.statut)).map(h => h.livreur_email),
    ]);

    // ── Livreurs éligibles (critères UNIFIÉS) ─────────────────────────────────
    const allUsers = await base44.asServiceRole.entities.User.list('-updated_date', 500);
    const eligibles = allUsers.filter(d => isDriverEligible(d, dejaContactes));

    const onlineCount = allUsers.filter(d => d.driver_online).length;
    const validCount = allUsers.filter(d => d.driver_online && (d.profil_valide || d.statut_validation_livreur === 'valide')).length;
    console.log(`[DISPATCH_ELIGIBLE] fn=${TAG} | total=${allUsers.length} | online=${onlineCount} | valides=${validCount} | eligibles=${eligibles.length} | ts=${ts}`);

    const now = new Date().toISOString();

    // ── Aucun livreur disponible ──────────────────────────────────────────────
    if (eligibles.length === 0) {
      let failReason = 'Aucun livreur disponible';
      if (onlineCount === 0) failReason = 'Aucun livreur connecté';
      else if (validCount === 0) failReason = `${onlineCount} livreur(s) en ligne mais aucun profil validé`;

      console.log(`[DISPATCH_FAIL] fn=${TAG} | course=${courseId} | reason=${failReason} | ts=${ts}`);
      historique.push({ heure: now, statut: 'aucun_livreur', raison: failReason });
      await base44.asServiceRole.entities.Course.update(courseId, {
        statut: 'aucun_livreur',
        nombre_tentatives: (course.nombre_tentatives || 0) + 1,
        historique_assignation: JSON.stringify(historique),
      });

      if (course.client_email) {
        await base44.asServiceRole.entities.Notification.create({
          destinataire_email: course.client_email,
          destinataire_role: 'client',
          titre: 'Aucun livreur disponible',
          message: failReason + ' — Nous vous préviendrons dès qu\'un livreur est disponible.',
          type: 'warning',
          lue: false,
          course_id: courseId,
          target_screen: `/course/${courseId}`,
        }).catch(() => {});
      }

      await base44.asServiceRole.functions.invoke('sendCdlNotification', {
        role: 'admin',
        title: '🚨 Course sans livreur',
        body: `${course.quartier_depart}→${course.quartier_arrivee} (${course.prix} F) — ${failReason}`,
        urgence: 'urgent',
        data: { type: 'no_driver_available', entity_id: courseId, role: 'admin', notif_route: '/dispatch-monitor' },
      }).catch(() => {});

      return Response.json({ success: false, reason: failReason, online: onlineCount, valides: validCount, fn: TAG, ts });
    }

    // ── Trier par proximité GPS ───────────────────────────────────────────────
    const tries = sortByProximity(eligibles, course);
    const choisi = tries[0];

    const distLog = course.latitude_depart && choisi.gps_latitude
      ? `${distanceKm(choisi.gps_latitude, choisi.gps_longitude, parseFloat(course.latitude_depart), parseFloat(course.longitude_depart)).toFixed(1)} km`
      : 'GPS N/A';
    console.log(`[DISPATCH_ASSIGNED] fn=${TAG} | course=${courseId} | livreur=${choisi.email} | dist=${distLog} | eligibles=${eligibles.length} | ts=${ts}`);

    // ── Vérification atomique finale ──────────────────────────────────────────
    const freshDrivers = await base44.asServiceRole.entities.User.filter({ email: choisi.email });
    const freshDriver = freshDrivers[0];
    if (!freshDriver || !isDriverEligible(freshDriver)) {
      console.log(`[DISPATCH_FAIL] fn=${TAG} | livreur ${choisi.email} plus éligible — relance avec exclusion | ts=${ts}`);
      return base44.asServiceRole.functions.invoke('autoDispatch', {
        course_id: courseId,
        exclude_emails: [...Array.from(dejaContactes), choisi.email],
      }).then(r => r).catch(() =>
        Response.json({ success: false, reason: 'Livreur sélectionné plus disponible' })
      );
    }

    // ── Assigner au livreur — timer 60s ───────────────────────────────────────
    const expireAt = new Date(Date.now() + 60000).toISOString();
    historique.push({
      livreur_email: choisi.email,
      livreur_nom: choisi.full_name,
      heure: now,
      heure_expiration: expireAt,
      statut: 'proposee',
    });

    await base44.asServiceRole.entities.Course.update(courseId, {
      statut: 'assignee_attente',
      livreur_email: choisi.email,
      livreur_name: choisi.full_name,
      telephone_livreur: choisi.telephone || '',
      heure_assignation: now,
      mode_assignation: 'auto',
      nombre_tentatives: (course.nombre_tentatives || 0) + 1,
      historique_assignation: JSON.stringify(historique),
      dispatch_fail_reason: null,
    });

    await base44.asServiceRole.entities.User.update(choisi.id, {
      nombre_courses_actives: (choisi.nombre_courses_actives || 0) + 1,
      courses_proposees: (choisi.courses_proposees || 0) + 1,
      derniere_proposition_at: now,
    }).catch(() => {});

    // Notifications livreur
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: choisi.email,
      destinataire_role: 'livreur',
      titre: '🛵 Nouvelle course !',
      message: `${course.quartier_depart} → ${course.quartier_arrivee}. ${course.type_colis || 'Colis'}. ${course.prix} FCFA. Répondez en 60 secondes.`,
      type: 'success',
      lue: false,
      course_id: courseId,
      target_screen: `/course-livreur/${courseId}`,
      target_entity_id: courseId,
      target_entity_type: 'course',
      notification_key: `${choisi.email}__assignee_attente__${courseId}`,
    }).catch(() => {});

    await base44.asServiceRole.functions.invoke('sendCdlNotification', {
      user_email: choisi.email,
      title: '📦 Nouvelle course disponible',
      body: `${course.quartier_depart} → ${course.quartier_arrivee} (${course.prix || 0} F)`,
      data: { type: 'dispatch_offer', course_id: courseId, entity_id: courseId, entity_type: 'Course', notif_route: `/course-livreur/${courseId}` },
    }).catch(() => {});

    // Notification client
    if (course.client_email) {
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: course.client_email,
        destinataire_role: 'client',
        titre: '🔍 Livreur trouvé !',
        message: 'Un livreur a été contacté. En attente de sa confirmation.',
        type: 'info',
        lue: false,
        course_id: courseId,
        target_screen: `/course/${courseId}`,
        notification_key: `${course.client_email}__livreur_trouve__${courseId}`,
      }).catch(() => {});
    }

    // WhatsApp livreur
    if (choisi.telephone) {
      base44.asServiceRole.functions.invoke('sendWhatsAppAlert', {
        eventType: 'driver_course_assigned',
        recipientRole: 'livreur',
        recipientName: choisi.full_name,
        recipientPhone: choisi.telephone,
        messageText: `🚨 Nouvelle course CDL ! ${course.quartier_depart}→${course.quartier_arrivee} — ${course.prix} FCFA. Ouvrez l'app (60s).`,
        entityId: courseId,
        entityType: 'course',
        priority: 'urgent',
      }).catch(() => {});
    }

    return Response.json({
      success: true,
      livreur: { email: choisi.email, nom: choisi.full_name },
      eligibles_count: eligibles.length,
      mode,
      fn: TAG,
      ts,
    });

  } catch (error) {
    console.error(`[DISPATCH_FAIL] fn=${TAG} | error=${error.message} | ts=${new Date().toISOString()}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});