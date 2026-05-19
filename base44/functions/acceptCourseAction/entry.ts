/**
 * acceptCourseAction — LEGACY BLOCKED v6
 *
 * ⛔ BLOQUÉ — Ne plus utiliser.
 * Remplacé par : courseStateMachine { action: "ACCEPT" }
 *
 * Toutes les pages ont été migrées vers courseStateMachine.
 * Ce fichier existe uniquement pour logger les appels résiduels.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const course_id = body.course_id || '?';

  let caller = '?';
  try { const u = await base44.auth.me(); caller = u?.email || '?'; } catch (_) {}

  console.warn(`[LEGACY_CALL_BLOCKED] acceptCourseAction | course=${course_id} | caller=${caller} | use courseStateMachine{action:ACCEPT} instead`);

  // Rediriger vers courseStateMachine pour éviter tout blocage utilisateur
  const res = await base44.asServiceRole.functions.invoke('courseStateMachine', {
    course_id,
    action: 'ACCEPT',
  }).catch(e => ({ data: { success: false, error: e.message } }));

  return Response.json(res?.data || { success: false, reason: 'legacy_blocked' });
});