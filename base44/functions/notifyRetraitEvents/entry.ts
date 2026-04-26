/**
 * notifyRetraitEvents — Handler automation entity DemandeRetrait
 *
 * - Nouvelle demande retrait → admins
 * - Retrait validé → utilisateur
 * - Retrait refusé → utilisateur
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
    console.warn('[notifyRetraitEvents] notifyCdl error:', e.message);
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
    const role = demande.role || 'livreur';

    console.log(`[notifyRetraitEvents] event=${event?.type} | statut=${statut} | montant=${montant} | user=${demande.user_email}`);

    // Nouvelle demande → notifier les admins
    if (event?.type === 'create') {
      await notifyCdl({
        role: 'admin',
        title: '💸 Demande de retrait Bedou',
        body: `${nom} (${role}) demande un retrait de ${montant} F CFA`,
        data: {
          type: 'bedou_withdrawal_request',
          screen: 'GestionBedou',
          entity_id: demandeId,
          user_email: demande.user_email || '',
          amount: String(montant),
          role: 'admin',
        },
      });
    }

    // Changement de statut
    if (event?.type === 'update' && statut !== oldStatut) {

      // Retrait validé → notifier l'utilisateur
      if (statut === 'valide' && demande.user_email) {
        await notifyCdl({
          user_email: demande.user_email,
          title: '✅ Retrait validé !',
          body: `Votre retrait de ${montant} F CFA a été approuvé. Paiement en cours.`,
          data: {
            type: 'bedou_withdrawal_approved',
            screen: 'MonBedou',
            entity_id: demandeId,
            amount: String(montant),
            role,
          },
        });
      }

      // Retrait refusé → notifier l'utilisateur
      if (statut === 'refuse' && demande.user_email) {
        await notifyCdl({
          user_email: demande.user_email,
          title: '❌ Retrait refusé',
          body: demande.motif_refus
            ? `Motif : ${demande.motif_refus}`
            : `Votre demande de retrait de ${montant} F CFA a été refusée. Contactez le support.`,
          data: {
            type: 'bedou_withdrawal_rejected',
            screen: 'MonBedou',
            entity_id: demandeId,
            amount: String(montant),
            role,
          },
        });
      }
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[notifyRetraitEvents] ERROR:', err.message);
    return Response.json({ ok: true });
  }
});