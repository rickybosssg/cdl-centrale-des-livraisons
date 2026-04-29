/**
 * notifyProfileEvents — Handler automation entity UserProfile
 *
 * Déclenché sur create + update de UserProfile.
 * - Nouvelle demande → admins (nouvelle inscription livreur/partenaire)
 * - Profil validé/refusé/suspendu → utilisateur concerné
 *
 * Utilise asServiceRole.functions.invoke pour être sûr d'appeler sendCdlNotification
 * avec les bonnes permissions, sans dépendre d'un Bearer token utilisateur.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ROLE_LABELS = {
  livreur: 'Livreur',
  partenaire: 'Partenaire',
  commercial: 'Commercial',
  client: 'Client',
  annonceur: 'Annonceur',
};

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { event, data, old_data } = body;

    if (!data) return Response.json({ ok: true });

    const profile = data;
    const profileId = event?.entity_id || profile.id || '';
    const statut = profile.status || '';
    const oldStatut = old_data?.status || '';
    const roleLabel = ROLE_LABELS[profile.profile_type] || profile.profile_type;

    console.log(`[notifyProfileEvents] event=${event?.type} | statut=${statut} | oldStatut=${oldStatut} | role=${profile.profile_type}`);

    const base44 = createClientFromRequest(req);

    const notify = (payload) =>
      base44.asServiceRole.functions.invoke('sendCdlNotification', payload).catch(e =>
        console.warn('[notifyProfileEvents] notify error (non-fatal):', e.message)
      );

    // ── CRÉATION : nouvelle demande de profil → notifier les admins ──────────
    if (event?.type === 'create') {
      // Notifier les admins pour toute nouvelle inscription livreur ou partenaire
      const rolesImportants = ['livreur', 'partenaire', 'commercial', 'annonceur'];
      if (rolesImportants.includes(profile.profile_type)) {
        await notify({
          role: 'admin',
          title: `📝 Nouvelle inscription ${roleLabel}`,
          body: `${profile.nom || profile.prenom || profile.user_email} a soumis une demande de profil ${roleLabel}.`,
          data: {
            type: 'new_profile_request',
            entity_id: profileId,
            role: 'admin',
            profile_type: profile.profile_type,
            notif_route: '/gestion-profils',
          },
        });
      }
      return Response.json({ ok: true });
    }

    // ── UPDATE : seulement si le statut a vraiment changé ────────────────────
    if (event?.type !== 'update' || statut === oldStatut) {
      return Response.json({ ok: true });
    }

    // Documents soumis → notifier admins
    if (statut === 'en_attente' && oldStatut !== 'en_attente') {
      await notify({
        role: 'admin',
        title: `📋 Documents soumis — ${roleLabel}`,
        body: `${profile.nom || profile.user_email} a soumis ses documents pour validation ${roleLabel}.`,
        data: {
          type: 'profile_pending_review',
          entity_id: profileId,
          role: 'admin',
          profile_type: profile.profile_type,
          notif_route: '/gestion-profils',
        },
      });
    }

    // Profil validé → notifier l'utilisateur
    if (statut === 'actif' && oldStatut !== 'actif') {
      await notify({
        user_email: profile.user_email,
        title: `✅ Profil ${roleLabel} validé !`,
        body: `Félicitations ! Votre profil ${roleLabel} a été validé. Vous pouvez commencer dès maintenant.`,
        data: {
          type: 'profile_validated',
          entity_id: profileId,
          role: profile.profile_type,
          notif_route: '/',
        },
      });
    }

    // Profil refusé → notifier l'utilisateur
    if (statut === 'refuse' && oldStatut !== 'refuse') {
      await notify({
        user_email: profile.user_email,
        title: `❌ Profil ${roleLabel} refusé`,
        body: profile.refusal_reason
          ? `Motif : ${profile.refusal_reason}`
          : `Votre demande de profil ${roleLabel} n'a pas été acceptée. Contactez le support CDL.`,
        data: {
          type: 'profile_refused',
          entity_id: profileId,
          role: profile.profile_type,
          notif_route: '/settings',
        },
      });
    }

    // Profil suspendu → notifier l'utilisateur
    if (statut === 'suspendu' && oldStatut !== 'suspendu') {
      await notify({
        user_email: profile.user_email,
        title: `⚠️ Profil ${roleLabel} suspendu`,
        body: `Votre profil ${roleLabel} a été suspendu. Contactez le support CDL pour plus d'informations.`,
        data: {
          type: 'profile_suspended',
          entity_id: profileId,
          role: profile.profile_type,
          notif_route: '/settings',
        },
      });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[notifyProfileEvents] ERROR:', err.message);
    return Response.json({ ok: true }); // Ne jamais bloquer l'automation
  }
});