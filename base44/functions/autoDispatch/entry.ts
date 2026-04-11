/**
 * CDL — Moteur de dispatch backend (Deno) v2
 *
 * CRITÈRES LIVREUR DISPATCHABLE (identiques dashboard + moteur) :
 *   1. driver_online = true
 *   2. current_role = "livreur"
 *   3. profil livreur actif (UserProfile.status = actif)
 *   4. !livreur_bloque
 *   5. nombre_courses_actives < 3
 *   6. GPS valide (gps_latitude && gps_longitude) OU quartier connu
 *   7. pas déjà contacté pour cette course
 *
 * DIAGNOSTIC : logs détaillés à chaque étape du filtrage.
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

  const urgence = course.urgence || course.niveau_urgence;
  if (urgence === 'tres_urgent') total += 20;
  else if (urgence === 'urgent') total += 10;

  const refusConsecutifs = driver.courses_refusees_consecutives || 0;
  if (refusConsecutifs >= 3) total = Math.round(total * 0.7);
  if (proposees >= 5 && acceptees / proposees < 0.4) total = Math.round(total * 0.8);

  return total;
}

/**
 * Diagnostic détaillé : pourquoi un livreur n'est pas dispatchable.
 */
function diagnosDriver(d, validEmails, dejaContactes) {
  if (!d.driver_online) return 'driver_online=false';
  if (d.current_role !== 'livreur') return `current_role=${d.current_role || 'null'} (pas livreur)`;
  if (d.livreur_bloque) return 'livreur_bloque=true';
  if (!validEmails.has(d.email)) return 'profil_livreur_inactif_ou_absent';
  if ((d.nombre_courses_actives || 0) >= 3) return `trop_occupe(${d.nombre_courses_actives} courses)`;
  if (dejaContactes.has(d.email)) return 'deja_contacte';
  if (!d.gps_latitude && !d.gps_longitude && !d.quartier) return 'pas_gps_ni_quartier';
  return 'ok';
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

    // ── 1. Vérification mode dispatch ─────────────────────────────────────
    const configs = await base44.asServiceRole.entities.DispatchConfig.list('-updated_date', 1);
    const config = configs[0] || { mode: 'auto' };
    const mode = config.mode || 'auto';

    console.log(`[Dispatch] MODE: ${mode.toUpperCase()}${forceDispatch ? ' (FORCÉ)' : ''}`);

    if (mode === 'manuel' && !forceDispatch) {
      console.log('[Dispatch] BLOQUÉ — mode manuel actif');
      return Response.json({ success: false, blocked: true, reason: 'mode_manuel' });
    }

    // ── 2. Récupérer la course ─────────────────────────────────────────────
    const courses = await base44.asServiceRole.entities.Course.filter({ id: courseId });
    if (!courses || courses.length === 0) {
      return Response.json({ error: 'Course introuvable' }, { status: 404 });
    }
    const course = courses[0];

    const ELIGIBLE_STATUTS = ['en_attente', 'aucun_livreur', 'en_attente_dispatch', 'echec_dispatch'];
    if (!ELIGIBLE_STATUTS.includes(course.statut)) {
      console.log(`[Dispatch] Course non éligible — statut: ${course.statut}`);
      return Response.json({ success: false, message: `Statut non éligible: ${course.statut}`, statut: course.statut });
    }

    // ── 3. Validation GPS de la course ─────────────────────────────────────
    const hasGPS = course.latitude_depart && course.longitude_depart &&
      !isNaN(parseFloat(course.latitude_depart)) && !isNaN(parseFloat(course.longitude_depart));
    const hasQuartier = !!(course.quartier_depart);

    if (!hasGPS && !hasQuartier) {
      const reason = 'Impossible de rechercher un livreur : position de départ invalide (coordonnées et quartier manquants)';
      console.error(`[Dispatch] ❌ ${reason}`);
      await base44.asServiceRole.entities.Course.update(courseId, {
        statut: 'aucun_livreur',
        historique_assignation: JSON.stringify([{ heure: new Date().toISOString(), statut: 'echec', raison: reason }]),
      });
      return Response.json({ success: false, reason: 'missing_coordinates', message: reason });
    }

    if (!hasGPS) {
      console.warn(`[Dispatch] ⚠️ Pas de GPS pour la course — dispatch par quartier uniquement (${course.quartier_depart})`);
    }

    // ── 4. Récupérer TOUS les livreurs + profils valides ──────────────────
    const [allDrivers, activeProfiles] = await Promise.all([
      base44.asServiceRole.entities.User.list('-updated_date', 500),
      base44.asServiceRole.entities.UserProfile.filter({ profile_type: 'livreur', status: 'actif', deleted: false }),
    ]);
    const validEmails = new Set(activeProfiles.map(p => p.user_email));

    // Historique des livreurs déjà contactés
    let historique = [];
    try {
      if (course.historique_assignation) historique = JSON.parse(course.historique_assignation);
    } catch (_) {}
    const dejaContactes = new Set([
      ...excludeEmails,
      ...historique.filter(h => ['refuse', 'no_response'].includes(h.statut)).map(h => h.livreur_email),
    ]);

    // ── 5. Filtrage DÉTAILLÉ — une seule définition "dispatchable" ─────────
    const total = allDrivers.length;

    const apresOnline = allDrivers.filter(d => d.driver_online);
    const apresRole = apresOnline.filter(d => d.current_role === 'livreur');
    const apresBloque = apresRole.filter(d => !d.livreur_bloque);
    const apresProfile = apresBloque.filter(d => validEmails.has(d.email));
    const apresOccupe = apresProfile.filter(d => (d.nombre_courses_actives || 0) < 3);
    const apresDejaContact = apresOccupe.filter(d => !dejaContactes.has(d.email));
    const apresGPS = apresDejaContact.filter(d => d.gps_latitude || d.gps_longitude || d.quartier);

    console.log(`[Dispatch] ── FILTRAGE LIVREURS ──`);
    console.log(`[Dispatch]   Total drivers en BDD       : ${total}`);
    console.log(`[Dispatch]   Après driver_online=true   : ${apresOnline.length}`);
    console.log(`[Dispatch]   Après current_role=livreur : ${apresRole.length}`);
    console.log(`[Dispatch]   Après !livreur_bloque      : ${apresBloque.length}`);
    console.log(`[Dispatch]   Après profil actif         : ${apresProfile.length}`);
    console.log(`[Dispatch]   Après <3 courses actives   : ${apresOccupe.length}`);
    console.log(`[Dispatch]   Après non déjà contacté    : ${apresDejaContact.length}`);
    console.log(`[Dispatch]   Après GPS/quartier valide  : ${apresGPS.length}`);
    console.log(`[Dispatch]   Candidats finaux           : ${apresGPS.length}`);

    // Diagnostic détaillé si 0 candidats
    if (apresGPS.length === 0) {
      const diagDetails = allDrivers.slice(0, 20).map(d => ({
        email: d.email,
        nom: d.full_name,
        raison: diagnosDriver(d, validEmails, dejaContactes),
        driver_online: d.driver_online,
        current_role: d.current_role,
        gps: !!(d.gps_latitude && d.gps_longitude),
        quartier: d.quartier,
      }));

      let failReason = 'Aucun livreur dispatchable trouvé actuellement';
      if (apresOnline.length === 0) failReason = 'Aucun livreur en ligne (driver_online=false)';
      else if (apresRole.length === 0) failReason = `Livreurs en ligne détectés (${apresOnline.length}) mais aucun avec current_role=livreur`;
      else if (apresBloque.length === 0) failReason = `Livreurs avec bon rôle (${apresRole.length}) mais tous bloqués`;
      else if (apresProfile.length === 0) failReason = `Livreurs non bloqués (${apresBloque.length}) mais aucun profil livreur actif`;
      else if (apresOccupe.length === 0) failReason = `Livreurs éligibles (${apresProfile.length}) mais tous occupés (≥3 courses actives)`;
      else if (apresDejaContact.length === 0) failReason = `Livreurs disponibles (${apresOccupe.length}) mais tous déjà contactés pour cette course`;
      else if (apresGPS.length === 0) failReason = `Livreurs disponibles (${apresDejaContact.length}) mais sans GPS ni quartier`;

      console.error(`[Dispatch] ❌ ÉCHEC — ${failReason}`);
      console.log(`[Dispatch] Diagnostic drivers:`, JSON.stringify(diagDetails));

      const now = new Date().toISOString();
      historique.push({
        heure: now,
        statut: 'aucun_livreur',
        raison: failReason,
        diagnostic: {
          total,
          online: apresOnline.length,
          bon_role: apresRole.length,
          non_bloque: apresBloque.length,
          profil_actif: apresProfile.length,
          non_occupe: apresOccupe.length,
          non_contacte: apresDejaContact.length,
          avec_gps_quartier: apresGPS.length,
        },
      });

      await base44.asServiceRole.entities.Course.update(courseId, {
        statut: 'aucun_livreur',
        nombre_tentatives: (course.nombre_tentatives || 0) + 1,
        historique_assignation: JSON.stringify(historique),
        dispatch_fail_reason: failReason,
      });

      // Notifier client avec message précis
      if (course.client_email) {
        await base44.asServiceRole.entities.Notification.create({
          destinataire_email: course.client_email,
          destinataire_role: 'client',
          titre: '😔 Aucun livreur disponible',
          message: failReason + ' — Augmentez le prix ou réessayez dans quelques minutes.',
          type: 'warning',
          lue: false,
          course_id: courseId,
          target_screen: `/course/${courseId}`,
        }).catch(() => {});
      }

      // Notifier admins avec diagnostic complet
      const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
      for (const admin of admins.slice(0, 3)) {
        await base44.asServiceRole.entities.Notification.create({
          destinataire_email: admin.email,
          destinataire_role: 'admin',
          titre: '🚨 Échec dispatch — ' + failReason.slice(0, 60),
          message: `Course ${course.quartier_depart}→${course.quartier_arrivee} (${course.prix} FCFA). ${failReason}. En ligne: ${apresOnline.length}, bon rôle: ${apresRole.length}, profil actif: ${apresProfile.length}, disponibles: ${apresOccupe.length}.`,
          type: 'danger',
          lue: false,
          course_id: courseId,
          target_screen: `/dispatch-monitor`,
        }).catch(() => {});
      }

      return Response.json({
        success: false,
        reason: failReason,
        diagnostic: {
          total, online: apresOnline.length, bon_role: apresRole.length,
          non_bloque: apresBloque.length, profil_actif: apresProfile.length,
          non_occupe: apresOccupe.length, non_contacte: apresDejaContact.length,
          avec_gps_quartier: apresGPS.length,
        },
      });
    }

    // ── 6. Filtrage par rayon GPS progressif ──────────────────────────────
    let candidates = apresGPS;
    if (hasGPS) {
      const lat = parseFloat(course.latitude_depart);
      const lng = parseFloat(course.longitude_depart);
      let rayonUsed = null;

      for (const rayon of [3, 5, 10, 15]) {
        const dansRayon = apresGPS.filter(d =>
          d.gps_latitude && d.gps_longitude &&
          distanceKm(d.gps_latitude, d.gps_longitude, lat, lng) <= rayon
        );
        console.log(`[Dispatch]   Rayon ${rayon}km : ${dansRayon.length} livreur(s)`);
        if (dansRayon.length > 0) {
          candidates = dansRayon;
          rayonUsed = rayon;
          break;
        }
      }

      if (rayonUsed === null) {
        // Tous hors rayon — utiliser ceux avec quartier compatible
        const parQuartier = apresGPS.filter(d =>
          !d.gps_latitude && (d.quartier === course.quartier_depart ||
            ZONES_PROCHES[course.quartier_depart]?.includes(d.quartier))
        );
        console.log(`[Dispatch]   Hors rayon GPS — par quartier : ${parQuartier.length} livreur(s)`);
        if (parQuartier.length > 0) {
          candidates = parQuartier;
        } else {
          // Dernier recours : tous les dispatchables malgré la distance
          console.warn('[Dispatch]   ⚠️ Tous hors rayon — dispatch sur tous les dispatchables');
          candidates = apresGPS;
        }
      }
    }

    console.log(`[Dispatch]   Candidats après filtrage rayon : ${candidates.length}`);

    // ── 7. Scorer et choisir ──────────────────────────────────────────────
    const scored = candidates
      .map(d => ({ driver: d, score: scoreDriver(d, course) }))
      .sort((a, b) => b.score - a.score);

    const now = new Date().toISOString();
    const urgence = course.urgence || course.niveau_urgence;
    const attrapeMode = forceDispatch || urgence === 'tres_urgent' || (course.nombre_tentatives || 0) >= 3;

    // ── MODE ATTRAPE-COURSE ───────────────────────────────────────────────
    if (attrapeMode && scored.length >= 2) {
      const topN = scored.slice(0, Math.min(5, scored.length));
      const expireAt = new Date(Date.now() + 90000).toISOString();
      const histEntry = topN.map(({ driver, score }) => ({
        livreur_email: driver.email, livreur_nom: driver.full_name,
        heure: now, heure_expiration: expireAt, statut: 'attrape_proposee', score,
      }));
      historique.push(...histEntry);

      await base44.asServiceRole.entities.Course.update(courseId, {
        statut: 'en_attente',
        livreur_email: '', livreur_name: '', heure_assignation: now,
        mode_assignation: 'attrape_course',
        nombre_tentatives: (course.nombre_tentatives || 0) + 1,
        historique_assignation: JSON.stringify(historique),
        dispatch_fail_reason: null,
      });

      for (const { driver } of topN) {
        await base44.asServiceRole.entities.Notification.create({
          destinataire_email: driver.email,
          destinataire_role: 'livreur',
          titre: '🏆 Course disponible — Premier arrivé !',
          message: `ATTRAPE-COURSE : ${course.quartier_depart} → ${course.quartier_arrivee}. ${course.type_colis}. Prix: ${course.prix} FCFA.`,
          type: 'success', lue: false, course_id: courseId,
          target_screen: `/courses-disponibles`,
        }).catch(() => {});
      }

      console.log(`[Dispatch] ⚡ ATTRAPE-COURSE — ${courseId} → ${topN.length} livreurs`);
      return Response.json({ success: true, mode: 'attrape_course', livreurs: topN.map(({ driver, score }) => ({ email: driver.email, nom: driver.full_name, score })) });
    }

    // ── DISPATCH NORMAL — 1 livreur ───────────────────────────────────────
    const best = scored[0].driver;
    const expireAt = new Date(Date.now() + 60000).toISOString();
    historique.push({
      livreur_email: best.email, livreur_nom: best.full_name,
      heure: now, heure_expiration: expireAt, statut: 'proposee', score: scored[0].score,
    });

    await base44.asServiceRole.entities.Course.update(courseId, {
      statut: 'assignee_attente',
      livreur_email: best.email, livreur_name: best.full_name,
      telephone_livreur: best.telephone || '',
      heure_assignation: now,
      mode_assignation: forceDispatch ? 'force' : 'auto',
      nombre_tentatives: (course.nombre_tentatives || 0) + 1,
      historique_assignation: JSON.stringify(historique),
      dispatch_fail_reason: null,
    });

    await base44.asServiceRole.entities.User.update(best.id, {
      nombre_courses_actives: (best.nombre_courses_actives || 0) + 1,
      courses_proposees: (best.courses_proposees || 0) + 1,
      derniere_proposition_at: now,
    }).catch(() => {});

    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: best.email,
      destinataire_role: 'livreur',
      titre: '🛵 Nouvelle course disponible !',
      message: `Course de ${course.quartier_depart} → ${course.quartier_arrivee}. ${course.type_colis}. Prix: ${course.prix} FCFA. Vous avez 60 secondes.`,
      type: 'success', lue: false, course_id: courseId,
      target_screen: `/course-livreur/${courseId}`,
      target_entity_id: courseId, target_entity_type: 'course',
    }).catch(() => {});

    if (best.telephone) {
      base44.asServiceRole.functions.invoke('sendWhatsAppAlert', {
        eventType: 'driver_course_assigned', recipientRole: 'livreur',
        recipientName: best.full_name, recipientPhone: best.telephone,
        messageText: `🚨 Nouvelle course ! ${course.quartier_depart}→${course.quartier_arrivee} — ${course.prix} FCFA. Ouvrez CDL (60s).`,
        entityId: courseId, entityType: 'course', priority: 'urgent',
      }).catch(() => {});
    }

    console.log(`[Dispatch] ✅ Course ${courseId} → ${best.full_name} (score: ${scored[0].score})`);

    return Response.json({
      success: true,
      livreur: { email: best.email, nom: best.full_name, score: scored[0].score },
      mode,
      diagnostic: {
        total, online: apresOnline.length, bon_role: apresRole.length,
        profil_actif: apresProfile.length, candidats: candidates.length,
      },
    });

  } catch (error) {
    console.error('[Dispatch] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});