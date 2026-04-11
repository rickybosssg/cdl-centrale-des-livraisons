/**
 * CDL — Moteur de dispatch frontend
 * Source de vérité : DispatchConfig en BDD (jamais localStorage).
 * RÈGLE : si mode = 'manuel', AUCUN dispatch auto autorisé.
 */
import { base44 } from "@/api/base44Client";

export const ZONES_PROCHES = {
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

export function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Score livreur :
 * 30% distance | 30% prix course | 20% performance | 10% taux acceptation | 10% inactivité
 */
export function scoreDriver(driver, course) {
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

  // 2. PRIX COURSE (30 pts) — plus le prix est élevé, plus la course est attractive
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

  // BONUS URGENCE
  const urgence = course.urgence || course.niveau_urgence;
  if (urgence === 'tres_urgent') total += 20;
  else if (urgence === 'urgent') total += 10;

  // PÉNALITÉS
  const refusConsecutifs = driver.courses_refusees_consecutives || 0;
  if (refusConsecutifs >= 3) total = Math.round(total * 0.7);
  if (proposees >= 5 && acceptees / proposees < 0.4) total = Math.round(total * 0.8);

  return total;
}

/**
 * Récupère le mode de dispatch depuis la BDD.
 * Retourne 'auto' par défaut si aucune config.
 */
export async function getDispatchMode() {
  try {
    const configs = await base44.entities.DispatchConfig.list('-updated_date', 1);
    return configs[0]?.mode || 'auto';
  } catch {
    return 'auto'; // tolérance lecture
  }
}

/**
 * Lance le dispatch depuis le frontend.
 * BLOQUÉ si mode = 'manuel'.
 */
export async function lancerDispatch(course, excludeEmails = []) {
  try {
    const mode = await getDispatchMode();
    if (mode === 'manuel') {
      console.log('[Dispatch] BLOQUÉ — mode manuel actif');
      return null;
    }
  } catch (e) {
    console.warn('[Dispatch] Erreur lecture mode — dispatch bloqué:', e.message);
    return null;
  }

  try {
    const res = await base44.functions.invoke('autoDispatch', {
      course_id: course.id,
      exclude_emails: excludeEmails,
    });
    if (res.data?.success) return res.data.livreur;
    return null;
  } catch (e) {
    console.error('[Dispatch] Erreur appel autoDispatch:', e);
    return null;
  }
}

/**
 * Réassigne une course (exclut les livreurs ayant déjà refusé).
 */
export async function reassignerCourse(course) {
  let exclure = [];
  try {
    const hist = course.historique_assignation ? JSON.parse(course.historique_assignation) : [];
    exclure = hist.filter(h => ['refuse', 'no_response'].includes(h.statut)).map(h => h.livreur_email);
  } catch (_) {}
  return lancerDispatch(course, exclure);
}

/**
 * Priorité des courses pour le dispatch (ordre de traitement).
 * 1. très urgent, 2. urgent, 3. prix élevé, 4. normal
 */
export function priorityCourseScore(course) {
  const urgence = course.urgence || course.niveau_urgence;
  let score = 0;
  if (urgence === 'tres_urgent') score += 1000;
  else if (urgence === 'urgent') score += 500;
  score += (course.prix || 0);
  return score;
}

/**
 * Classe les livreurs éligibles pour une course donnée (usage frontend/admin).
 */
export async function classifyDriversForCourse(course) {
  const allDrivers = await base44.entities.User.filter({ user_type: 'livreur' });
  const activeProfiles = await base44.entities.UserProfile.filter({
    profile_type: 'livreur', status: 'actif', deleted: false,
  });
  const validEmails = new Set(activeProfiles.map(p => p.user_email));

  // Utiliser driver_online (rôle actif = livreur) comme source de vérité
  const eligibles = allDrivers.filter(d =>
    d.driver_online &&
    !d.livreur_bloque &&
    validEmails.has(d.email) &&
    (d.nombre_courses_actives || 0) < 3 &&
    (d.quartier || d.gps_latitude)
  );

  return eligibles
    .map(d => ({ driver: d, score: scoreDriver(d, course) }))
    .sort((a, b) => b.score - a.score);
}