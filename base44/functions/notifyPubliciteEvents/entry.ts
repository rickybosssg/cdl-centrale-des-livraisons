/**
 * notifyPubliciteEvents — Handler automation entity Publicite
 *
 * - Nouvelle publicité soumise → admins
 * - Publicité validée (active=true) → annonceur
 * - Publicité suspendue → annonceur
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const { event, data, old_data } = body;

    if (!data) return Response.json({ ok: true });

    const pub = data;
    const pubId = event?.entity_id || pub.id || '';
    const oldActive = old_data?.active;
    const oldSuspended = old_data?.suspended;
    const annonceurEmail = pub.created_by || '';

    console.log(`[notifyPubliciteEvents] event=${event?.type} | active=${pub.active} | suspended=${pub.suspended} | id=${pubId}`);

    const notify = (payload) =>
      base44.asServiceRole.functions.invoke('sendCdlNotification', payload).catch(e =>
        console.warn('[notifyPubliciteEvents] notify error (non-fatal):', e.message)
      );

    if (event?.type === 'create') {
      await notify({
        role: 'admin',
        title: '📢 Nouvelle publicité soumise',
        body: `${pub.nom_annonceur || annonceurEmail} a soumis une pub : "${pub.titre}"`,
        data: { type: 'new_ad_submitted', entity_id: pubId, entity_type: 'Publicite', target_role: 'admin', deep_link: '/gerer-publicites', notif_route: '/gerer-publicites' },
      });
    }

    if (event?.type === 'update') {
      if (pub.active === true && oldActive !== true && annonceurEmail) {
        await notify({
          user_email: annonceurEmail,
          title: '✅ Publicité validée !',
          body: `Votre publicité "${pub.titre}" est maintenant en ligne.`,
          data: { type: 'ad_validated', entity_id: pubId, entity_type: 'Publicite', target_role: 'annonceur', deep_link: '/mes-publicites-annonceur', notif_route: '/mes-publicites-annonceur' },
        });
      }

      if (pub.suspended === true && oldSuspended !== true && annonceurEmail) {
        await notify({
          user_email: annonceurEmail,
          title: '⚠️ Publicité suspendue',
          body: `Votre publicité "${pub.titre}" a été suspendue. Contactez l'équipe CDL.`,
          data: { type: 'ad_suspended', entity_id: pubId, entity_type: 'Publicite', target_role: 'annonceur', deep_link: '/mes-publicites-annonceur', notif_route: '/mes-publicites-annonceur' },
        });
      }

      if (pub.active === false && oldActive === true && annonceurEmail) {
        await notify({
          user_email: annonceurEmail,
          title: '📢 Publicité désactivée',
          body: `Votre publicité "${pub.titre}" a été désactivée.`,
          data: { type: 'ad_deactivated', entity_id: pubId, entity_type: 'Publicite', target_role: 'annonceur', deep_link: '/mes-publicites-annonceur', notif_route: '/mes-publicites-annonceur' },
        });
      }

      if (pub.deleted === true && old_data?.deleted !== true && !pub.active && annonceurEmail) {
        await notify({
          user_email: annonceurEmail,
          title: '❌ Publicité refusée',
          body: `Votre publicité "${pub.titre}" a été refusée. Contactez l'équipe CDL pour plus d'informations.`,
          data: { type: 'ad_refused', entity_id: pubId, entity_type: 'Publicite', target_role: 'annonceur', deep_link: '/mes-publicites-annonceur', notif_route: '/mes-publicites-annonceur' },
        });
      }
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[notifyPubliciteEvents] ERROR:', err.message);
    return Response.json({ ok: true });
  }
});