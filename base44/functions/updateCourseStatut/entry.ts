/**
 * updateCourseStatut — LEGACY BLOCKED v6
 *
 * ⛔ BLOQUÉ — Ne plus utiliser.
 * Remplacé par : courseStateMachine { action: "EN_ROUTE" | "ARRIVED_PICKUP" | "PICKUP" | "ARRIVED_DROPOFF" }
 *
 * Redirige vers courseStateMachine pour éviter tout blocage utilisateur.
 * Logger tous les appels résiduels pour audit.
 *
 * Map new_statut → action courseStateMachine :
 *   driver_en_route_pickup → EN_ROUTE
 *   arrived_pickup         → ARRIVED_PICKUP
 *   en_cours               → PICKUP
 *   arrived_dropoff        → ARRIVED_DROPOFF
 *   livree                 → DELIVER
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const STATUT_TO_ACTION = {
  driver_en_route_pickup: 'EN_ROUTE',
  arrived_pickup:         'ARRIVED_PICKUP',
  en_cours:               'PICKUP',
  arrived_dropoff:        'ARRIVED_DROPOFF',
  livree:                 'DELIVER',
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });

  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const { course_id, new_statut } = body;

  let caller = '?';
  try { const u = await base44.auth.me(); caller = u?.email || '?'; } catch (_) {}

  console.warn(`[LEGACY_CALL_BLOCKED] updateCourseStatut | course=${course_id} | new_statut=${new_statut} | caller=${caller} | use courseStateMachine instead`);

  const action = STATUT_TO_ACTION[new_statut];
  if (!action) {
    console.error(`[LEGACY_CALL_BLOCKED] updateCourseStatut | unknown statut=${new_statut} | no action mapped`);
    return Response.json({ success: false, reason: `Statut non mappé: ${new_statut}. Utilisez courseStateMachine.` }, { status: 400 });
  }

  const res = await base44.asServiceRole.functions.invoke('courseStateMachine', {
    course_id,
    action,
    extra: body.extra || {},
  }).catch(e => ({ data: { success: false, error: e.message } }));

  return Response.json(res?.data || { success: false, reason: 'legacy_blocked' });
});