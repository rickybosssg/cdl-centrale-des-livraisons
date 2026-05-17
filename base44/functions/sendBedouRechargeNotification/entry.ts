/**
 * CDL — sendBedouRechargeNotification v3 STUB
 *
 * ⚠️ DÉPRÉCIÉ — NE PAS MODIFIER
 * Doublonnait notifyBedouEvents (automation entity DemandeRecharge).
 * Appelait sendFcmNotification (lui-même déprécié) au lieu de sendCdlNotification.
 * Redirige vers sendCdlNotification (canal officiel unique).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const { admin_email, requester_name, montant, bonus, demande_id } = body;

  console.log('[sendBedouRechargeNotification] STUB → redirection vers sendCdlNotification');

  if (!admin_email) return Response.json({ error: 'admin_email requis' }, { status: 400 });

  const result = await base44.asServiceRole.functions.invoke('sendCdlNotification', {
    user_email: admin_email,
    title: '🔔 Nouvelle demande de recharge Bedou',
    body: `${requester_name || 'Utilisateur'} — ${(parseInt(montant) || 0).toLocaleString()} F CFA à valider`,
    data: {
      type: 'bedou_recharge_request',
      entity_id: demande_id || '',
      entity_type: 'DemandeRecharge',
      notif_route: '/gestion-bedou',
    },
  });

  return Response.json(result?.data || { success: true, redirected: true });
});