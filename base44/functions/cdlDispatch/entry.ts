/**
 * CDL — Moteur Dispatch Unique "Architecture Uber"
 *
 * PHILOSOPHIE :
 *   1. Backend récupère les livreurs éligibles
 *   2. Score GPS/distance simple
 *   3. Écrit la course avec livreur_email → realtime notifie les apps
 *   4. Push = alerte bonus SEULEMENT (jamais critique au dispatch)
 *
 * REMPLACE : autoDispatch, createSmartDispatch, reDispatch, dispatchProgressif
 *
 * SOURCE UNIQUE MODE : DispatchModeState (mode=auto|manuel)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── Statuts de course réellement actifs ──────────────────────────────────────
const ACTIVE_COURSE_STATUTS = new Set([
  'assignee_attente', 'acceptee', 'driver_en_route_pickup',
  'arrived_pickup', 'en_cours', 'arrived_dropoff',
]);

// ── Éligibilité livreur (critères unifiés) ────────────────────────────────────
function isEligible(driver, excluded = new Set(), realActiveCount = null) {
  if (excluded.has(driver.email)) return false;
  if (driver.driver_online !== true) return false;
  if (!driver.profil_valide && driver.statut_validation_livreur !== 'valide' && driver.statut_validation_livreur !== 'actif') return false;
  if (driver.livreur_bloque || driver.livreur_suspendu) return false;
  if (driver.disponible === false) return false;
  // Utiliser le vrai compteur BDD si disponible, sinon le champ User (fallback)
  const activeCount = realActiveCount !== null ? realActiveCount : (driver.nombre_courses_actives || 0);
  if (activeCount >= 2) return false;
  return true;
}

// ── Recalcul des vrais compteurs actifs depuis les courses ────────────────────
// Limité aux 100 dernières courses (les compteurs sont maintenant maintenus en BDD)
async function getRealActiveCountsFromDB(base44) {
  const courses = await base44.asServiceRole.entities.Course.list('-created_date', 100);
  const counts = {};
  for (const c of courses) {
    if (c.livreur_email && ACTIVE_COURSE_STATUTS.has(c.statut)) {
      counts[c.livreur_email] = (counts[c.livreur_email] || 0) + 1;
    }
  }
  return counts;
}

// ── Score simple GPS (comme Uber) ─────────────────────────────────────────────
function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function rankDrivers(drivers, course) {
  const hasGPS = course.latitude_depart && course.longitude_depart;
  const lat0 = parseFloat(course.latitude_depart || 0);
  const lng0 = parseFloat(course.longitude_depart || 0);

  return drivers
    .map(d => {
      let score = 100;
      if (hasGPS && d.gps_latitude && d.gps_longitude) {
        const dist = distKm(d.gps_latitude, d.gps_longitude, lat0, lng0);
        score -= Math.min(dist * 5, 80); // -5 pts par km, max -80
      }
      score += (d.note_moyenne || 0) * 2;
      score -= (d.nombre_courses_actives || 0) * 10;
      return { driver: d, score: Math.round(score) };
    })
    .sort((a, b) => b.score - a.score);
}

// ── Lecture mode dispatch ─────────────────────────────────────────────────────
async function getMode(base44) {
  const rows = await base44.asServiceRole.entities.DispatchModeState.list('-updated_date', 1).catch(() => []);
  return rows[0]?.mode === 'manuel' ? 'manuel' : 'auto';
}

// ── Handler principal ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const ts = new Date().toISOString();
  try {
    const body = await req.json();
    const courseId = body.course_id || body.event?.entity_id;
    const forceDispatch = body.force === true;
    const excludeEmails = body.exclude_emails || [];

    if (!courseId) {
      return Response.json({ error: 'course_id requis' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // ── 1. Vérifier le mode ───────────────────────────────────────────────────
    const mode = await getMode(base44);
    if (mode === 'manuel' && !forceDispatch) {
      console.log(`[CDL_DISPATCH] BLOCKED | mode=manuel | course=${courseId}`);
      return Response.json({ success: false, blocked: true, reason: 'mode_manuel', mode });
    }

    // ── 2. Charger la course ──────────────────────────────────────────────────
    const courses = await base44.asServiceRole.entities.Course.filter({ id: courseId });
    const course = courses?.[0];
    if (!course) {
      return Response.json({ error: 'Course introuvable' }, { status: 404 });
    }

    // GARDE : jamais dispatcher une course supprimée ou annulée
    if (course.is_deleted) {
      console.log(`[CDL_DISPATCH] BLOCKED — course is_deleted=true | course=${courseId}`);
      return Response.json({ success: false, message: 'Course supprimée, dispatch annulé' });
    }
    const ELIGIBLE_STATUTS = ['en_attente', 'aucun_livreur'];
    if (!ELIGIBLE_STATUTS.includes(course.statut)) {
      return Response.json({ success: false, message: `Statut non dispatchable: ${course.statut}` });
    }

    // ── 3. Historique exclusions ──────────────────────────────────────────────
    let historique = [];
    try { if (course.historique_assignation) historique = JSON.parse(course.historique_assignation); } catch (_) {}
    const excluded = new Set([
      ...excludeEmails,
      ...historique.filter(h => ['refuse', 'no_response', 'timeout'].includes(h.statut)).map(h => h.livreur_email),
    ]);

    // ── 4. Livreurs éligibles — vérification depuis la BDD (pas le cache User) ─
    const [allUsers, realCounts] = await Promise.all([
      base44.asServiceRole.entities.User.list('-updated_date', 300),
      getRealActiveCountsFromDB(base44),
    ]);

    // Corriger les compteurs divergents uniquement pour les livreurs éligibles actifs
    for (const d of allUsers) {
      if (!d.driver_online) continue; // ne pas corriger les hors-ligne inutilement
      const real = realCounts[d.email] || 0;
      const stored = d.nombre_courses_actives || 0;
      if (stored !== real) {
        base44.asServiceRole.entities.User.update(d.id, { nombre_courses_actives: real }).catch(() => {});
        d.nombre_courses_actives = real;
      }
    }

    const eligible = allUsers.filter(d => isEligible(d, excluded, realCounts[d.email] ?? null));

    console.log(`[CDL_DISPATCH] course=${courseId} | total=${allUsers.length} | online=${allUsers.filter(d=>d.driver_online).length} | eligible=${eligible.length}`);

    // ── 5. Aucun livreur ──────────────────────────────────────────────────────
    if (eligible.length === 0) {
      const onlineCount = allUsers.filter(d => d.driver_online).length;
      const reason = onlineCount === 0 ? 'Aucun livreur connecté' : 'Aucun livreur disponible';

      await base44.asServiceRole.entities.Course.update(courseId, {
        statut: 'aucun_livreur',
        nombre_tentatives: (course.nombre_tentatives || 0) + 1,
        historique_assignation: JSON.stringify([...historique, { heure: ts, statut: 'aucun_livreur', raison: reason }]),
      });

      // Notif admin
      await base44.asServiceRole.functions.invoke('sendCdlNotification', {
        role: 'admin',
        title: '🚨 Aucun livreur',
        body: `${course.quartier_depart}→${course.quartier_arrivee} — ${reason}`,
        data: { notif_route: '/dispatch-monitor' },
      }).catch(() => {});

      // Notif client
      if (course.client_email) {
        await base44.asServiceRole.entities.Notification.create({
          destinataire_email: course.client_email,
          destinataire_role: 'client',
          titre: 'Recherche livreur en cours',
          message: reason + ' — Réessai automatique sous peu.',
          type: 'warning', lue: false, course_id: courseId,
        }).catch(() => {});
      }

      return Response.json({ success: false, reason, eligible: 0, online: onlineCount });
    }

    // ── 6. Classement + sélection ─────────────────────────────────────────────
    const ranked = rankDrivers(eligible, course);
    const { driver: chosen, score } = ranked[0];

    // Vérification fraîcheur (atomique)
    const fresh = await base44.asServiceRole.entities.User.filter({ email: chosen.email });
    if (!fresh?.[0] || !isEligible(fresh[0])) {
      console.log(`[CDL_DISPATCH] Driver stale, retry | email=${chosen.email}`);
      return base44.asServiceRole.functions.invoke('cdlDispatch', {
        course_id: courseId,
        exclude_emails: [...Array.from(excluded), chosen.email],
        force: forceDispatch,
      }).then(r => r).catch(() => Response.json({ success: false, reason: 'driver_became_unavailable' }));
    }

    // ── 7. Assigner ───────────────────────────────────────────────────────────
    const now = new Date().toISOString();
    historique.push({
      livreur_email: chosen.email, livreur_nom: chosen.full_name,
      heure: now, statut: 'proposee', score,
    });

    await base44.asServiceRole.entities.Course.update(courseId, {
      statut: 'assignee_attente',
      livreur_email: chosen.email,
      livreur_name: chosen.full_name,
      telephone_livreur: chosen.telephone || '',
      heure_assignation: now,
      mode_assignation: mode === 'manuel' && forceDispatch ? 'manuel_force' : 'auto',
      nombre_tentatives: (course.nombre_tentatives || 0) + 1,
      historique_assignation: JSON.stringify(historique),
    });

    // Update driver stats
    await base44.asServiceRole.entities.User.update(chosen.id, {
      nombre_courses_actives: (chosen.nombre_courses_actives || 0) + 1,
      courses_proposees: (chosen.courses_proposees || 0) + 1,
      derniere_proposition_at: now,
    }).catch(() => {});

    // ── 8. Notifications (bonus, pas critiques) ───────────────────────────────
    // In-app notification livreur
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: chosen.email,
      destinataire_role: 'livreur',
      titre: '🛵 Nouvelle course !',
      message: `${course.quartier_depart} → ${course.quartier_arrivee} · ${course.prix || 0} FCFA · Répondez en 60s`,
      type: 'success', lue: false, course_id: courseId,
      target_screen: `/course-livreur/${courseId}`,
      target_entity_id: courseId, target_entity_type: 'course',
    }).catch(() => {});

    // Push FCM (alerte bonus — non critique)
    await base44.asServiceRole.functions.invoke('sendCdlNotification', {
      user_email: chosen.email,
      title: '📦 Nouvelle course',
      body: `${course.quartier_depart} → ${course.quartier_arrivee} (${course.prix || 0} F)`,
      data: { type: 'dispatch_offer', course_id: courseId, notif_route: `/course-livreur/${courseId}` },
    }).catch(() => {});

    // In-app client
    if (course.client_email) {
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: course.client_email,
        destinataire_role: 'client',
        titre: '🔍 Livreur trouvé',
        message: `Un livreur a été contacté — en attente de confirmation.`,
        type: 'info', lue: false, course_id: courseId,
        target_screen: `/course/${courseId}`,
      }).catch(() => {});
    }

    console.log(`[CDL_DISPATCH] OK | course=${courseId} | driver=${chosen.email} | score=${score} | eligible=${eligible.length}`);

    return Response.json({
      success: true,
      livreur: { email: chosen.email, nom: chosen.full_name, score },
      eligible_count: eligible.length,
      mode,
    });

  } catch (err) {
    console.error(`[CDL_DISPATCH] ERROR | ${err.message}`);
    return Response.json({ error: err.message }, { status: 500 });
  }
});