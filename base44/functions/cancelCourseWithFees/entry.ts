/**
 * cancelCourseWithFees — LEGACY BLOCKED v6
 *
 * ⛔ BLOQUÉ — Ne plus utiliser.
 * Remplacé par : cancelCourseAction { action: "cancel_client" }
 *
 * cancelCourseAction gère toute la logique d'annulation (gratuite + avec frais 50%) :
 *   - Notifications client + livreur
 *   - Bedou : débit client, crédit livreur (80%), commission CDL (20%)
 *   - Libération livreur (recalcul BDD)
 *   - Logs AdminActionLog
 *   - Idempotence anti-doublon
 *
 * Ce stub redirige les appels résiduels pour éviter tout blocage utilisateur.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const courseId = body.courseId || body.course_id || '?';

  let caller = '?';
  try { const u = await base44.auth.me(); caller = u?.email || '?'; } catch (_) {}

  console.warn(`[LEGACY_CANCEL_BLOCKED] cancelCourseWithFees | course=${courseId} | caller=${caller} | use cancelCourseAction{action:cancel_client} instead`);

  const res = await base44.asServiceRole.functions.invoke('cancelCourseAction', {
    courseId,
    action: 'cancel_client',
    raison: body.raison || 'Annulation client (legacy redirect)',
  }).catch(e => ({ data: { success: false, error: e.message } }));

  return Response.json(res?.data || { success: false, reason: 'legacy_cancel_blocked' });
});