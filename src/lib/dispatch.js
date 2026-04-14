/**
 * CDL — Moteur de dispatch frontend (simplifié phase lancement)
 * Source de vérité : DispatchConfig en BDD.
 * CRITÈRES SIMPLES : driver_online=true, current_role=livreur, pas occupé.
 */
import { base44 } from "@/api/base44Client";

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Score optionnel (utilisé uniquement pour tri si GPS dispo, non bloquant)
export function scoreDriver(driver, course) {
  let score = 0;
  if (driver.gps_latitude && driver.gps_longitude && course.latitude_depart && course.longitude_depart) {
    const dist = distanceKm(driver.gps_latitude, driver.gps_longitude, course.latitude_depart, course.longitude_depart);
    score += dist <= 3 ? 30 : dist <= 7 ? 20 : dist <= 15 ? 10 : 5;
  }
  if (driver.note_moyenne >= 4.5) score += 10;
  else if (driver.note_moyenne >= 4.0) score += 7;
  return score;
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
 * Critères stricts dispatch (4 conditions cumulatives) :
 *   1. driver_online = true          (en ligne)
 *   2. current_role = 'livreur'      (profil actif = livreur)
 *   3. profil_valide = true          (compte validé par admin)
 *   4. !livreur_bloque               (non bloqué)
 *   + nombre_courses_actives < 2     (pas surchargé)
 */
export function isDriverDispatchable(driver) {
  return (
    driver.driver_online === true &&
    driver.current_role === 'livreur' &&
    driver.profil_valide === true &&
    !driver.livreur_bloque &&
    (driver.nombre_courses_actives || 0) < 2
  );
}

export function getDriverDispatchReason(driver) {
  if (!driver.driver_online) return 'hors ligne';
  if (driver.current_role !== 'livreur') return `rôle actif: ${driver.current_role || 'non défini'}`;
  if (!driver.profil_valide) return 'compte non validé';
  if (driver.livreur_bloque) return 'compte bloqué';
  if ((driver.nombre_courses_actives || 0) >= 2) return `occupé (${driver.nombre_courses_actives} courses)`;
  return 'dispatchable';
}

export async function classifyDriversForCourse(course) {
  const allUsers = await base44.entities.User.list('-updated_date', 500);
  const eligibles = allUsers.filter(d => isDriverDispatchable(d));
  return eligibles
    .map(d => ({ driver: d, score: scoreDriver(d, course) }))
    .sort((a, b) => b.score - a.score);
}

export async function getDriversDispatchStats() {
  const allUsers = await base44.entities.User.list('-updated_date', 500);
  const enLigne = allUsers.filter(d => d.driver_online);
  const avecGPS = enLigne.filter(d => d.gps_latitude && d.gps_longitude);
  const dispatchables = enLigne.filter(d => isDriverDispatchable(d));
  const nonDispatchables = enLigne
    .filter(d => !isDriverDispatchable(d))
    .map(d => ({ email: d.email, nom: d.full_name, raison: getDriverDispatchReason(d) }));
  return { enLigne: enLigne.length, avecGPS: avecGPS.length, dispatchables: dispatchables.length, nonDispatchables };
}