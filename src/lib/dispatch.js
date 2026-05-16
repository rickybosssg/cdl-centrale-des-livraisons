/**
 * CDL — lib/dispatch.js v4 UNIFIÉ
 *
 * SOURCE UNIQUE : DispatchModeState
 * SUPPRESSION : DispatchConfig, lancerDispatch (le frontend ne déclenche plus de dispatch)
 *
 * Le dispatch est EXCLUSIVEMENT déclenché par :
 *   → Automation entity Course.create → createSmartDispatch (backend)
 *
 * Ce fichier conserve uniquement les utilitaires frontend :
 *   - isDriverEligible()      : critères unifiés (affichage UI seulement)
 *   - getDispatchMode()       : lecture DispatchModeState
 *   - sortDriversByProximity(): tri affichage admin
 *   - scoreDriver()           : score affichage admin
 *   - classifyDriversForCourse()
 *   - getDriversDispatchStats()
 */
import { base44 } from "@/api/base44Client";

// ── Critères d'éligibilité UNIFIÉS — identiques aux fonctions backend ─────────
export function isDriverEligible(d) {
  if (d.driver_online !== true) return false;
  if (d.profil_valide !== true && d.statut_validation_livreur !== 'valide' && d.statut_validation_livreur !== 'actif') return false;
  if (d.livreur_bloque) return false;
  if (d.livreur_suspendu) return false;
  if (d.disponible === false) return false;
  if ((d.nombre_courses_actives || 0) >= 2) return false;
  return true;
}

// Alias pour compatibilité composants UI existants
export const isDriverDispatchable = isDriverEligible;

export function getDriverDispatchReason(driver) {
  if (!driver.driver_online) return 'hors ligne';
  if (!driver.profil_valide && driver.statut_validation_livreur !== 'valide') return 'profil non validé';
  if (driver.livreur_bloque) return 'compte bloqué';
  if (driver.livreur_suspendu) return 'compte suspendu';
  if (driver.disponible === false) return 'marqué indisponible';
  if ((driver.nombre_courses_actives || 0) >= 2) return `occupé (${driver.nombre_courses_actives} courses actives)`;
  return 'dispatchable';
}

export function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function sortDriversByProximity(drivers, course) {
  const hasGPS = course?.latitude_depart && course?.longitude_depart;
  if (!hasGPS) {
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

export function scoreDriver(driver, course) {
  let score = 0;
  if (driver.gps_latitude && driver.gps_longitude && course?.latitude_depart && course?.longitude_depart) {
    const dist = distanceKm(driver.gps_latitude, driver.gps_longitude, course.latitude_depart, course.longitude_depart);
    score += dist <= 3 ? 30 : dist <= 7 ? 20 : dist <= 15 ? 10 : 5;
  }
  if (driver.note_moyenne >= 4.5) score += 10;
  else if (driver.note_moyenne >= 4.0) score += 7;
  return score;
}

/**
 * Lecture exclusive DispatchModeState — JAMAIS DispatchConfig
 */
export async function getDispatchMode() {
  try {
    const rows = await base44.entities.DispatchModeState.list('-updated_date', 1);
    const doc = rows[0];
    const mode = doc?.mode === 'manuel' ? 'manuel' : 'auto';
    console.log(`[DISPATCH_MODE_READ] source=DispatchModeState | fn=getDispatchMode | mode=${mode} | id=${doc?.id || 'none'}`);
    return mode;
  } catch (err) {
    console.warn(`[DISPATCH_MODE_READ] Erreur lecture DispatchModeState — mode inconnu | err=${err?.message}`);
    return null;
  }
}

/**
 * Classifie les livreurs pour affichage admin — lecture seule, pas de dispatch
 */
export async function classifyDriversForCourse(course) {
  const allUsers = await base44.entities.User.list('-updated_date', 500);
  const eligibles = allUsers.filter(d => isDriverEligible(d));
  const sorted = sortDriversByProximity(eligibles, course);
  return sorted.map(d => ({ driver: d, score: scoreDriver(d, course) }));
}

/**
 * Stats dispatch pour UI admin — lecture seule
 */
export async function getDriversDispatchStats() {
  const allUsers = await base44.entities.User.list('-updated_date', 500);
  const enLigne = allUsers.filter(d => d.driver_online);
  const avecGPS = enLigne.filter(d => d.gps_latitude && d.gps_longitude);
  const dispatchables = enLigne.filter(d => isDriverEligible(d));
  const nonDispatchables = enLigne
    .filter(d => !isDriverEligible(d))
    .map(d => ({ email: d.email, nom: d.full_name, raison: getDriverDispatchReason(d) }));
  return { enLigne: enLigne.length, avecGPS: avecGPS.length, dispatchables: dispatchables.length, nonDispatchables };
}

/**
 * Priorité des courses pour affichage admin
 */
export function priorityCourseScore(course) {
  const urgence = course.urgence || course.niveau_urgence;
  let score = 0;
  if (urgence === 'tres_urgent') score += 1000;
  else if (urgence === 'urgent') score += 500;
  score += (course.prix || 0);
  return score;
}