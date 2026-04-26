/**
 * notifyCommandeEvents — Handler automation entity CommandePartenaire
 *
 * - Nouvelle commande → partenaire + admins
 * - Commande acceptée → client
 * - Commande livrée → partenaire
 * - Commande annulée → client + partenaire
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
    console.warn('[notifyCommandeEvents] notifyCdl error:', e.message);
  }
}

Deno.serve(async (req) => {
  try {
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

    // Nouvelle commande → notifier partenaire
    if (event?.type === 'create') {
      if (commande.partenaire_email) {
        await notifyCdl({
          user_email: commande.partenaire_email,
          title: '🛒 Nouvelle commande !',
          body: `${nom_client} vient de commander ${total} F CFA chez vous.`,
          data: {
            type: 'new_order',
            screen: 'CommandesPartenaire',
            entity_id: commandeId,
            role: 'partenaire',
          },
        });
      }
      // Notifier les admins aussi
      await notifyCdl({
        role: 'admin',
        title: '🛒 Nouvelle commande marketplace',
        body: `${nom_client} → ${nom_commerce} : ${total} F CFA`,
        data: {
          type: 'new_marketplace_order',
          screen: 'GererCourses',
          entity_id: commandeId,
          role: 'admin',
        },
      });
    }

    // Changements de statut
    if (event?.type === 'update' && statut !== oldStatut) {

      // Commande acceptée → client
      if (statut === 'acceptee' && commande.client_email) {
        await notifyCdl({
          user_email: commande.client_email,
          title: '✅ Commande acceptée !',
          body: `${nom_commerce} prépare votre commande. Livraison en cours d'organisation.`,
          data: {
            type: 'order_accepted',
            screen: 'CommandeMarketplaceDetail',
            entity_id: commandeId,
            role: 'client',
          },
        });
      }

      // Commande en livraison → client
      if (statut === 'en_livraison' && commande.client_email) {
        await notifyCdl({
          user_email: commande.client_email,
          title: '🛵 Commande en route !',
          body: `Votre commande de ${nom_commerce} est en cours de livraison.`,
          data: {
            type: 'order_delivering',
            screen: 'CommandeMarketplaceDetail',
            entity_id: commandeId,
            role: 'client',
          },
        });
      }

      // Commande livrée → client + partenaire
      if (statut === 'livree') {
        if (commande.client_email) {
          await notifyCdl({
            user_email: commande.client_email,
            title: '🎉 Commande livrée !',
            body: `Votre commande de ${nom_commerce} a été livrée. Bonne dégustation !`,
            data: {
              type: 'order_delivered',
              screen: 'MesCommandesMarketplace',
              entity_id: commandeId,
              role: 'client',
            },
          });
        }
        if (commande.partenaire_email) {
          await notifyCdl({
            user_email: commande.partenaire_email,
            title: '💰 Commande livrée — paiement à venir',
            body: `La commande de ${nom_client} (${total} F) a été livrée avec succès.`,
            data: {
              type: 'order_delivered',
              screen: 'DashboardPartenaire',
              entity_id: commandeId,
              role: 'partenaire',
            },
          });
        }
      }

      // Commande annulée → client + partenaire
      if (statut === 'annulee') {
        if (commande.client_email) {
          await notifyCdl({
            user_email: commande.client_email,
            title: '❌ Commande annulée',
            body: `Votre commande chez ${nom_commerce} a été annulée.`,
            data: {
              type: 'order_cancelled',
              screen: 'MesCommandesMarketplace',
              entity_id: commandeId,
              role: 'client',
            },
          });
        }
        if (commande.partenaire_email) {
          await notifyCdl({
            user_email: commande.partenaire_email,
            title: '❌ Commande annulée',
            body: `La commande de ${nom_client} (${total} F) a été annulée.`,
            data: {
              type: 'order_cancelled',
              screen: 'CommandesPartenaire',
              entity_id: commandeId,
              role: 'partenaire',
            },
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