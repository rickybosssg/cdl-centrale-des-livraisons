/**
 * CDL — reDispatch STUB v5
 *
 * ⚠️ DÉPRÉCIÉ — NE PAS MODIFIER
 *
 * La logique de re-dispatch est désormais entièrement dans :
 *   - checkPendingAssignments (cron 5min) — timeouts
 *   - courseStateMachine (REFUSE) — refus livreur
 *   - cdlDispatch — moteur principal
 *
 * Ce stub redirige les appels résiduels vers cdlDispatch.
 * Les nouveaux appels doivent utiliser courseStateMachine ou checkPendingAssignments.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const courseId = body.event?.entity_id || body.course_id;

  console.log('[reDispatch] STUB → cdlDispatch (déprécié — utiliser courseStateMachine.REFUSE)');

  if (!courseId) return Response.json({ success: false, reason: 'course_id manquant' });

  const result = await base44.asServiceRole.functions.invoke('cdlDispatch', {
    course_id: courseId,
    exclude_emails: body.exclude_emails || [],
    force: false,
  });

  return Response.json(result?.data || { success: false, reason: 'cdlDispatch no response' });
});