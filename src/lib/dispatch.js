import { base44 } from "@/api/base44Client";

// Carte de zones proches à Ouagadougou
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
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scoreDriver(driver, course) {
  let score = 0;
  const quartierDepart = course.quartier_depart;

  // Priorité 1: même quartier
  if (driver.quartier === quartierDepart) score += 100;
  // Priorité 5: zone proche
  else if (ZONES_PROCHES[quartierDepart]?.includes(driver.quartier)) score += 50;

  // Priorité 2: GPS
  if (driver.gps_latitude && driver.gps_longitude && course.latitude_depart && course.longitude_depart) {
    const dist = distanceKm(driver.gps_latitude, driver.gps_longitude, course.latitude_depart, course.longitude_depart);
    score += Math.max(0, 30 - dist * 3);
  }

  // Priorité 3: moins de courses actives
  const actives = driver.nombre_courses_actives || 0;
  score += (3 - actives) * 10;

  // Priorité 4: attend depuis longtemps
  if (driver.derniere_course_attribuee_at) {
    const heuresAttente = (Date.now() - new Date(driver.derniere_course_attribuee_at).getTime()) / 3600000;
    score += Math.min(heuresAttente, 5);
  } else {
    score += 5; // jamais eu de course = priorité max
  }

  return score;
}

export async function lancerDispatch(course, excludeEmails = []) {
  const dispatchMode = localStorage.getItem('cdl_dispatch_mode') || 'auto';
  if (dispatchMode === 'manuel') return null;

  try {
    const allDrivers = await base44.entities.User.filter({ user_type: "livreur" });

    const eligibles = allDrivers.filter(d =>
      d.disponible === true &&
      d.actif !== false &&
      d.statut_validation_livreur === "valide" &&
      !d.livreur_bloque &&
      (d.nombre_courses_actives || 0) < 3 &&
      !excludeEmails.includes(d.email) &&
      (d.quartier || d.gps_latitude)
    );

    if (eligibles.length === 0) {
      await base44.entities.Course.update(course.id, {
        statut: "aucun_livreur",
        nombre_tentatives: (course.nombre_tentatives || 0) + 1,
      });
      return null;
    }

    const scored = eligibles
      .map(d => ({ driver: d, score: scoreDriver(d, course) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0].driver;
    const now = new Date().toISOString();

    const historique = course.historique_assignation
      ? JSON.parse(course.historique_assignation)
      : [];
    historique.push({
      livreur_email: best.email,
      livreur_nom: best.full_name,
      heure: now,
      statut: "proposee",
    });

    await base44.entities.Course.update(course.id, {
      statut: "assignee_attente",
      livreur_email: best.email,
      livreur_name: best.full_name,
      heure_assignation: now,
      mode_assignation: "auto",
      nombre_tentatives: (course.nombre_tentatives || 0) + 1,
      historique_assignation: JSON.stringify(historique),
    });

    return best;
  } catch (e) {
    console.error("Erreur dispatch:", e);
    return null;
  }
}

export async function reassignerCourse(course) {
  let exclure = [];
  try {
    const hist = course.historique_assignation ? JSON.parse(course.historique_assignation) : [];
    exclure = hist.map(h => h.livreur_email);
  } catch (_) {}
  return lancerDispatch(course, exclure);
}

export function getDispatchMode() {
  return localStorage.getItem('cdl_dispatch_mode') || 'auto';
}

export function setDispatchMode(mode) {
  localStorage.setItem('cdl_dispatch_mode', mode);
}