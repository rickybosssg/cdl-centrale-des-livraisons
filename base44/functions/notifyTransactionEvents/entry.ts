/**
 * notifyTransactionEvents — Handler automation entity Transaction
 *
 * - Commission commercial créditée → commercial
 * - Seuil de retrait atteint → commercial
 * - Retrait Bedou validé/refusé → utilisateur
 * - Transaction Bedou créditée → utilisateur
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

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

    const notify = (payload) =>
      base44.asServiceRole.functions.invoke('sendCdlNotification', payload).catch(e =>
        console.warn('[notifyTransactionEvents] notify error (non-fatal):', e.message)
      );

    // ── Commission commercial créditée ──────────────────────────────────────
    if (type === 'commission_commercial' && sens === 'credit' && userEmail) {
      await notify({
        user_email: userEmail,
        title: '💵 Commission reçue !',
        body: `+${montant} F CFA de commission créditée sur votre Bedou.`,
        data: {
          type: 'commission_credited',
          entity_id: txId,
          amount: String(montant),
          role: 'commercial',
          notif_route: '/mon-bedou',
        },
      });

      // Vérifier si seuil retrait atteint (5000 F) via le solde actuel
      try {
        const bedou = await base44.asServiceRole.entities.Bedou.filter({ user_email: userEmail, role: 'commercial' });
        const solde = bedou[0]?.balance_blocked || bedou[0]?.solde_disponible || 0;
        if (solde >= 5000) {
          await notify({
            user_email: userEmail,
            title: '🎉 Seuil de retrait atteint !',
            body: `Vous avez ${solde} F CFA disponibles — vous pouvez maintenant retirer vos gains.`,
            data: {
              type: 'withdrawal_threshold_reached',
              entity_id: userEmail,
              amount: String(solde),
              role: 'commercial',
              notif_route: '/mon-bedou',
            },
          });
        }
      } catch (_) {}
    }

    // ── Remboursement / crédit Bedou client ─────────────────────────────────
    if (['compensation', 'compensation_annulation', 'remboursement'].includes(type) && sens === 'credit' && userEmail) {
      await notify({
        user_email: userEmail,
        title: '💰 Remboursement Bedou',
        body: `+${montant} F CFA remboursés sur votre Bedou.`,
        data: {
          type: 'bedou_refund',
          entity_id: txId,
          amount: String(montant),
          role: tx.user_role || 'client',
          notif_route: '/mon-bedou',
        },
      });
    }

    // ── Gains livreur ───────────────────────────────────────────────────────
    if (type === 'gain_livreur' && sens === 'credit' && userEmail) {
      await notify({
        user_email: userEmail,
        title: '💰 Gains reçus !',
        body: `+${montant} F CFA crédités sur votre Bedou.`,
        data: {
          type: 'livreur_gain',
          entity_id: txId,
          amount: String(montant),
          role: 'livreur',
          notif_route: '/mes-gains',
        },
      });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[notifyTransactionEvents] ERROR:', err.message);
    return Response.json({ ok: true });
  }
});