/**
 * notifyCommandeEvents — Handler automation entity CommandePartenaire
 *
 * - Nouvelle commande → partenaire + admins
 * - Commande acceptée → client
 * - Commande livrée → partenaire
 * - Commande annulée → client + partenaire
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const { event, data, old_data } = body;

    if (!data) return Response.json({ ok: true });

    const commande = data;
    const commandeId = event?.entity_id || commande.id || '';
    const statut = commande.statut || '';
    const oldStatut = old_data?.statut || '';
    const nom_commerce = commande.partenaire_nom || 'Le commerce';
    const nom_client = commande.client_nom || commande.client_email || 'Un client';
    const total = commande.total_commande || 0;

    console.log(`[notifyCommandeEvents] event=${event?.type} | statut=${statut} | id=${commandeId}`);

    const notify = (payload) =>
      base44.asServiceRole.functions.invoke('sendCdlNotification', payload).catch(e =>
        console.warn('[notifyCommandeEvents] notify error (non-fatal):', e.message)
      );

    // Nouvelle commande → notifier partenaire
    if (event?.type === 'create') {
      if (commande.partenaire_email) {
        await notify({
          user_email: commande.partenaire_email,
          title: '🛒 Nouvelle commande !',
          body: `${nom_client} vient de commander ${total} F CFA chez vous.`,
          data: { type: 'new_order', entity_id: commandeId, role: 'partenaire', notif_route: '/commandes-partenaire' },
        });
      }
      await notify({
        role: 'admin',
        title: '🛒 Nouvelle commande marketplace',
        body: `${nom_client} → ${nom_commerce} : ${total} F CFA`,
        data: { type: 'new_marketplace_order', entity_id: commandeId, role: 'admin', notif_route: '/gerer-courses' },
      });
    }

    // Changements de statut
    if (event?.type === 'update' && statut !== oldStatut) {

      if (statut === 'acceptee' && commande.client_email) {
        await notify({
          user_email: commande.client_email,
          title: '✅ Commande acceptée !',
          body: `${nom_commerce} prépare votre commande. Livraison en cours d'organisation.`,
          data: { type: 'order_accepted', entity_id: commandeId, role: 'client', notif_route: `/commande-marketplace/${commandeId}` },
        });
      }

      if (statut === 'en_livraison' && commande.client_email) {
        await notify({
          user_email: commande.client_email,
          title: '🛵 Commande en route !',
          body: `Votre commande de ${nom_commerce} est en cours de livraison.`,
          data: { type: 'order_delivering', entity_id: commandeId, role: 'client', notif_route: `/commande-marketplace/${commandeId}` },
        });
      }

      if (statut === 'livree') {
        if (commande.client_email) {
          await notify({
            user_email: commande.client_email,
            title: '🎉 Commande livrée !',
            body: `Votre commande de ${nom_commerce} a été livrée. Bonne dégustation !`,
            data: { type: 'order_delivered', entity_id: commandeId, role: 'client', notif_route: '/mes-commandes-marketplace' },
          });
        }
        if (commande.partenaire_email) {
          await notify({
            user_email: commande.partenaire_email,
            title: '💰 Commande livrée — paiement à venir',
            body: `La commande de ${nom_client} (${total} F) a été livrée avec succès.`,
            data: { type: 'order_delivered', entity_id: commandeId, role: 'partenaire', notif_route: '/commandes-partenaire' },
          });
        }
      }

      if (statut === 'annulee') {
        if (commande.client_email) {
          await notify({
            user_email: commande.client_email,
            title: '❌ Commande annulée',
            body: `Votre commande chez ${nom_commerce} a été annulée.`,
            data: { type: 'order_cancelled', entity_id: commandeId, role: 'client', notif_route: '/mes-commandes-marketplace' },
          });
        }
        if (commande.partenaire_email) {
          await notify({
            user_email: commande.partenaire_email,
            title: '❌ Commande annulée',
            body: `La commande de ${nom_client} (${total} F) a été annulée.`,
            data: { type: 'order_cancelled', entity_id: commandeId, role: 'partenaire', notif_route: '/commandes-partenaire' },
          });
        }
      }
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[notifyCommandeEvents] ERROR:', err.message);
    return Response.json({ ok: true });
  }
});