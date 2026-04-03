import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event } = await req.json();

    if (!event?.data) return Response.json({ error: "No profile data" }, { status: 400 });

    const profile = event.data;
    const PROFILE_LABELS = {
      livreur: "Livreur",
      partenaire: "Partenaire",
      commercial: "Commercial",
      annonceur: "Annonceur",
    };

    const title = `❌ Profil refusé : ${PROFILE_LABELS[profile.profile_type] || profile.profile_type}`;
    const body = `Votre demande de profil ${PROFILE_LABELS[profile.profile_type]?.toLowerCase()} a été refusée.${profile.refusal_reason ? ` Motif : ${profile.refusal_reason}` : ''}`;

    // Envoyer notification FCM à l'utilisateur
    await base44.functions.invoke('sendFcmNotification', {
      user_email: profile.user_email,
      title,
      body,
      data: {
        type: 'profile_rejected',
        profile_id: profile.id,
        profile_type: profile.profile_type,
        url: '/settings',
      },
    }).catch(() => {});

    // Créer une notification système
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: profile.user_email,
      destinataire_role: profile.profile_type,
      titre: title,
      message: body,
      type: 'danger',
      lue: false,
    }).catch(() => {});

    return Response.json({ notified: true });
  } catch (error) {
    console.error('[notifyUserProfileRejected]:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});