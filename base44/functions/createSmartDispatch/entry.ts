/**
 * CDL — createSmartDispatch v5 STUB
 *
 * ⚠️ DÉPRÉCIÉ — NE PAS MODIFIER
 * Redirige vers cdlDispatch (moteur unifié).
 * L'ancienne logique top3+65s de polling est abandonnée :
 * le realtime BDD + NewCourseAlert côté app remplace le polling serveur.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const courseId = body.course_id || body.event?.entity_id || body.args?.course_id;

  console.log('[createSmartDispatch] STUB → redirection vers cdlDispatch');

  const result = await base44.asServiceRole.functions.invoke('cdlDispatch', {
    course_id: courseId,
    force: body.force || false,
  });

  return Response.json(result?.data || { ok: true, redirected: true });
});