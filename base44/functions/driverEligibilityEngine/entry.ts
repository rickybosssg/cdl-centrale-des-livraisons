/**
 * CDL — driverEligibilityEngine
 *
 * SOURCE UNIQUE DE VÉRITÉ : critères d'éligibilité livreur
 *
 * Remplace les 3 copies dispersées dans :
 *   - cdlDispatch (isEligible)
 *   - checkPendingAssignments (isDriverEligible)
 *   - courseStateMachine (isDriverEligible)
 *
 * ACTIONS :
 *   CHECK_ONE   — vérifie un seul livreur par email
 *   GET_ELIGIBLE — retourne tous les livreurs éligibles pour un dispatch
 *   REAL_ACTIVE_COUNT — recalcule le vrai nombre de courses actives depuis BDD
 *
 * RÈGLE UNIQUE : un livreur est éligible si ET SEULEMENT SI :
 *   1. driver_online === true
 *   2. profil_valide === true OU statut_validation_livreur === 'valide'/'actif'
 *   3. livreur_bloque !== true
 *   4. livreur_suspendu !== true
 *   5. disponible !== false
 *   6. nombre_courses_actives (réel depuis BDD) < 2
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ACTIVE_STATUTS = new Set([
  'assignee_attente', 'acceptee', 'driver_en_route_pickup',
  'arrived_pickup', 'en_cours', 'arrived_dropoff',
]);

/**
 * SOURCE UNIQUE D'ÉLIGIBILITÉ — fonction pure
 * @param {object} driver - entité User
 * @param {number|null} realActiveCount - count depuis BDD (null = utiliser driver.nombre_courses_actives)
 * @param {Set} excluded - emails exclus (ex: déjà refusé)
 */
export function isDriverEligible(driver, realActiveCount = null, excluded = new Set()) {
  if (excluded.has(driver.email)) return false;
  if (driver.driver_online !== true) return false;
  if (!driver.profil_valide && driver.statut_validation_livreur !== 'valide' && driver.statut_validation_livreur !== 'actif') return false;
  if (driver.livreur_bloque === true) return false;
  if (driver.livreur_suspendu === true) return false;
  if (driver.disponible === false) return false;
  const count = realActiveCount !== null ? realActiveCount : (driver.nombre_courses_actives || 0);
  if (count >= 2) return false;
  return true;
}

/**
 * Recalcul du vrai nombre de courses actives depuis BDD pour un email
 */
export async function getRealActiveCount(base44, email) {
  const courses = await base44.asServiceRole.entities.Course.filter({ livreur_email: email });
  return courses.filter(c => ACTIVE_STATUTS.has(c.statut) && !c.is_deleted).length;
}

/**
 * Recalcul bulk pour tous les livreurs actifs (utilisé par cdlDispatch)
 */
export async function getRealActiveCountsBulk(base44) {
  const courses = await base44.asServiceRole.entities.Course.list('-created_date', 200);
  const counts = {};
  for (const c of courses) {
    if (c.livreur_email && ACTIVE_STATUTS.has(c.statut) && !c.is_deleted) {
      counts[c.livreur_email] = (counts[c.livreur_email] || 0) + 1;
    }
  }
  return counts;
}

// ─── Handler HTTP ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });

  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const { action, email, exclude_emails = [] } = body;
  const excluded = new Set(exclude_emails);

  // ── ACTION: CHECK_ONE ──────────────────────────────────────────────────────
  if (action === 'CHECK_ONE') {
    if (!email) return Response.json({ error: 'email requis' }, { status: 400 });
    const users = await base44.asServiceRole.entities.User.filter({ email });
    const driver = users?.[0];
    if (!driver) return Response.json({ eligible: false, reason: 'user_not_found' });
    const realCount = await getRealActiveCount(base44, email);
    const eligible = isDriverEligible(driver, realCount, excluded);
    const reasons = [];
    if (!eligible) {
      if (!driver.driver_online) reasons.push('offline');
      if (!driver.profil_valide && driver.statut_validation_livreur !== 'valide' && driver.statut_validation_livreur !== 'actif') reasons.push('non_valide');
      if (driver.livreur_bloque) reasons.push('bloque');
      if (driver.livreur_suspendu) reasons.push('suspendu');
      if (driver.disponible === false) reasons.push('indisponible');
      if (realCount >= 2) reasons.push(`courses_actives=${realCount}`);
    }
    return Response.json({ eligible, realActiveCount: realCount, reasons });
  }

  // ── ACTION: GET_ELIGIBLE ────────────────────────────────────────────────────
  if (action === 'GET_ELIGIBLE') {
    const [allUsers, realCounts] = await Promise.all([
      base44.asServiceRole.entities.User.list('-updated_date', 300),
      getRealActiveCountsBulk(base44),
    ]);
    // Corriger les compteurs divergents en BDD (self-healing)
    for (const d of allUsers) {
      if (!d.driver_online) continue;
      const real = realCounts[d.email] || 0;
      if ((d.nombre_courses_actives || 0) !== real) {
        base44.asServiceRole.entities.User.update(d.id, { nombre_courses_actives: real }).catch(() => {});
        d.nombre_courses_actives = real;
      }
    }
    const eligible = allUsers.filter(d => isDriverEligible(d, realCounts[d.email] ?? null, excluded));
    return Response.json({
      eligible_count: eligible.length,
      total: allUsers.length,
      drivers: eligible.map(d => ({
        id: d.id, email: d.email, full_name: d.full_name,
        gps_latitude: d.gps_latitude, gps_longitude: d.gps_longitude,
        note_moyenne: d.note_moyenne, nombre_courses_actives: realCounts[d.email] || 0,
      })),
    });
  }

  // ── ACTION: REAL_ACTIVE_COUNT ───────────────────────────────────────────────
  if (action === 'REAL_ACTIVE_COUNT') {
    if (!email) return Response.json({ error: 'email requis' }, { status: 400 });
    const count = await getRealActiveCount(base44, email);
    return Response.json({ email, realActiveCount: count });
  }

  return Response.json({ error: 'Action inconnue. Valeurs : CHECK_ONE | GET_ELIGIBLE | REAL_ACTIVE_COUNT' }, { status: 400 });
});