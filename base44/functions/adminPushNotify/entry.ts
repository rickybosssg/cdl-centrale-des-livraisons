/**
 * CDL — adminPushNotify v3 STUB
 *
 * ⚠️ DÉPRÉCIÉ — NE PAS MODIFIER
 * Utilisait le canal 'cdl_admin' au lieu de 'cdl_critical_alerts_v3' (canal officiel).
 * Redirige vers sendCdlNotification avec role='admin'.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));

  console.log('[adminPushNotify] STUB → redirection vers sendCdlNotification role=admin');

  // Support appel direct (title/body) et appel automation (event.entity_name)
  let title = body.title;
  let msgBody = body.body;
  let route = body.route || '/admin-pro';
  let entityId = body.targetId || body.event?.entity_id || '';
  let entityType = body.event?.entity_name || '';

  // Si appel automation sans title/body explicite
  if (!title && body.event?.entity_name === 'DemandeRecharge') {
    title = '💰 Nouvelle demande de recharge Bedou';
    msgBody = `${body.data?.user_nom || 'Utilisateur'} — ${(body.data?.montant || 0).toLocaleString()} F CFA`;
    route = '/gestion-bedou';
  } else if (!title && body.event?.entity_name === 'DemandeRetrait') {
    title = '💸 Demande de retrait Bedou';
    msgBody = `${body.data?.user_nom || 'Utilisateur'} — ${(body.data?.montant || 0).toLocaleString()} F CFA`;
    route = '/gestion-bedou';
  } else if (!title && body.event?.entity_name === 'UserProfile') {
    title = 'Nouvelle demande de profil';
    msgBody = `${body.data?.user_email || 'Utilisateur'} attend validation`;
    route = '/gestion-profils';
  }

  if (!title || !msgBody) {
    return Response.json({ success: false, reason: 'no_content' });
  }

  const result = await base44.asServiceRole.functions.invoke('sendCdlNotification', {
    role: 'admin',
    title,
    body: msgBody,
    data: {
      type: body.type || 'admin',
      entity_id: entityId,
      entity_type: entityType,
      notif_route: route,
    },
  });

  return Response.json(result?.data || { success: true, redirected: true });
});