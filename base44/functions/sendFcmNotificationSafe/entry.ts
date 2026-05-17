/**
 * CDL — sendFcmNotificationSafe v3 STUB
 *
 * ⚠️ DÉPRÉCIÉ — NE PAS MODIFIER
 * Alias de sendFcmNotification (lui-même déprécié).
 * Redirige vers sendCdlNotification (canal officiel unique).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const { user_email, recipient_email, title, body: msgBody, data = {} } = body;

  console.log('[sendFcmNotificationSafe] STUB → redirection vers sendCdlNotification');

  const result = await base44.asServiceRole.functions.invoke('sendCdlNotification', {
    user_email: recipient_email || user_email,
    title,
    body: msgBody,
    data,
  });

  return Response.json(result?.data || { success: true, redirected: true });
});