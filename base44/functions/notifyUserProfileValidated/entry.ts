import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Automation: UserProfile update → status = 'actif'
 * Notifie l'utilisateur que son profil est validé (DB + FCM push)
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
    const titre = `✅ Profil ${label} validé !`;
    const message = `Félicitations ! Votre profil ${label.toLowerCase()} a été approuvé. Vous pouvez maintenant l'utiliser.`;
    const route = '/settings';

    // 1. Notif DB
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: profile.user_email,
      destinataire_role: profile.profile_type || 'user',
      titre,
      message,
      type: 'success',
      lue: false,
      target_screen: route,
    });

    // 2. FCM push via notifyUser
    await base44.asServiceRole.functions.invoke('sendFcmNotification', {
      user_email: profile.user_email,
      title: titre,
      body: message,
      data: { type: 'profile_validated', route, profile_type: profile.profile_type || '' },
    }).catch(() => {});

    return Response.json({ success: true, notified: profile.user_email });
  } catch (error) {
    console.error('[notifyUserProfileValidated]:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});