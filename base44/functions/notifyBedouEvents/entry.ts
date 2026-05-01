/**
 * notifyBedouEvents — Handler automation entity DemandeRecharge
 *
 * - Nouvelle demande de recharge → admins
 * - Recharge validée → utilisateur
 * - Recharge refusée → utilisateur
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
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

    console.log(`[notifyBedouEvents] event=${event?.type} | statut=${statut} | montant=${montant} | user=${demande.user_email}`);

    const notify = (payload) =>
      base44.asServiceRole.functions.invoke('sendCdlNotification', payload).catch(e =>
        console.warn('[notifyBedouEvents] notify error (non-fatal):', e.message)
      );

    // Nouvelle demande → notifier les admins
    if (event?.type === 'create') {
      await notify({
        role: 'admin',
        title: '💰 Nouvelle demande de rechargement Bedou',
        body: `${nom} demande un rechargement de ${montant} F CFA`,
        data: {
          type: 'bedou_recharge_request',
          entity_id: demandeId,
          user_email: demande.user_email || '',
          amount: String(montant),
          request_id: demandeId,
          role: 'admin',
          notif_route: '/gestion-transactions',
        },
      });
    }

    // Changement de statut
    if (event?.type === 'update' && statut !== oldStatut) {

      // Recharge validée → notifier l'utilisateur
      if (statut === 'valide') {
        await notify({
          user_email: demande.user_email,
          title: '✅ Rechargement Bedou validé !',
          body: `Votre rechargement de ${montant} F CFA a été validé et crédité sur votre Bedou.`,
          data: {
            type: 'bedou_recharge_approved',
            entity_id: demandeId,
            amount: String(montant),
            role: demande.role || 'client',
            notif_route: '/mon-bedou',
          },
        });
      }

      // Recharge refusée → notifier l'utilisateur
      if (statut === 'refuse') {
        await notify({
          user_email: demande.user_email,
          title: '❌ Rechargement Bedou refusé',
          body: demande.motif_refus
            ? `Motif : ${demande.motif_refus}`
            : `Votre demande de rechargement de ${montant} F CFA a été refusée. Contactez le support.`,
          data: {
            type: 'bedou_recharge_rejected',
            entity_id: demandeId,
            amount: String(montant),
            role: demande.role || 'client',
            notif_route: '/mon-bedou',
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