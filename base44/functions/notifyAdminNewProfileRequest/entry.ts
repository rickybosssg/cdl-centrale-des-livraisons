import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event } = await req.json();

    if (!event?.data) return Response.json({ error: "No profile data" }, { status: 400 });

    const profile = event.data;
    const user = await base44.asServiceRole.entities.User.filter({ email: profile.user_email });
    
    if (user.length === 0) {
      return Response.json({ skipped: "User not found" });
    }

    const userData = user[0];
    const PROFILE_LABELS = {
      livreur: "Livreur",
      partenaire: "Partenaire",
      commercial: "Commercial",
      annonceur: "Annonceur",
    };

    const adminEmails = await base44.asServiceRole.entities.User.filter({ role: "admin" });

    const title = `📋 Nouvelle demande : ${PROFILE_LABELS[profile.profile_type] || profile.profile_type}`;
    const body = `${userData.full_name} a demandé un profil ${PROFILE_LABELS[profile.profile_type]?.toLowerCase()}.`;

    // Envoyer notification FCM à chaque admin
    await Promise.all(
      adminEmails.map(admin =>
        base44.functions.invoke('sendFcmNotification', {
          user_email: admin.email,
          title,
          body,
          data: {
            type: 'new_profile_request',
            profile_id: profile.id,
            user_email: profile.user_email,
            url: '/gestion-profils',
          },
        }).catch(() => {})
      )
    );

    // Enregistrer un log
    await base44.asServiceRole.entities.AdminActionLog.create({
      admin_email: 'system',
      object_type: 'profile',
      object_id: profile.id,
      object_name: profile.profile_type,
      action: 'notification_sent',
      reason: 'Nouvelle demande de profil',
      target_email: profile.user_email,
    }).catch(() => {});

    return Response.json({ notified: adminEmails.length });
  } catch (error) {
    console.error('[notifyAdminNewProfileRequest]:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});