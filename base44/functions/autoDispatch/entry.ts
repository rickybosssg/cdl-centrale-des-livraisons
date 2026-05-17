/**
 * CDL — autoDispatch v5 STUB
 *
 * ⚠️ DÉPRÉCIÉ — NE PAS MODIFIER
 * Redirige vers cdlDispatch (moteur unifié).
 * Conservé pour compatibilité avec les appels résiduels dans l'historique.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));

  console.log('[autoDispatch] STUB → redirection vers cdlDispatch');

  const result = await base44.asServiceRole.functions.invoke('cdlDispatch', {
    course_id: body.course_id || body.event?.entity_id,
    exclude_emails: body.exclude_emails || [],
    force: body.force || false,
  });

  return Response.json(result?.data || { success: false, reason: 'cdlDispatch no response' });
});