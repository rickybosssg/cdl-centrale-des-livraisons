/**
 * notifyTransactionEvents — Handler automation entity Transaction
 *
 * - Commission commercial créditée → commercial
 * - Seuil de retrait atteint → commercial
 * - Retrait Bedou validé/refusé → utilisateur
 * - Transaction Bedou créditée → utilisateur
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
    console.warn('[notifyTransactionEvents] notifyCdl error:', e.message);
  }
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { event, data, old_data } = body;

    if (!data || event?.type !== 'create') return Response.json({ ok: true });

    const tx = data;
    const txId = event?.entity_id || tx.id || '';
    const type = tx.type || '';
    const sens = tx.sens || '';
    const montant = tx.montant || 0;
    const userEmail = tx.user_email || '';

    console.log(`[notifyTransactionEvents] type=${type} | sens=${sens} | montant=${montant} | user=${userEmail}`);

    // ── Commission commercial créditée ──────────────────────────────────────
    if (type === 'commission_commercial' && sens === 'credit' && userEmail) {
      await notifyCdl({
        user_email: userEmail,
        title: '💵 Commission reçue !',
        body: `+${montant} F CFA de commission créditée sur votre Bedou.`,
        data: {
          type: 'commission_credited',
          screen: 'MonBedou',
          entity_id: txId,
          amount: String(montant),
          role: 'commercial',
        },
      });

      // Vérifier si seuil retrait atteint (5000 F) via le solde actuel
      try {
        const base44 = createClientFromRequest(req);
        const bedou = await base44.asServiceRole.entities.Bedou.filter({ user_email: userEmail, role: 'commercial' });
        const solde = bedou[0]?.balance_blocked || bedou[0]?.solde_disponible || 0;
        if (solde >= 5000) {
          await notifyCdl({
            user_email: userEmail,
            title: '🎉 Seuil de retrait atteint !',
            body: `Vous avez ${solde} F CFA disponibles — vous pouvez maintenant retirer vos gains.`,
            data: {
              type: 'withdrawal_threshold_reached',
              screen: 'MonBedou',
              entity_id: userEmail,
              amount: String(solde),
              role: 'commercial',
            },
          });
        }
      } catch (_) {}
    }

    // ── Remboursement / crédit Bedou client ─────────────────────────────────
    if (['compensation', 'compensation_annulation', 'remboursement'].includes(type) && sens === 'credit' && userEmail) {
      await notifyCdl({
        user_email: userEmail,
        title: '💰 Remboursement Bedou',
        body: `+${montant} F CFA remboursés sur votre Bedou.`,
        data: {
          type: 'bedou_refund',
          screen: 'MonBedou',
          entity_id: txId,
          amount: String(montant),
          role: tx.user_role || 'client',
        },
      });
    }

    // ── Gains livreur ───────────────────────────────────────────────────────
    if (type === 'gain_livreur' && sens === 'credit' && userEmail) {
      await notifyCdl({
        user_email: userEmail,
        title: '💰 Gains reçus !',
        body: `+${montant} F CFA crédités sur votre Bedou.`,
        data: {
          type: 'livreur_gain',
          screen: 'MesGains',
          entity_id: txId,
          amount: String(montant),
          role: 'livreur',
        },
      });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[notifyTransactionEvents] ERROR:', err.message);
    return Response.json({ ok: true });
  }
});