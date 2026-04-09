import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Automation: UserProfile create → status = 'en_attente'
 * Notifie tous les admins d'une nouvelle demande de profil (DB + FCM push)
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

    const ROUTES = {
      livreur: '/validation-livreurs',
      partenaire: '/gerer-partenaires',
      commercial: '/gerer-commerciaux',
    };
    const route = ROUTES[profile.profile_type] || '/gestion-profils';

    const titre = `📋 Nouvelle demande : ${label}`;
    const message = `${profile.user_email} attend validation de profil ${label.toLowerCase()}.`;

    // Récupérer tous les admins
    const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
    if (admins.length === 0) return Response.json({ skipped: true, reason: 'no admins' });

    // WA alerte livreur (non bloquant, uniquement profil livreur)
    if (profile.profile_type === 'livreur') {
      let profileData = {};
      try { profileData = JSON.parse(profile.data_json || '{}'); } catch (_) {}
      const nomLivreur = profileData.nom_complet || profileData.full_name || profile.user_email;
      const telephone = profileData.telephone || '';
      const zone = profileData.quartier || profileData.zone || '';
      const waMsg = `🛠 Nouvelle demande livreur !\n\nUn utilisateur a soumis un profil livreur.\n\n👉 Vérifiez et validez dans l'admin CDL.`;
      const adminPhone = Deno.env.get('WHATSAPP_ADMIN_NUMBER');
      if (adminPhone) {
        base44.asServiceRole.functions.invoke('sendWhatsAppAlert', {
          eventType: 'driver_profile_submitted',
          recipientRole: 'admin',
          recipientName: 'Admin CDL',
          recipientPhone: adminPhone,
          messageText: waMsg,
          entityId: profile.id,
          entityType: 'profile',
          priority: 'high',
        }).catch(err => console.warn('[notifyAdmin] WA skip:', err?.message));
      }
    }

    // Pour chaque admin : DB + FCM
    await Promise.allSettled(admins.map(async (admin) => {
      // 1. Notif DB
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: admin.email,
        destinataire_role: 'admin',
        titre,
        message,
        type: 'info',
        lue: false,
        target_screen: route,
        target_entity_id: profile.id,
        target_entity_type: 'profile',
      });

      // 2. FCM push
      await base44.asServiceRole.functions.invoke('sendFcmNotification', {
        user_email: admin.email,
        title: titre,
        body: message,
        data: { type: 'profile_request', route, profile_id: profile.id || '', profile_type: profile.profile_type || '' },
      }).catch(() => {});
    }));

    return Response.json({ success: true, notified: admins.length });
  } catch (error) {
    console.error('[notifyAdminNewProfileRequest]:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});