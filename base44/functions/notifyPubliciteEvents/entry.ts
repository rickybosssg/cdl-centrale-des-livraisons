/**
 * notifyPubliciteEvents — Handler automation entity Publicite
 *
 * - Nouvelle publicité soumise → admins
 * - Publicité validée (active=true) → annonceur
 * - Publicité suspendue → annonceur
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
    console.warn('[notifyPubliciteEvents] notifyCdl error:', e.message);
  }
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { event, data, old_data } = body;

    if (!data) return Response.json({ ok: true });

    const pub = data;
    const pubId = event?.entity_id || pub.id || '';
    const oldActive = old_data?.active;
    const oldSuspended = old_data?.suspended;
    const annonceurEmail = pub.created_by || '';

    console.log(`[notifyPubliciteEvents] event=${event?.type} | active=${pub.active} | suspended=${pub.suspended} | id=${pubId}`);

    // Nouvelle publicité → admins
    if (event?.type === 'create') {
      await notifyCdl({
        role: 'admin',
        title: '📢 Nouvelle publicité soumise',
        body: `${pub.nom_annonceur || annonceurEmail} a soumis une pub : "${pub.titre}"`,
        data: {
          type: 'new_ad_submitted',
          screen: 'GererPublicites',
          entity_id: pubId,
          role: 'admin',
        },
      });
    }

    // Changements sur update
    if (event?.type === 'update') {

      // Publicité validée (active passée à true) → annonceur
      if (pub.active === true && oldActive !== true && annonceurEmail) {
        await notifyCdl({
          user_email: annonceurEmail,
          title: '✅ Publicité validée !',
          body: `Votre publicité "${pub.titre}" est maintenant en ligne.`,
          data: {
            type: 'ad_validated',
            screen: 'MesPublicitesAnnonceur',
            entity_id: pubId,
            role: 'annonceur',
          },
        });
      }

      // Publicité suspendue → annonceur
      if (pub.suspended === true && oldSuspended !== true && annonceurEmail) {
        await notifyCdl({
          user_email: annonceurEmail,
          title: '⚠️ Publicité suspendue',
          body: `Votre publicité "${pub.titre}" a été suspendue. Contactez l'équipe CDL.`,
          data: {
            type: 'ad_suspended',
            screen: 'MesPublicitesAnnonceur',
            entity_id: pubId,
            role: 'annonceur',
          },
        });
      }

      // Publicité désactivée (active passée à false) → annonceur
      if (pub.active === false && oldActive === true && annonceurEmail) {
        await notifyCdl({
          user_email: annonceurEmail,
          title: '📢 Publicité désactivée',
          body: `Votre publicité "${pub.titre}" a été désactivée.`,
          data: {
            type: 'ad_deactivated',
            screen: 'MesPublicitesAnnonceur',
            entity_id: pubId,
            role: 'annonceur',
          },
        });
      }
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[notifyPubliciteEvents] ERROR:', err.message);
    return Response.json({ ok: true });
  }
});