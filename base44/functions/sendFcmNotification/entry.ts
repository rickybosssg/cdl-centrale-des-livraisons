/**
 * CDL — sendFcmNotification v4 STUB
 *
 * ⚠️ DÉPRÉCIÉ — NE PAS MODIFIER
 * Redirige vers sendCdlNotification (canal FCM officiel unique, canal cdl_critical_alerts_v3).
 * sendFcmNotification utilisait un canal différent ('default') — risque de doublon push.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const { user_email, title, body: msgBody, data = {} } = body;

  console.log('[sendFcmNotification] STUB → redirection vers sendCdlNotification');

  const result = await base44.asServiceRole.functions.invoke('sendCdlNotification', {
    user_email,
    title,
    body: msgBody,
    data,
  });

  return Response.json(result?.data || { success: true, redirected: true });
});