/**
 * CDL — dispatchProgressif v5 STUB
 *
 * ⚠️ DÉPRÉCIÉ — NE PAS MODIFIER
 * L'ancien système de vagues par batch avec polling 2s est abandonné.
 * Le realtime BDD (subscription Course) remplace le polling serveur.
 * Redirige vers cdlDispatch (moteur unifié).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const courseId = body.courseId || body.course_id || body.event?.entity_id;

  console.log('[dispatchProgressif] STUB → redirection vers cdlDispatch');

  const result = await base44.asServiceRole.functions.invoke('cdlDispatch', {
    course_id: courseId,
    force: body.force || false,
  });

  return Response.json(result?.data || { ok: true, redirected: true });
});