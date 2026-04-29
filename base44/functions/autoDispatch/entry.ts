/**
 * CDL — Moteur de dispatch automatique (v2)
 *
 * RÈGLE D'ÉLIGIBILITÉ (SANS current_role) :
 *   Un livreur est dispatchable si et seulement si :
 *     1. driver_online = true          → en ligne
 *     2. profil_valide = true          → profil livreur validé
 *     3. !livreur_bloque               → non bloqué
 *     4. !livreur_suspendu             → non suspendu
 *     5. disponible != false           → disponible (true ou non défini)
 *     6. nombre_courses_actives < 2   → pas surchargé
 *
 *  ⚠️ current_role n'est JAMAIS utilisé pour le dispatch.
 *
 * TRI : par proximité GPS si disponible, sinon par note puis charge.
 * TIMER : 60 secondes par livreur (géré par checkPendingAssignments).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Règle unique d'éligibilité — N'utilise JAMAIS current_role.
 * Un utilisateur multi-profils (client+livreur, commercial+livreur, etc.)
 * est éligible dès qu'il a un profil livreur valide et qu'il est en ligne.
 */
function isDriverDispatchable(d) {
  return (
    d.driver_online === true &&
    d.profil_valide === true &&
    !d.livreur_bloque &&
    !d.livreur_suspendu &&
    d.disponible !== false &&
    (d.nombre_courses_actives || 0) < 2
  );
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

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const courseId = body.course_id || body.event?.entity_id;
    const forceDispatch = body.force === true;
    const excludeEmails = body.exclude_emails || [];

    if (!courseId) {
      return Response.json({ error: 'course_id manquant' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // ── 1. Mode dispatch ──────────────────────────────────────────────────
    const configs = await base44.asServiceRole.entities.DispatchConfig.list('-updated_date', 1);
    const mode = configs[0]?.mode || 'auto';

    if (mode === 'manuel' && !forceDispatch) {
      console.log('[Dispatch] BLOQUÉ — mode manuel');
      return Response.json({ success: false, blocked: true, reason: 'mode_manuel' });
    }

    // ── 2. Récupérer la course ─────────────────────────────────────────────
    const courses = await base44.asServiceRole.entities.Course.filter({ id: courseId });
    if (!courses || courses.length === 0) {
      return Response.json({ error: 'Course introuvable' }, { status: 404 });
    }
    const course = courses[0];

    const ELIGIBLE_STATUTS = ['en_attente', 'en_attente_dispatch', 'aucun_livreur', 'echec_dispatch'];
    if (!ELIGIBLE_STATUTS.includes(course.statut)) {
      return Response.json({ success: false, message: `Statut non éligible: ${course.statut}` });
    }

    // ── 3. Historique des livreurs déjà contactés ─────────────────────────
    let historique = [];
    try {
      if (course.historique_assignation) historique = JSON.parse(course.historique_assignation);
    } catch (_) {}

    const dejaContactes = new Set([
      ...excludeEmails,
      ...historique
        .filter(h => ['refuse', 'no_response'].includes(h.statut))
        .map(h => h.livreur_email),
    ]);

    // ── 4. Récupérer et filtrer les livreurs éligibles ────────────────────
    // ⚠️ Filtre SANS current_role — basé uniquement sur profil_valide + driver_online
    const allUsers = await base44.asServiceRole.entities.User.list('-updated_date', 500);
    const eligibles = allUsers.filter(d => isDriverDispatchable(d) && !dejaContactes.has(d.email));

    // Diagnostic détaillé (sans current_role)
    const onlineCount = allUsers.filter(d => d.driver_online).length;
    const validCount = allUsers.filter(d => d.driver_online && d.profil_valide).length;
    console.log(`[Dispatch] Total: ${allUsers.length} | driver_online: ${onlineCount} | profil_valide+online: ${validCount} | Éligibles: ${eligibles.length}`);

    const now = new Date().toISOString();

    // ── 5. Aucun livreur disponible ────────────────────────────────────────
    if (eligibles.length === 0) {
      let failReason = 'Aucun livreur disponible pour le moment';
      if (onlineCount === 0) {
        failReason = 'Aucun livreur connecté';
      } else if (validCount === 0) {
        failReason = `${onlineCount} livreur(s) connecté(s) mais aucun avec un profil livreur validé`;
      } else {
        const autresRaisons = allUsers
          .filter(d => d.driver_online && d.profil_valide && !dejaContactes.has(d.email))
          .map(d => {
            if (d.livreur_bloque) return 'bloqué';
            if (d.livreur_suspendu) return 'suspendu';
            if (d.disponible === false) return 'indisponible';
            if ((d.nombre_courses_actives || 0) >= 2) return 'occupé';
            return 'exclu';
          });
        const occupes = autresRaisons.filter(r => r === 'occupé').length;
        failReason = `${validCount} livreur(s) valide(s) mais tous occupés ou déjà contactés (${occupes} occupés)`;
      }

      console.log(`[Dispatch] ❌ ${failReason}`);

      historique.push({ heure: now, statut: 'aucun_livreur', raison: failReason });
      await base44.asServiceRole.entities.Course.update(courseId, {
        statut: 'aucun_livreur',
        nombre_tentatives: (course.nombre_tentatives || 0) + 1,
        historique_assignation: JSON.stringify(historique),
        dispatch_fail_reason: failReason,
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

      // Notification in-app + FCM push vers les admins
      await base44.asServiceRole.functions.invoke('sendCdlNotification', {
        role: 'admin',
        title: '🚨 Course sans livreur disponible',
        body: `${course.quartier_depart}→${course.quartier_arrivee} (${course.prix} F) — ${failReason}`,
        urgence: 'urgent',
        data: {
          type: 'no_driver_available',
          entity_id: courseId,
          role: 'admin',
          notif_route: '/dispatch-monitor',
        },
      }).catch(() => {});

      return Response.json({ success: false, reason: failReason, online: onlineCount, valides: validCount });
    }

    // ── 6. Trier par proximité GPS (puis note, puis charge) ───────────────
    const tries = sortByProximity(eligibles, course);
    const choisi = tries[0];

    if (course.latitude_depart && choisi.gps_latitude) {
      const dist = distanceKm(choisi.gps_latitude, choisi.gps_longitude, parseFloat(course.latitude_depart), parseFloat(course.longitude_depart));
      console.log(`[Dispatch] Livreur le plus proche: ${choisi.email} (${dist.toFixed(1)} km) | rôle actuel: ${choisi.current_role || 'non défini'}`);
    } else {
      console.log(`[Dispatch] Pas de GPS — premier éligible: ${choisi.email} | rôle actuel: ${choisi.current_role || 'non défini'}`);
    }

    // ── 7. Vérification finale atomique avant assignation ─────────────────
    const freshDrivers = await base44.asServiceRole.entities.User.filter({ email: choisi.email });
    const freshDriver = freshDrivers[0];
    if (!freshDriver || !isDriverDispatchable(freshDriver)) {
      console.log(`[Dispatch] ⚠️ Livreur ${choisi.email} n'est plus éligible (vérification finale) — relance sans lui`);
      return base44.asServiceRole.functions.invoke('autoDispatch', {
        course_id: courseId,
        exclude_emails: [...Array.from(dejaContactes), choisi.email],
        force: forceDispatch,
      }).then(r => r).catch(() =>
        Response.json({ success: false, reason: 'Livreur sélectionné non disponible à la confirmation' })
      );
    }

    // ── 8. Proposer au livreur choisi (timer 60s) ─────────────────────────
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
      mode_assignation: forceDispatch ? 'force' : 'auto',
      nombre_tentatives: (course.nombre_tentatives || 0) + 1,
      historique_assignation: JSON.stringify(historique),
      dispatch_fail_reason: null,
    });

    await base44.asServiceRole.entities.User.update(choisi.id, {
      nombre_courses_actives: (choisi.nombre_courses_actives || 0) + 1,
      courses_proposees: (choisi.courses_proposees || 0) + 1,
      derniere_proposition_at: now,
    }).catch(() => {});

    // Notifier le livreur (in-app — la FCM push est gérée par notifyCourseEvents)
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

    // Notifier le client (in-app)
    if (course.client_email) {
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: course.client_email,
        destinataire_role: 'client',
        titre: '🔍 Livreur trouvé !',
        message: `Un livreur a été contacté pour votre course. En attente de sa confirmation.`,
        type: 'info',
        lue: false,
        course_id: courseId,
        target_screen: `/course/${courseId}`,
        notification_key: `${course.client_email}__livreur_trouve__${courseId}`,
      }).catch(() => {});
    }

    // WhatsApp livreur (non bloquant)
    if (choisi.telephone) {
      base44.asServiceRole.functions.invoke('sendWhatsAppAlert', {
        eventType: 'driver_course_assigned',
        recipientRole: 'livreur',
        recipientName: choisi.full_name,
        recipientPhone: choisi.telephone,
        messageText: `🚨 Nouvelle course CDL ! ${course.quartier_depart}→${course.quartier_arrivee} — ${course.prix} FCFA. Ouvrez l'app pour accepter (60s).`,
        entityId: courseId,
        entityType: 'course',
        priority: 'urgent',
      }).catch(() => {});
    }

    console.log(`[Dispatch] ✅ ${courseId} → ${choisi.full_name} (${choisi.email}) | rôle actuel affiché: ${choisi.current_role || 'non défini'}`);

    return Response.json({
      success: true,
      livreur: { email: choisi.email, nom: choisi.full_name },
      eligibles_count: eligibles.length,
      mode,
    });

  } catch (error) {
    console.error('[Dispatch] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});