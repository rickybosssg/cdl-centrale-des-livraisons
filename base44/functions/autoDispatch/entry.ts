import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Carte des zones proches à Ouagadougou
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

function scoreDriver(driver, course, zoneBoost = 0) {
  // ── SCORING INTELLIGENT (100 pts base + bonus/pénalités) ─────────────────
  // 40% distance | 30% taux acceptation | 20% temps réponse | 10% activité

  // ── 1. DISTANCE (40 pts max) ─────────────────────────────────────────
  let distScore = 0;
  if (driver.gps_latitude && driver.gps_longitude && course.latitude_depart && course.longitude_depart) {
    const dist = distanceKm(driver.gps_latitude, driver.gps_longitude, course.latitude_depart, course.longitude_depart);
    if (dist <= 1)       distScore = 40;
    else if (dist <= 3)  distScore = 32;
    else if (dist <= 5)  distScore = 22;
    else if (dist <= 10) distScore = 12;
    else                 distScore = 4;
  } else {
    if (driver.quartier === course.quartier_depart)                              distScore = 30;
    else if (ZONES_PROCHES[course.quartier_depart]?.includes(driver.quartier))  distScore = 18;
    else                                                                          distScore = 8;
  }

  // ── 2. TAUX D'ACCEPTATION (30 pts max) ───────────────────────────────
  let acceptScore = 0;
  const proposees = driver.courses_proposees || 0;
  const acceptees = driver.courses_acceptees || (driver.total_courses_livrees || 0);
  const taux = proposees > 0 ? Math.min(acceptees / proposees, 1) : null;

  if (taux !== null) {
    acceptScore = Math.round(taux * 30);
  } else if (acceptees > 0) {
    acceptScore = 20;
  } else {
    acceptScore = 15; // nouveau livreur : neutre
  }

  // ── 3. TEMPS DE RÉPONSE (20 pts max) ─────────────────────────────────
  let reponseScore = 0;
  const tempsReponseMoyen = driver.temps_reponse_moyen_sec || null;
  if (tempsReponseMoyen !== null) {
    if (tempsReponseMoyen <= 15)       reponseScore = 20;
    else if (tempsReponseMoyen <= 30)  reponseScore = 16;
    else if (tempsReponseMoyen <= 45)  reponseScore = 12;
    else if (tempsReponseMoyen <= 60)  reponseScore = 8;
    else                               reponseScore = 4;
  } else {
    reponseScore = 10;
  }

  // ── 4. ACTIVITÉ RÉCENTE + DISPONIBILITÉ (10 pts max) ───────────────────
  let activiteScore = 0;
  const derniereActivite = driver.derniere_course_attribuee_at || driver.updated_date;
  if (derniereActivite) {
    const heuresDepuis = (Date.now() - new Date(derniereActivite).getTime()) / 3600000;
    if (heuresDepuis <= 1)       activiteScore = 10;
    else if (heuresDepuis <= 4)  activiteScore = 8;
    else if (heuresDepuis <= 12) activiteScore = 5;
    else if (heuresDepuis <= 24) activiteScore = 3;
    else                         activiteScore = 1;
  } else {
    activiteScore = 5;
  }

  // Bonus disponibilité continue : livreur en ligne depuis longtemps sans course
  if (driver.en_ligne_depuis) {
    const heuresEnLigne = (Date.now() - new Date(driver.en_ligne_depuis).getTime()) / 3600000;
    if (heuresEnLigne >= 1 && (driver.nombre_courses_actives || 0) === 0) {
      activiteScore = Math.min(activiteScore + 3, 10); // attend depuis + de 1h sans course
    }
  }

  let baseScore = distScore + acceptScore + reponseScore + activiteScore;

  // ── BONUS PERFORMANCE (comportement excellent) ──────────────────────────
  if (taux !== null && taux >= 0.8) baseScore += 15;          // taux acceptation > 80%
  if (tempsReponseMoyen !== null && tempsReponseMoyen < 30) baseScore += 10; // réponse rapide
  if ((driver.note_moyenne || 0) >= 4.5) baseScore += 8;      // excellente note

  // ── PÉNALITÉS AUTOMATIQUES (mauvais comportement) ───────────────────────
  if (tempsReponseMoyen !== null && tempsReponseMoyen > 60) {
    baseScore = Math.round(baseScore * 0.90); // -10% si temps > 1 min
  }
  if (taux !== null && proposees >= 5 && taux < 0.5) {
    baseScore = Math.round(baseScore * 0.80); // -20% si refus répétés
  }
  if ((driver.courses_refusees_consecutives || 0) >= 3) {
    baseScore = Math.round(baseScore * 0.75); // -25% si 3 refus consécutifs
  }

  // ── BOOST DE ZONE (forte demande, peu de livreurs) ─────────────────────
  baseScore += zoneBoost;

  // ── BONUS URGENCE ────────────────────────────────────────────────────
  const urgence = course.urgence || course.niveau_urgence;
  if (urgence === 'tres_urgent') baseScore += 20;
  else if (urgence === 'urgent') baseScore += 10;

  return baseScore;
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const courseId = body.course_id || body.event?.entity_id;
    const forceDispatch = body.force === true; // Admin peut forcer même en mode manuel

    if (!courseId) {
      return Response.json({ error: 'course_id manquant' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // ── Vérification du mode de dispatch ────────────────────────────────────
    const configs = await base44.asServiceRole.entities.DispatchConfig.list('-updated_date', 1);
    const config = configs[0] || { mode: 'auto', force_override: false, seuil_livreurs_auto: 3 };

    if (config.mode === 'manuel' && !forceDispatch) {
      console.log(`[DISPATCH] Mode MANUEL actif — dispatch automatique bloqué pour la course ${courseId}`);
      return Response.json({ success: false, blocked: true, reason: 'mode_manuel', message: 'Dispatch automatique désactivé — mode manuel actif' });
    }

    console.log(`[DISPATCH] Mode: ${config.mode.toUpperCase()}${forceDispatch ? ' (forcé admin)' : ''}`);

    // Récupérer la course
    const courses = await base44.asServiceRole.entities.Course.filter({ id: courseId });
    if (!courses || courses.length === 0) {
      return Response.json({ error: 'Course introuvable' }, { status: 404 });
    }
    const course = courses[0];

    // Ne dispatcher que si la course est en attente ou aucun_livreur
    if (!['en_attente', 'aucun_livreur'].includes(course.statut)) {
      return Response.json({ message: 'Course non éligible au dispatch', statut: course.statut });
    }

    // Déterminer les livreurs à exclure (refus précédents)
    let excludeEmails = [];
    if (course.historique_assignation) {
      try {
        const hist = JSON.parse(course.historique_assignation);
        excludeEmails = hist
          .filter(h => h.statut === 'refuse' || h.statut === 'no_response')
          .map(h => h.livreur_email);
      } catch (_) {}
    }

    // Récupérer les profils livreur actifs (source de vérité multi-profils)
    const activeProfiles = await base44.asServiceRole.entities.UserProfile.filter({
      profile_type: 'livreur',
      status: 'actif',
      deleted: false,
    });
    const activeLibvreurEmails = new Set(activeProfiles.map(p => p.user_email));

    // Récupérer tous les livreurs
    const allDrivers = await base44.asServiceRole.entities.User.filter({ user_type: 'livreur' });

    // Filtrer les livreurs éligibles (profil actif + en ligne + non bloqué + taux refus acceptable)
    const eligibles = allDrivers.filter(d => {
      if (!d.disponible || d.actif === false) return false;
      if (!activeLibvreurEmails.has(d.email)) return false;
      if (d.livreur_bloque) return false;
      if ((d.nombre_courses_actives || 0) >= 5) return false;
      if (excludeEmails.includes(d.email)) return false;
      if (!(d.quartier || d.gps_latitude)) return false;
      // Exclure livreurs avec taux de refus > 70% (si suffisamment de données)
      const proposees = d.courses_proposees || 0;
      const acceptees = d.courses_acceptees || (d.total_courses_livrees || 0);
      if (proposees >= 5 && acceptees / proposees < 0.3) return false;
      return true;
    });

    const now = new Date().toISOString();
    const historique = [];
    try {
      if (course.historique_assignation) {
        const parsed = JSON.parse(course.historique_assignation);
        historique.push(...parsed);
      }
    } catch (_) {}

    if (eligibles.length === 0) {
      // Aucun livreur disponible
      historique.push({ heure: now, statut: 'aucun_livreur', message: 'Aucun livreur éligible' });
      await base44.asServiceRole.entities.Course.update(courseId, {
        statut: 'aucun_livreur',
        nombre_tentatives: (course.nombre_tentatives || 0) + 1,
        historique_assignation: JSON.stringify(historique),
      });
      // Notifier le client
      if (course.client_email) {
        try {
          await base44.asServiceRole.entities.Notification.create({
            destinataire_email: course.client_email,
            destinataire_role: 'client',
            titre: '😔 Aucun livreur disponible',
            message: 'Aucun livreur n\'est disponible pour le moment. Réessayez plus tard ou augmentez le prix de la livraison.',
            type: 'warning',
            lue: false,
            course_id: courseId,
            target_screen: `/course/${courseId}`,
            target_entity_id: courseId,
            target_entity_type: 'course',
          });
        } catch (_) {}
      }
      console.log(`[DISPATCH] Aucun livreur disponible pour la course ${courseId}`);
      return Response.json({ success: false, message: 'Aucun livreur disponible' });
    }

    // ── DISPATCH PAR RAYON PROGRESSIF (GPS prioritaire) ─────────────────────
    // Si la course a des coordonnées GPS, filtrer par rayon d'abord
    let candidates = eligibles;

    if (course.latitude_depart && course.longitude_depart) {
      const RAYONS = [3, 5, 10]; // km progressifs
      for (const rayon of RAYONS) {
        const dansRayon = eligibles.filter(d => {
          if (!d.gps_latitude || !d.gps_longitude) return false;
          const dist = distanceKm(d.gps_latitude, d.gps_longitude, course.latitude_depart, course.longitude_depart);
          return dist <= rayon;
        });
        if (dansRayon.length > 0) {
          candidates = dansRayon;
          console.log(`[DISPATCH] ${dansRayon.length} livreur(s) dans un rayon de ${rayon} km`);
          break;
        }
        console.log(`[DISPATCH] Aucun livreur dans ${rayon} km — élargissement...`);
      }
      // Si toujours personne avec GPS, fallback sur tous les éligibles (par quartier)
      if (candidates === eligibles && eligibles.filter(d => d.gps_latitude).length === 0) {
        console.log('[DISPATCH] Aucun GPS disponible — dispatch par quartier');
      }
    }

    // ── CALCUL BOOST DE ZONE ─────────────────────────────────────────────────
    // Zone boost : si forte demande (>3 courses en attente) et peu de livreurs (<3)
    let zoneBoostValue = 0;
    const zoneDepart = course.quartier_depart;
    const livreursInZone = candidates.filter(d => d.quartier === zoneDepart || (
      d.gps_latitude && d.gps_longitude && course.latitude_depart && course.longitude_depart &&
      distanceKm(d.gps_latitude, d.gps_longitude, course.latitude_depart, course.longitude_depart) <= 3
    )).length;
    const coursesZone = 1; // la course actuelle, on pourrait charger les autres mais c'est suffisant
    if (livreursInZone <= 2) zoneBoostValue = 20; // zone sous-couverte
    else if (livreursInZone <= 4) zoneBoostValue = 10;
    console.log(`[DISPATCH] Zone ${zoneDepart}: ${livreursInZone} livreur(s) → boost +${zoneBoostValue}`);

    // Scorer et trier les candidats
    const scored = candidates
      .map(d => ({ driver: d, score: scoreDriver(d, course, zoneBoostValue) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0].driver;

    const expireAt = new Date(Date.now() + 60000).toISOString();
    historique.push({
      livreur_email: best.email,
      livreur_nom: best.full_name,
      heure: now,
      heure_expiration: expireAt,
      statut: 'proposee',
    });

    // Mettre à jour la course
    await base44.asServiceRole.entities.Course.update(courseId, {
      statut: 'assignee_attente',
      livreur_email: best.email,
      livreur_name: best.full_name,
      telephone_livreur: best.telephone || '',
      heure_assignation: now,
      mode_assignation: 'auto',
      nombre_tentatives: (course.nombre_tentatives || 0) + 1,
      historique_assignation: JSON.stringify(historique),
      livreur_photo: best.photo_profil || null,
      livreur_note_moyenne: best.note_moyenne || null,
      livreur_note_semaine: best.note_semaine || null,
    });

    // Mettre à jour le livreur (métriques d'apprentissage)
    await base44.asServiceRole.entities.User.update(best.id, {
      nombre_courses_actives: (best.nombre_courses_actives || 0) + 1,
      derniere_course_attribuee_at: now,
      courses_proposees: (best.courses_proposees || 0) + 1,
      // Réinitialiser le compteur de refus consécutifs à la prochaine proposition
      derniere_proposition_at: now,
    });

    // Notifier le livreur (déclenche aussi la notification navigateur)
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: best.email,
      destinataire_role: 'livreur',
      titre: '🛵 Nouvelle course disponible !',
      message: `Course de ${course.quartier_depart} → ${course.quartier_arrivee}. Colis: ${course.type_colis}. Ouvrez l'app pour accepter.`,
      type: 'success',
      lue: false,
      course_id: courseId,
      target_screen: `/course-livreur/${courseId}`,
      target_entity_id: courseId,
      target_entity_type: 'course',
    });

    console.log(`[DISPATCH] Course ${courseId} assignée à ${best.full_name} (${best.email}) — score: ${scored[0].score}`);

    return Response.json({
      success: true,
      livreur: { email: best.email, nom: best.full_name },
      score: scored[0].score,
    });

  } catch (error) {
    console.error('[DISPATCH] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});