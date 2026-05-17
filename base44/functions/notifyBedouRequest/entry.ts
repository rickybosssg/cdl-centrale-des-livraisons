/**
 * CDL — notifyBedouRequest v3 STUB
 *
 * ⚠️ DÉPRÉCIÉ — NE PAS MODIFIER
 * Appelait sendFcmNotification (déprécié) au lieu de sendCdlNotification.
 * Les notifications Bedou sont gérées par notifyBedouEvents (automation entity)
 * et sendCdlNotification (canal officiel).
 * Redirige vers sendCdlNotification.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const { user_email, user_role, type, montant, status } = body;

  console.log('[notifyBedouRequest] STUB → redirection vers sendCdlNotification');

  if (!user_email || !type || !montant) {
    return Response.json({ error: 'Paramètres manquants' }, { status: 400 });
  }

  const labelMap = {
    'recharge-demande': { t: '💰 Recharge Bedou en attente', b: `Recharge ${montant} F en attente de validation`, notifType: 'bedou_recharge_request' },
    'recharge-valide':  { t: '✅ Recharge Bedou validée !',  b: `Votre Bedou a été crédité de ${montant} F CFA`,   notifType: 'bedou_recharge_approved' },
    'recharge-refuse':  { t: '❌ Recharge Bedou refusée',    b: `Votre recharge de ${montant} F a été refusée`,     notifType: 'bedou_recharge_rejected' },
    'retrait-demande':  { t: '📤 Retrait Bedou en attente',  b: `Retrait de ${montant} F en cours de traitement`,   notifType: 'bedou_withdrawal_request' },
    'retrait-valide':   { t: '✅ Retrait Bedou effectué !',   b: `Vous avez reçu ${montant} F CFA`,                  notifType: 'bedou_withdrawal_approved' },
    'retrait-refuse':   { t: '❌ Retrait Bedou refusé',       b: `Votre demande de retrait a été refusée`,           notifType: 'bedou_withdrawal_rejected' },
  };
  const key = `${type}-${status}`;
  const label = labelMap[key] || { t: 'Notification Bedou', b: `${type} ${montant} F — ${status}`, notifType: 'bedou' };

  const result = await base44.asServiceRole.functions.invoke('sendCdlNotification', {
    user_email,
    title: label.t,
    body: label.b,
    data: { type: label.notifType, notif_route: '/mon-bedou' },
  });

  return Response.json(result?.data || { success: true, redirected: true });
});