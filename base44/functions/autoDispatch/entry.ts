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

function scoreDriver(driver, course) {
  let score = 0;
  const quartierDepart = course.quartier_depart;

  // Proximité par quartier
  if (driver.quartier === quartierDepart) score += 100;
  else if (ZONES_PROCHES[quartierDepart]?.includes(driver.quartier)) score += 60;

  // Proximité GPS (poids augmenté)
  if (driver.gps_latitude && driver.gps_longitude && course.latitude_depart && course.longitude_depart) {
    const dist = distanceKm(driver.gps_latitude, driver.gps_longitude, course.latitude_depart, course.longitude_depart);
    if (dist < 1) score += 80;
    else if (dist < 3) score += 50;
    else if (dist < 7) score += 20;
  }

  // Moins de courses actives = meilleur score
  const actives = driver.nombre_courses_actives || 0;
  score += Math.max(0, (5 - actives) * 15);

  // Taux d'acceptation du livreur
  const totalCourses = driver.total_courses_livrees || 0;
  if (totalCourses > 10) score += 20;
  else if (totalCourses > 5) score += 10;

  // Note moyenne
  if (driver.note_moyenne) score += (driver.note_moyenne - 3) * 10;

  // Attend depuis longtemps = priorité
  if (driver.derniere_course_attribuee_at) {
    const heuresAttente = (Date.now() - new Date(driver.derniere_course_attribuee_at).getTime()) / 3600000;
    score += Math.min(heuresAttente * 5, 30);
  } else {
    score += 30;
  }

  return score;
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const courseId = body.course_id || body.event?.entity_id;

    if (!courseId) {
      return Response.json({ error: 'course_id manquant' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

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

    // Récupérer tous les livreurs
    const allDrivers = await base44.asServiceRole.entities.User.filter({ user_type: 'livreur' });

    // Filtrer les livreurs éligibles
    const eligibles = allDrivers.filter(d =>
      d.disponible === true &&
      d.actif !== false &&
      d.statut_validation_livreur === 'valide' &&
      !d.livreur_bloque &&
      (d.nombre_courses_actives || 0) < 5 &&
      !excludeEmails.includes(d.email) &&
      (d.quartier || d.gps_latitude)
    );

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
      console.log(`[DISPATCH] Aucun livreur disponible pour la course ${courseId}`);
      return Response.json({ success: false, message: 'Aucun livreur disponible' });
    }

    // Sélectionner le meilleur livreur (cascade: top 3 disponibles)
    const scored = eligibles
      .map(d => ({ driver: d, score: scoreDriver(d, course) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0].driver;

    historique.push({
      livreur_email: best.email,
      livreur_nom: best.full_name,
      heure: now,
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

    // Mettre à jour le livreur
    await base44.asServiceRole.entities.User.update(best.id, {
      nombre_courses_actives: (best.nombre_courses_actives || 0) + 1,
      derniere_course_attribuee_at: now,
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