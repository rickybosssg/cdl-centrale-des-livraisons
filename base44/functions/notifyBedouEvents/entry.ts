/**
 * notifyBedouEvents — Handler automation entity DemandeRecharge
 *
 * - Nouvelle demande de recharge → admins
 * - Recharge validée → utilisateur
 * - Recharge refusée → utilisateur
 *
 * LOGS : action, destinataires, tokens, sent, failed, délai total
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { event, data, old_data } = body;

    if (!data) return Response.json({ ok: true });

    const demande = data;
    const demandeId = event?.entity_id || demande.id || '';
    const statut = demande.statut || '';
    const oldStatut = old_data?.statut || '';
    const montant = demande.montant || 0;
    const nom = demande.user_nom || demande.user_email || 'Un utilisateur';

    console.log(`[notifyBedouEvents] START | event=${event?.type} | statut=${statut} | montant=${montant} | user=${demande.user_email} | +${Date.now() - t0}ms`);

    const notify = (payload) => {
      console.log(`[notifyBedouEvents] → notify | user=${payload.user_email || ''} role=${payload.role || ''} type=${payload.data?.type || ''}`);
      return base44.asServiceRole.functions.invoke('sendCdlNotification', payload).catch(e =>
        console.warn('[notifyBedouEvents] notify error (non-fatal):', e.message)
      );
    };

    // Nouvelle demande → admins
    if (event?.type === 'create') {
      await notify({
        role: 'admin',
        title: '💰 Nouvelle demande de recharge Bedou',
        body: `${nom} demande ${montant.toLocaleString()} F CFA via ${demande.methode_paiement || '?'}`,
        data: {
          type: 'bedou_recharge_request',
          entity_id: demandeId,
          entity_type: 'DemandeRecharge',
          user_email: demande.user_email || '',
          amount: String(montant),
          notif_route: '/gestion-bedou',
        },
      });
      console.log(`[notifyBedouEvents] DONE create | +${Date.now() - t0}ms`);
      return Response.json({ ok: true });
    }

    // Changement de statut
    if (event?.type === 'update' && statut !== oldStatut) {

      // Validée → utilisateur
      if (statut === 'valide') {
        const bonus = demande.bonus || 0;
        const total = demande.montant_total || montant;
        await notify({
          user_email: demande.user_email,
          title: '✅ Recharge Bedou validée !',
          body: bonus > 0
            ? `${montant.toLocaleString()} F + ${bonus.toLocaleString()} F bonus = ${total.toLocaleString()} F crédités sur votre Bedou !`
            : `Votre recharge de ${montant.toLocaleString()} F CFA a été créditée sur votre Bedou.`,
          data: {
            type: 'bedou_recharge_approved',
            entity_id: demandeId,
            entity_type: 'DemandeRecharge',
            amount: String(total),
            notif_route: '/mon-bedou',
          },
        });
      }

      // Refusée → utilisateur
      if (statut === 'refuse') {
        await notify({
          user_email: demande.user_email,
          title: '❌ Recharge Bedou refusée',
          body: demande.motif_refus
            ? `Motif : ${demande.motif_refus}`
            : `Votre demande de recharge de ${montant.toLocaleString()} F CFA a été refusée. Contactez le support.`,
          data: {
            type: 'bedou_recharge_rejected',
            entity_id: demandeId,
            entity_type: 'DemandeRecharge',
            amount: String(montant),
            notif_route: '/mon-bedou',
          },
        });
      }
    }

    console.log(`[notifyBedouEvents] DONE | +${Date.now() - t0}ms`);
    return Response.json({ ok: true });

  } catch (err) {
    console.error('[notifyBedouEvents] ERROR:', err.message);
    return Response.json({ ok: true });
  }
});