/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  notifyProfileEvents — VERROUILLÉ                           ║
 * ║  NOTIFICATIONS_SYSTEM_LOCKED = true                         ║
 * ║  ❌ NE PAS MODIFIER les appels notify()                     ║
 * ║  ✅ Toujours retourner { ok: true }                         ║
 * ║  LOGS : event_type | user_id | fcm_sent | execution_time   ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * notifyProfileEvents — Handler automation entity UserProfile
 * - Nouvelle demande → admins
 * - Profil validé/refusé/suspendu → utilisateur concerné
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
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const { event, data, old_data } = body;

    if (!data) return Response.json({ ok: true });

    const profile = data;
    const profileId = event?.entity_id || profile.id || '';
    const statut = profile.status || '';
    const oldStatut = old_data?.status || '';
    const roleLabel = ROLE_LABELS[profile.profile_type] || profile.profile_type;
    const nomAffiche = profile.nom || profile.prenom || profile.user_email || '?';

    console.log(`[notifyProfileEvents] START | event=${event?.type} | statut=${statut} | oldStatut=${oldStatut} | role=${profile.profile_type} | user=${profile.user_email}`);

    const base44 = createClientFromRequest(req);

    const notify = (payload) => {
      console.log(`[notifyProfileEvents] → notify | user=${payload.user_email || ''} role=${payload.role || ''} type=${payload.data?.type || ''}`);
      return base44.asServiceRole.functions.invoke('sendCdlNotification', payload).catch(e =>
        console.warn('[notifyProfileEvents] notify error (non-fatal):', e.message)
      );
    };

    // ── CRÉATION : nouvelles inscriptions importantes → admins ───────────────
    if (event?.type === 'create') {
      const rolesImportants = ['livreur', 'partenaire', 'commercial', 'annonceur'];
      if (rolesImportants.includes(profile.profile_type)) {
        await notify({
          role: 'admin',
          title: `📝 Nouvelle inscription ${roleLabel}`,
          body: `${nomAffiche} a soumis une demande de profil ${roleLabel}.`,
          data: {
            type: 'new_profile_request',
            entity_id: profileId,
            entity_type: 'UserProfile',
            profile_type: profile.profile_type,
            notif_route: '/gestion-profils',
          },
        });
      }
      console.log(`[notifyProfileEvents] DONE create | +${Date.now() - t0}ms`);
      return Response.json({ ok: true });
    }

    // ── UPDATE : seulement si statut a changé ────────────────────────────────
    if (event?.type !== 'update' || statut === oldStatut) {
      return Response.json({ ok: true });
    }

    const tasks = [];

    // Documents soumis (incomplet → en_attente) → admins
    if (statut === 'en_attente' && oldStatut !== 'en_attente') {
      tasks.push(notify({
        role: 'admin',
        title: `📋 Documents soumis — ${roleLabel}`,
        body: `${nomAffiche} a soumis ses documents pour validation ${roleLabel}.`,
        data: {
          type: 'profile_pending_review',
          entity_id: profileId,
          entity_type: 'UserProfile',
          profile_type: profile.profile_type,
          notif_route: '/gestion-profils',
        },
      }));
    }

    // Validé → utilisateur
    if (statut === 'actif' && oldStatut !== 'actif') {
      tasks.push(notify({
        user_email: profile.user_email,
        title: `✅ Profil ${roleLabel} validé !`,
        body: `Félicitations ! Votre profil ${roleLabel} a été validé. Vous pouvez commencer dès maintenant.`,
        data: {
          type: 'profile_validated',
          entity_id: profileId,
          entity_type: 'UserProfile',
          profile_type: profile.profile_type,
          notif_route: '/',
        },
      }));
    }

    // Refusé → utilisateur
    if (statut === 'refuse' && oldStatut !== 'refuse') {
      tasks.push(notify({
        user_email: profile.user_email,
        title: `❌ Profil ${roleLabel} refusé`,
        body: profile.refusal_reason
          ? `Motif : ${profile.refusal_reason}`
          : `Votre demande de profil ${roleLabel} n'a pas été acceptée. Contactez le support CDL.`,
        data: {
          type: 'profile_refused',
          entity_id: profileId,
          entity_type: 'UserProfile',
          profile_type: profile.profile_type,
          notif_route: '/settings',
        },
      }));
    }

    // Suspendu → utilisateur
    if (statut === 'suspendu' && oldStatut !== 'suspendu') {
      tasks.push(notify({
        user_email: profile.user_email,
        title: `⚠️ Profil ${roleLabel} suspendu`,
        body: `Votre profil ${roleLabel} a été suspendu. Contactez le support CDL.`,
        data: {
          type: 'profile_suspended',
          entity_id: profileId,
          entity_type: 'UserProfile',
          profile_type: profile.profile_type,
          notif_route: '/settings',
        },
      }));
    }

    await Promise.allSettled(tasks);
    console.log(`[notifyProfileEvents] DONE update statut=${statut} tasks=${tasks.length} | +${Date.now() - t0}ms`);
    return Response.json({ ok: true });

  } catch (err) {
    console.error(`[notifyProfileEvents] 🔴 ERREUR CRITIQUE | ${err.message} | execution_time=${Date.now() - t0}ms`);
    return Response.json({ ok: true });
  }
});