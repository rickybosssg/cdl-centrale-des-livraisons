/**
 * CDL — Moteur de dispatch backend (Deno)
 * 
 * RÈGLE ABSOLUE :
 * - Si mode = 'manuel' → AUCUN dispatch automatique (sauf force=true par admin)
 * - Anti-doublon : vérifier statut course avant assignation
 * - Un seul livreur proposé à la fois
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const ZONES_PROCHES = {
  "Ouaga 2000": ["Patte d'Oie", "Zone 1", "Kossodo", "Pissy"],
  "Zone 1": ["Koulouba", "Zogona", "Gounghin", "Ouaga 2000"],
  "Cissin": ["Karpala", "Wemtenga", "Dassasgho", "Zone 1"],
  "Karpala": ["Cissin", "Wemtenga", "Balkuy", "Dassasgho"],
  "Pissy": ["Gounghin", "Patte d'Oie", "Somgandé", "Ouaga 2000"],
  "Gounghin": ["Zone 1", "Pissy", "Zogona", "Tanghin"],
  "Tampouy": ["Tanghin", "Zogona", "Nagrin", "Koulouba"],
  "Tanghin": ["Tampouy", "Zogona", "Koulouba", "Gounghin"],
  "Zogona": ["Zone 1", "Tanghin", "Gounghin", "Koulouba"],
  "Koulouba": ["Zone 1", "Tanghin", "Zogona", "Tampouy"],
  "Kossodo": ["Ouaga 2000", "Nagrin", "Tampouy"],
  "Wemtenga": ["Cissin", "Karpala", "Dassasgho"],
  "Balkuy": ["Karpala", "Dassasgho", "Wemtenga"],
  "Dassasgho": ["Cissin", "Wemtenga", "Balkuy", "Karpala"],
  "Patte d'Oie": ["Ouaga 2000", "Pissy", "Somgandé"],
  "Somgandé": ["Patte d'Oie", "Pissy", "Ouaga 2000"],
  "Nagrin": ["Kossodo", "Tampouy", "Tanghin"],
};

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scoreDriver(driver, course) {
  // 1. DISTANCE (30 pts)
  let distScore = 0;
  if (driver.gps_latitude && driver.gps_longitude && course.latitude_depart && course.longitude_depart) {
    const dist = distanceKm(driver.gps_latitude, driver.gps_longitude, course.latitude_depart, course.longitude_depart);
    distScore = dist <= 1 ? 30 : dist <= 3 ? 24 : dist <= 5 ? 16 : dist <= 10 ? 9 : 3;
  } else {
    if (driver.quartier === course.quartier_depart) distScore = 24;
    else if (ZONES_PROCHES[course.quartier_depart]?.includes(driver.quartier)) distScore = 14;
    else distScore = 4;
  }

  // 2. PRIX COURSE (30 pts)
  let prixScore = 0;
  const prix = course.prix || 0;
  if (prix >= 3000) prixScore = 30;
  else if (prix >= 2000) prixScore = 24;
  else if (prix >= 1500) prixScore = 18;
  else if (prix >= 1000) prixScore = 12;
  else if (prix >= 500) prixScore = 6;
  else prixScore = 2;

  // 3. PERFORMANCE (20 pts)
  let perfScore = 10;
  const note = driver.note_moyenne || 0;
  if (note >= 4.5) perfScore = 20;
  else if (note >= 4.0) perfScore = 16;
  else if (note >= 3.5) perfScore = 12;
  else if (note > 0) perfScore = 8;

  // 4. TAUX ACCEPTATION (10 pts)
  let acceptScore = 5;
  const proposees = driver.courses_proposees || 0;
  const acceptees = driver.courses_acceptees || (driver.total_courses_livrees || 0);
  if (proposees >= 5) {
    const taux = acceptees / proposees;
    acceptScore = taux >= 0.8 ? 10 : taux >= 0.6 ? 7 : taux >= 0.4 ? 4 : 1;
  }

  // 5. INACTIVITÉ (10 pts)
  let inactiviteScore = 5;
  const actives = driver.nombre_courses_actives || 0;
  if (actives > 0) inactiviteScore = Math.max(0, inactiviteScore - actives * 2);
  if (driver.derniere_course_attribuee_at) {
    const heures = (Date.now() - new Date(driver.derniere_course_attribuee_at).getTime()) / 3600000;
    inactiviteScore = Math.min(10, inactiviteScore + (heures >= 2 ? 5 : heures >= 1 ? 3 : 1));
  } else {
    inactiviteScore = 10;
  }

  let total = distScore + prixScore + perfScore + acceptScore + inactiviteScore;

  // URGENCE
  const urgence = course.urgence || course.niveau_urgence;
  if (urgence === 'tres_urgent') total += 20;
  else if (urgence === 'urgent') total += 10;

  // PÉNALITÉS
  const refusConsecutifs = driver.courses_refusees_consecutives || 0;
  if (refusConsecutifs >= 3) total = Math.round(total * 0.7);
  if (proposees >= 5 && acceptees / proposees < 0.4) total = Math.round(total * 0.8);

  return total;
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

    // ── 1. Vérification mode dispatch ──────────────────────────────────────
    const configs = await base44.asServiceRole.entities.DispatchConfig.list('-updated_date', 1);
    const config = configs[0] || { mode: 'auto' };
    const mode = config.mode || 'auto';

    console.log(`[Dispatch] MODE: ${mode.toUpperCase()}${forceDispatch ? ' (FORCÉ)' : ''}`);

    if (mode === 'manuel' && !forceDispatch) {
      console.log('[Dispatch] BLOQUÉ — mode manuel actif');
      return Response.json({ success: false, blocked: true, reason: 'mode_manuel' });
    }

    // ── 2. Récupérer la course — vérification anti-doublon ─────────────────
    const courses = await base44.asServiceRole.entities.Course.filter({ id: courseId });
    if (!courses || courses.length === 0) {
      return Response.json({ error: 'Course introuvable' }, { status: 404 });
    }
    const course = courses[0];

    // Statuts éligibles au dispatch
    const ELIGIBLE_STATUTS = ['en_attente', 'aucun_livreur', 'en_attente_dispatch', 'echec_dispatch'];
    if (!ELIGIBLE_STATUTS.includes(course.statut)) {
      console.log(`[Dispatch] Course non éligible — statut: ${course.statut}`);
      return Response.json({ success: false, message: `Statut non éligible: ${course.statut}`, statut: course.statut });
    }

    // ── 3. Récupérer livreurs éligibles ────────────────────────────────────
    const [allDrivers, activeProfiles] = await Promise.all([
      base44.asServiceRole.entities.User.filter({ user_type: 'livreur' }),
      base44.asServiceRole.entities.UserProfile.filter({ profile_type: 'livreur', status: 'actif', deleted: false }),
    ]);
    const validEmails = new Set(activeProfiles.map(p => p.user_email));

    // Historique des livreurs contactés pour cette course
    let historique = [];
    try {
      if (course.historique_assignation) historique = JSON.parse(course.historique_assignation);
    } catch (_) {}
    const dejaContactes = new Set([
      ...excludeEmails,
      ...historique.filter(h => ['refuse', 'no_response'].includes(h.statut)).map(h => h.livreur_email),
    ]);

    const eligibles = allDrivers.filter(d =>
      d.disponible &&
      !d.livreur_bloque &&
      d.actif !== false &&
      validEmails.has(d.email) &&
      (d.nombre_courses_actives || 0) < 3 &&
      !dejaContactes.has(d.email) &&
      (d.quartier || d.gps_latitude)
    );

    const now = new Date().toISOString();

    // ── 4. Aucun livreur disponible — Mode attrape-course ou échec ──────────
    if (eligibles.length === 0) {
      // MODE ATTRAPE-COURSE (urgent/tres_urgent ou force) : envoyer à tous les livreurs en ligne
      const urgence = course.urgence || course.niveau_urgence;
      const attrapeMode = forceDispatch || urgence === 'tres_urgent';

      // Notifier livreurs OFFLINE pour les inciter à se connecter
      const allOnlineDrivers = await base44.asServiceRole.entities.User.filter({ user_type: 'livreur', disponible: true });
      if (allOnlineDrivers.length > 0) {
        // Il y a des livreurs en ligne mais non éligibles (trop occupés etc.)
        for (const d of allOnlineDrivers.slice(0, 5)) {
          await base44.asServiceRole.entities.Notification.create({
            destinataire_email: d.email,
            destinataire_role: 'livreur',
            titre: '💰 Course disponible !',
            message: `Course ${course.quartier_depart}→${course.quartier_arrivee} — ${course.prix} FCFA. Libérez-vous pour l'accepter !`,
            type: 'info',
            lue: false,
            course_id: courseId,
          }).catch(() => {});
        }
      } else {
        // Aucun livreur en ligne — notifier les livreurs offline
        const offlineDrivers = await base44.asServiceRole.entities.User.filter({ user_type: 'livreur', disponible: false });
        const targets = offlineDrivers.filter(d => !d.livreur_bloque && validEmails.has(d.email)).slice(0, 10);
        for (const d of targets) {
          await base44.asServiceRole.entities.Notification.create({
            destinataire_email: d.email,
            destinataire_role: 'livreur',
            titre: '💰 Courses disponibles — Connecte-toi !',
            message: `Plusieurs courses en attente dans ta zone. Prix jusqu'à ${course.prix} FCFA. Connecte-toi maintenant !`,
            type: 'info',
            lue: false,
          }).catch(() => {});
        }
      }

      historique.push({ heure: now, statut: 'aucun_livreur', message: 'Aucun livreur éligible' });
      await base44.asServiceRole.entities.Course.update(courseId, {
        statut: 'aucun_livreur',
        nombre_tentatives: (course.nombre_tentatives || 0) + 1,
        historique_assignation: JSON.stringify(historique),
      });
      // Notifier client
      if (course.client_email) {
        await base44.asServiceRole.entities.Notification.create({
          destinataire_email: course.client_email,
          destinataire_role: 'client',
          titre: '😔 Aucun livreur disponible',
          message: 'Aucun livreur n\'est disponible pour le moment. Augmentez le prix ou réessayez plus tard.',
          type: 'warning',
          lue: false,
          course_id: courseId,
          target_screen: `/course/${courseId}`,
        }).catch(() => {});
      }
      // Notifier admins
      const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
      for (const admin of admins.slice(0, 3)) {
        await base44.asServiceRole.entities.Notification.create({
          destinataire_email: admin.email,
          destinataire_role: 'admin',
          titre: '🚨 Échec dispatch',
          message: `Course ${course.quartier_depart}→${course.quartier_arrivee} sans livreur (${course.nombre_tentatives || 0} tentatives). Prix: ${course.prix} FCFA.`,
          type: 'danger',
          lue: false,
          course_id: courseId,
          target_screen: `/dispatch-monitor`,
        }).catch(() => {});
      }
      return Response.json({ success: false, message: 'Aucun livreur disponible' });
    }

    // ── 5. Scorer et choisir le(s) meilleur(s) ────────────────────────────
    // Dispatch par rayon progressif si GPS disponible
    let candidates = eligibles;
    if (course.latitude_depart && course.longitude_depart) {
      for (const rayon of [3, 5, 10]) {
        const dansRayon = eligibles.filter(d =>
          d.gps_latitude && d.gps_longitude &&
          distanceKm(d.gps_latitude, d.gps_longitude, course.latitude_depart, course.longitude_depart) <= rayon
        );
        if (dansRayon.length > 0) { candidates = dansRayon; break; }
      }
    }

    const scored = candidates
      .map(d => ({ driver: d, score: scoreDriver(d, course) }))
      .sort((a, b) => b.score - a.score);

    const urgence = course.urgence || course.niveau_urgence;
    const attrapeMode = forceDispatch || urgence === 'tres_urgent' || (course.nombre_tentatives || 0) >= 3;

    // ── MODE ATTRAPE-COURSE : envoyer à plusieurs en simultané ─────────────
    if (attrapeMode && scored.length >= 2) {
      const topN = scored.slice(0, Math.min(5, scored.length));
      const expireAt = new Date(Date.now() + 90000).toISOString();
      const histEntry = topN.map(({ driver, score }) => ({
        livreur_email: driver.email,
        livreur_nom: driver.full_name,
        heure: now,
        heure_expiration: expireAt,
        statut: 'attrape_proposee',
        score,
      }));
      historique.push(...histEntry);

      // Remettre en en_attente pour que le premier à accepter gagne
      await base44.asServiceRole.entities.Course.update(courseId, {
        statut: 'en_attente',
        livreur_email: '',
        livreur_name: '',
        heure_assignation: now,
        mode_assignation: 'attrape_course',
        nombre_tentatives: (course.nombre_tentatives || 0) + 1,
        historique_assignation: JSON.stringify(historique),
      });

      // Notifier tous les top N livreurs
      for (const { driver, score } of topN) {
        await base44.asServiceRole.entities.Notification.create({
          destinataire_email: driver.email,
          destinataire_role: 'livreur',
          titre: '🏆 Course disponible — Premier arrivé !',
          message: `ATTRAPE-COURSE : ${course.quartier_depart} → ${course.quartier_arrivee}. ${course.type_colis}. Prix: ${course.prix} FCFA. Premier à accepter gagne !`,
          type: 'success',
          lue: false,
          course_id: courseId,
          target_screen: `/courses-disponibles`,
        }).catch(() => {});
        if (driver.telephone) {
          base44.asServiceRole.functions.invoke('sendWhatsAppAlert', {
            eventType: 'attrape_course',
            recipientRole: 'livreur',
            recipientName: driver.full_name,
            recipientPhone: driver.telephone,
            messageText: `🏆 ATTRAPE-COURSE ! ${course.quartier_depart}→${course.quartier_arrivee} — ${course.prix} FCFA. Premier à accepter gagne sur l'app CDL !`,
            entityId: courseId,
            entityType: 'course',
            priority: 'urgent',
          }).catch(() => {});
        }
      }

      console.log(`[Dispatch] ⚡ MODE ATTRAPE-COURSE — course ${courseId} envoyée à ${topN.length} livreurs`);
      return Response.json({
        success: true,
        mode: 'attrape_course',
        livreurs: topN.map(({ driver, score }) => ({ email: driver.email, nom: driver.full_name, score })),
      });
    }

    const best = scored[0].driver;

    // ── 6. Proposer au meilleur livreur (1 seul à la fois) ─────────────────
    const expireAt = new Date(Date.now() + 60000).toISOString();
    historique.push({
      livreur_email: best.email,
      livreur_nom: best.full_name,
      heure: now,
      heure_expiration: expireAt,
      statut: 'proposee',
      score: scored[0].score,
    });

    await base44.asServiceRole.entities.Course.update(courseId, {
      statut: 'assignee_attente',
      livreur_email: best.email,
      livreur_name: best.full_name,
      telephone_livreur: best.telephone || '',
      heure_assignation: now,
      mode_assignation: forceDispatch ? 'force' : 'auto',
      nombre_tentatives: (course.nombre_tentatives || 0) + 1,
      historique_assignation: JSON.stringify(historique),
    });

    // Métriques livreur
    await base44.asServiceRole.entities.User.update(best.id, {
      nombre_courses_actives: (best.nombre_courses_actives || 0) + 1,
      courses_proposees: (best.courses_proposees || 0) + 1,
      derniere_proposition_at: now,
    });

    // Notifier le livreur
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: best.email,
      destinataire_role: 'livreur',
      titre: '🛵 Nouvelle course disponible !',
      message: `Course de ${course.quartier_depart} → ${course.quartier_arrivee}. ${course.type_colis}. Prix: ${course.prix} FCFA. Vous avez 60 secondes.`,
      type: 'success',
      lue: false,
      course_id: courseId,
      target_screen: `/course-livreur/${courseId}`,
      target_entity_id: courseId,
      target_entity_type: 'course',
    }).catch(() => {});

    // WA livreur (non bloquant)
    if (best.telephone) {
      base44.asServiceRole.functions.invoke('sendWhatsAppAlert', {
        eventType: 'driver_course_assigned',
        recipientRole: 'livreur',
        recipientName: best.full_name,
        recipientPhone: best.telephone,
        messageText: `🚨 Nouvelle course ! ${course.quartier_depart}→${course.quartier_arrivee} — ${course.prix} FCFA. Ouvrez CDL pour accepter (60s).`,
        entityId: courseId,
        entityType: 'course',
        priority: 'urgent',
      }).catch(() => {});
    }

    console.log(`[Dispatch] ✅ Course ${courseId} → ${best.full_name} (score: ${scored[0].score})`);

    return Response.json({
      success: true,
      livreur: { email: best.email, nom: best.full_name, score: scored[0].score },
      mode,
    });

  } catch (error) {
    console.error('[Dispatch] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});