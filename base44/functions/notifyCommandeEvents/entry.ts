/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  notifyCommandeEvents — VERROUILLÉ                          ║
 * ║  NOTIFICATIONS_SYSTEM_LOCKED = true                         ║
 * ║  ❌ NE PAS MODIFIER les appels notify()                     ║
 * ║  ✅ Toujours retourner { ok: true }                         ║
 * ║  LOGS : event_type | user_id | fcm_sent | execution_time   ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * notifyCommandeEvents — Handler automation entity CommandePartenaire
 *
 * - Nouvelle commande → partenaire + admin
 * - Commande acceptée/en livraison/livrée/annulée → client (+ partenaire si livrée/annulée)
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

    const commande = data;
    const commandeId = event?.entity_id || commande.id || '';
    const statut = commande.statut || '';
    const oldStatut = old_data?.statut || '';
    const nom_commerce = commande.partenaire_nom || 'Le commerce';
    const nom_client = commande.client_nom || commande.client_email || 'Un client';
    const total = commande.total_commande || 0;

    console.log(`[notifyCommandeEvents] START | event=${event?.type} | statut=${statut} | id=${commandeId}`);

    const notify = (payload) => {
      console.log(`[notifyCommandeEvents] → notify | user=${payload.user_email || ''} role=${payload.role || ''} type=${payload.data?.type || ''}`);
      return base44.asServiceRole.functions.invoke('sendCdlNotification', payload).catch(e =>
        console.warn('[notifyCommandeEvents] notify error (non-fatal):', e.message)
      );
    };

    // Nouvelle commande → partenaire + admin
    if (event?.type === 'create') {
      const tasks = [];

      if (commande.partenaire_email) {
        tasks.push(notify({
          user_email: commande.partenaire_email,
          title: '🛒 Nouvelle commande !',
          body: `${nom_client} vient de commander ${total.toLocaleString()} F CFA chez vous.`,
          data: { type: 'new_order', entity_id: commandeId, entity_type: 'CommandePartenaire', notif_route: '/commandes-partenaire' },
        }));
      }

      tasks.push(notify({
        role: 'admin',
        title: '🛒 Nouvelle commande marketplace',
        body: `${nom_client} → ${nom_commerce} : ${total.toLocaleString()} F CFA`,
        data: { type: 'new_marketplace_order', entity_id: commandeId, entity_type: 'CommandePartenaire', notif_route: '/gerer-courses' },
      }));

      await Promise.allSettled(tasks);
      console.log(`[notifyCommandeEvents] DONE create | +${Date.now() - t0}ms`);
      return Response.json({ ok: true });
    }

    // Changements de statut
    if (event?.type !== 'update' || statut === oldStatut) {
      return Response.json({ ok: true });
    }

    const tasks = [];

    if (statut === 'acceptee' && commande.client_email) {
      tasks.push(notify({
        user_email: commande.client_email,
        title: '✅ Commande acceptée !',
        body: `${nom_commerce} prépare votre commande. Livraison en cours d'organisation.`,
        data: { type: 'order_accepted', entity_id: commandeId, entity_type: 'CommandePartenaire', notif_route: `/commande-marketplace/${commandeId}` },
      }));
    }

    if (statut === 'en_livraison' && commande.client_email) {
      tasks.push(notify({
        user_email: commande.client_email,
        title: '🛵 Commande en route !',
        body: `Votre commande de ${nom_commerce} est en cours de livraison.`,
        data: { type: 'order_delivering', entity_id: commandeId, entity_type: 'CommandePartenaire', notif_route: `/commande-marketplace/${commandeId}` },
      }));
    }

    if (statut === 'livree') {
      if (commande.client_email) {
        tasks.push(notify({
          user_email: commande.client_email,
          title: '🎉 Commande livrée !',
          body: `Votre commande de ${nom_commerce} a été livrée. Bonne dégustation !`,
          data: { type: 'order_delivered', entity_id: commandeId, entity_type: 'CommandePartenaire', notif_route: '/mes-commandes-marketplace' },
        }));
      }
      if (commande.partenaire_email) {
        tasks.push(notify({
          user_email: commande.partenaire_email,
          title: '💰 Commande livrée !',
          body: `La commande de ${nom_client} (${total.toLocaleString()} F) a été livrée avec succès.`,
          data: { type: 'order_delivered', entity_id: commandeId, entity_type: 'CommandePartenaire', notif_route: '/commandes-partenaire' },
        }));
      }
    }

    if (statut === 'annulee') {
      if (commande.client_email) {
        tasks.push(notify({
          user_email: commande.client_email,
          title: '❌ Commande annulée',
          body: `Votre commande chez ${nom_commerce} a été annulée.`,
          data: { type: 'order_cancelled', entity_id: commandeId, entity_type: 'CommandePartenaire', notif_route: '/mes-commandes-marketplace' },
        }));
      }
      if (commande.partenaire_email) {
        tasks.push(notify({
          user_email: commande.partenaire_email,
          title: '❌ Commande annulée',
          body: `La commande de ${nom_client} (${total.toLocaleString()} F) a été annulée.`,
          data: { type: 'order_cancelled', entity_id: commandeId, entity_type: 'CommandePartenaire', notif_route: '/commandes-partenaire' },
        }));
      }
    }

    await Promise.allSettled(tasks);
    console.log(`[notifyCommandeEvents] DONE update statut=${statut} tasks=${tasks.length} | +${Date.now() - t0}ms`);
    return Response.json({ ok: true });

  } catch (err) {
    console.error(`[notifyCommandeEvents] 🔴 ERREUR CRITIQUE | ${err.message} | execution_time=${Date.now() - t0}ms`);
    return Response.json({ ok: true });
  }
});