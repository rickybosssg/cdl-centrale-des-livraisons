/**
 * CDL — notifyUser v3 STUB
 *
 * ⚠️ DÉPRÉCIÉ — NE PAS MODIFIER
 * Redirige vers sendCdlNotification (canal officiel unique).
 * Conservé pour compatibilité avec les appels résiduels.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));

  const { user_email, role, titre, message, type = 'info', course_id, route, data = {} } = body;

  console.log('[notifyUser] STUB → redirection vers sendCdlNotification');

  const result = await base44.asServiceRole.functions.invoke('sendCdlNotification', {
    user_email,
    role,
    title: titre,
    body: message,
    data: {
      type: data.type || type,
      entity_id: data.entity_id || course_id || '',
      entity_type: data.entity_type || (course_id ? 'Course' : ''),
      notif_route: route || data.route || '/',
      ...data,
    },
  });

  return Response.json(result?.data || { success: true, redirected: true });
});