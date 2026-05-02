/**
 * notifyRetraitEvents — Handler automation entity DemandeRetrait
 *
 * - Nouvelle demande retrait → admins
 * - Retrait validé → utilisateur
 * - Retrait refusé → utilisateur
 *
 * LOGS : action, destinataires, délai total
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
    const role = demande.role || 'livreur';

    console.log(`[notifyRetraitEvents] START | event=${event?.type} | statut=${statut} | montant=${montant} | user=${demande.user_email} | +${Date.now() - t0}ms`);

    const notify = (payload) => {
      console.log(`[notifyRetraitEvents] → notify | user=${payload.user_email || ''} role=${payload.role || ''} type=${payload.data?.type || ''}`);
      return base44.asServiceRole.functions.invoke('sendCdlNotification', payload).catch(e =>
        console.warn('[notifyRetraitEvents] notify error (non-fatal):', e.message)
      );
    };

    // Nouvelle demande → admins
    if (event?.type === 'create') {
      await notify({
        role: 'admin',
        title: '💸 Demande de retrait Bedou',
        body: `${nom} (${role}) demande un retrait de ${montant.toLocaleString()} F CFA via ${demande.methode || '?'}`,
        data: {
          type: 'bedou_withdrawal_request',
          entity_id: demandeId,
          entity_type: 'DemandeRetrait',
          user_email: demande.user_email || '',
          amount: String(montant),
          notif_route: '/gestion-bedou',
        },
      });
      console.log(`[notifyRetraitEvents] DONE create | +${Date.now() - t0}ms`);
      return Response.json({ ok: true });
    }

    // Changement de statut
    if (event?.type === 'update' && statut !== oldStatut) {

      // Validé → utilisateur
      if (statut === 'valide' && demande.user_email) {
        await notify({
          user_email: demande.user_email,
          title: '✅ Retrait Bedou validé !',
          body: `Votre retrait de ${montant.toLocaleString()} F CFA a été approuvé. Paiement en cours.`,
          data: {
            type: 'bedou_withdrawal_approved',
            entity_id: demandeId,
            entity_type: 'DemandeRetrait',
            amount: String(montant),
            notif_route: '/mon-bedou',
          },
        });
      }

      // Refusé → utilisateur
      if (statut === 'refuse' && demande.user_email) {
        await notify({
          user_email: demande.user_email,
          title: '❌ Retrait refusé',
          body: demande.motif_refus
            ? `Motif : ${demande.motif_refus}`
            : `Votre demande de retrait de ${montant.toLocaleString()} F CFA a été refusée. Contactez le support.`,
          data: {
            type: 'bedou_withdrawal_rejected',
            entity_id: demandeId,
            entity_type: 'DemandeRetrait',
            amount: String(montant),
            notif_route: '/mon-bedou',
          },
        });
      }
    }

    console.log(`[notifyRetraitEvents] DONE | +${Date.now() - t0}ms`);
    return Response.json({ ok: true });

  } catch (err) {
    console.error('[notifyRetraitEvents] ERROR:', err.message);
    return Response.json({ ok: true });
  }
});