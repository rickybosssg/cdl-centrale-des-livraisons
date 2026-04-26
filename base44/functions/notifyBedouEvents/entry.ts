/**
 * notifyBedouEvents — Handler automation entity DemandeRecharge
 *
 * - Nouvelle demande de recharge → admins
 * - Recharge validée → utilisateur
 * - Recharge refusée → utilisateur
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const APP_ID = Deno.env.get('BASE44_APP_ID') || '';
const FCM_URL = `https://api.base44.app/api/apps/${APP_ID}/functions/sendCdlNotification`;

async function notifyCdl(payload) {
  try {
    await fetch(FCM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn('[notifyBedouEvents] notifyCdl error:', e.message);
  }
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { event, data, old_data } = body;

    if (!data) return Response.json({ ok: true });

    const demande = data;
    const demandeId = event?.entity_id || demande.id || '';
    const statut = demande.statut || '';
    const oldStatut = old_data?.statut || '';
    const montant = demande.montant || 0;
    const nom = demande.user_nom || demande.user_email || 'Un utilisateur';

    console.log(`[notifyBedouEvents] event=${event?.type} | statut=${statut} | montant=${montant} | user=${demande.user_email}`);

    // Nouvelle demande → notifier les admins
    if (event?.type === 'create') {
      await notifyCdl({
        role: 'admin',
        title: '💰 Nouvelle demande de rechargement Bedou',
        body: `${nom} demande un rechargement de ${montant} F CFA`,
        data: {
          type: 'bedou_recharge_request',
          screen: 'BedouAdmin',
          entity_id: demandeId,
          user_email: demande.user_email || '',
          user_id: demande.user_id || '',
          amount: String(montant),
          request_id: demandeId,
          role: 'admin',
        },
      });
    }

    // Changement de statut
    if (event?.type === 'update' && statut !== oldStatut) {

      // Recharge validée → notifier l'utilisateur
      if (statut === 'valide') {
        await notifyCdl({
          user_email: demande.user_email,
          title: '✅ Rechargement Bedou validé !',
          body: `Votre rechargement de ${montant} F CFA a été validé et crédité sur votre Bedou.`,
          data: {
            type: 'bedou_recharge_approved',
            screen: 'Bedou',
            entity_id: demandeId,
            amount: String(montant),
            role: demande.role || 'client',
          },
        });
      }

      // Recharge refusée → notifier l'utilisateur
      if (statut === 'refuse') {
        await notifyCdl({
          user_email: demande.user_email,
          title: '❌ Rechargement Bedou refusé',
          body: demande.motif_refus
            ? `Motif : ${demande.motif_refus}`
            : `Votre demande de rechargement de ${montant} F CFA a été refusée. Contactez le support.`,
          data: {
            type: 'bedou_recharge_rejected',
            screen: 'Bedou',
            entity_id: demandeId,
            amount: String(montant),
            role: demande.role || 'client',
          },
        });
      }
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[notifyBedouEvents] ERROR:', err.message);
    return Response.json({ ok: true });
  }
});