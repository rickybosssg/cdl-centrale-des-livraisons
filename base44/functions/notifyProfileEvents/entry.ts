/**
 * notifyProfileEvents — Handler automation entity UserProfile
 *
 * Déclenché sur create + update de UserProfile.
 * - Nouvelle demande → admins
 * - Profil validé/refusé → utilisateur concerné
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
    console.warn('[notifyProfileEvents] notifyCdl error:', e.message);
  }
}

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

    // Nouvelle demande de profil → notifier les admins
    if (event?.type === 'create' && ['en_attente', 'draft', 'incomplet'].includes(statut)) {
      await notifyCdl({
        role: 'admin',
        title: `📝 Nouvelle demande ${roleLabel}`,
        body: `${profile.user_email} a soumis une demande de profil ${roleLabel}.`,
        data: {
          type: 'new_profile_request',
          screen: 'GestionProfils',
          entity_id: profileId,
          role: 'admin',
          profile_type: profile.profile_type,
        },
      });
    }

    // Changement de statut
    if (event?.type === 'update' && statut !== oldStatut) {

      // Passage en_attente (documents soumis) → notifier admins
      if (statut === 'en_attente' && oldStatut !== 'en_attente') {
        await notifyCdl({
          role: 'admin',
          title: `📋 Documents soumis — ${roleLabel}`,
          body: `${profile.user_email} a soumis ses documents pour validation ${roleLabel}.`,
          data: {
            type: 'profile_pending_review',
            screen: 'GestionProfils',
            entity_id: profileId,
            role: 'admin',
            profile_type: profile.profile_type,
          },
        });
      }

      // Profil validé → notifier l'utilisateur
      if (statut === 'actif' && oldStatut !== 'actif') {
        await notifyCdl({
          user_email: profile.user_email,
          title: `✅ Profil ${roleLabel} validé !`,
          body: `Félicitations ! Votre profil ${roleLabel} a été validé. Vous pouvez commencer.`,
          data: {
            type: 'profile_validated',
            screen: 'Home',
            entity_id: profileId,
            role: profile.profile_type,
          },
        });
      }

      // Profil refusé → notifier l'utilisateur
      if (statut === 'refuse' && oldStatut !== 'refuse') {
        await notifyCdl({
          user_email: profile.user_email,
          title: `❌ Profil ${roleLabel} refusé`,
          body: profile.refusal_reason
            ? `Motif : ${profile.refusal_reason}`
            : `Votre demande de profil ${roleLabel} n'a pas été acceptée. Contactez le support.`,
          data: {
            type: 'profile_refused',
            screen: 'Settings',
            entity_id: profileId,
            role: profile.profile_type,
          },
        });
      }

      // Profil suspendu → notifier l'utilisateur
      if (statut === 'suspendu' && oldStatut !== 'suspendu') {
        await notifyCdl({
          user_email: profile.user_email,
          title: `⚠️ Profil ${roleLabel} suspendu`,
          body: `Votre profil ${roleLabel} a été suspendu. Contactez le support CDL.`,
          data: {
            type: 'profile_suspended',
            screen: 'Settings',
            entity_id: profileId,
            role: profile.profile_type,
          },
        });
      }
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[notifyProfileEvents] ERROR:', err.message);
    return Response.json({ ok: true });
  }
});