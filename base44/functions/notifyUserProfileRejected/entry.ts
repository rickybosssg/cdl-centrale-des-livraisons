import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Automation: UserProfile update → status = 'refuse'
 * Notifie l'utilisateur que son profil est refusé (DB + FCM push)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // CORRECT: les données sont dans body.data, pas body.event.data
    const body = await req.json();
    const profile = body.data;

    if (!profile?.user_email) return Response.json({ skipped: true, reason: 'no profile data' });

    const PROFILE_LABELS = {
      livreur: 'Livreur', partenaire: 'Partenaire', commercial: 'Commercial', annonceur: 'Annonceur', client: 'Client',
    };
    const label = PROFILE_LABELS[profile.profile_type] || profile.profile_type;
    const titre = `❌ Profil ${label} refusé`;
    const message = `Votre demande de profil ${label.toLowerCase()} a été refusée.${profile.refusal_reason ? ` Motif : ${profile.refusal_reason}` : ' Corrigez votre dossier et resoumettez.'}`;
    const route = '/settings';

    // 1. Notif DB
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: profile.user_email,
      destinataire_role: profile.profile_type || 'user',
      titre,
      message,
      type: 'danger',
      lue: false,
      target_screen: route,
    });

    // 2. FCM push
    await base44.asServiceRole.functions.invoke('sendFcmNotification', {
      user_email: profile.user_email,
      title: titre,
      body: message,
      data: { type: 'profile_rejected', route, profile_type: profile.profile_type || '' },
    }).catch(() => {});

    return Response.json({ success: true, notified: profile.user_email });
  } catch (error) {
    console.error('[notifyUserProfileRejected]:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});