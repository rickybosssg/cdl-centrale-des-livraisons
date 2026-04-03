import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Récupérer tous les utilisateurs
    const users = await base44.asServiceRole.entities.User.list('-created_date', 500);
    if (!users || users.length === 0) {
      return Response.json({ success: true, processed: 0 });
    }

    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    let notificationsSent = 0;

    for (const user of users) {
      try {
        // Récupérer les logs de notifications (max 2 par jour)
        const recentLogs = await base44.asServiceRole.entities.ReferralNotificationLog.filter(
          {
            user_email: user.email,
          },
          '-created_date',
          10
        );

        // Vérifier qu'on n'a pas déjà envoyé 2 notifications aujourd'hui
        const logsToday = (recentLogs || []).filter(
          l => new Date(l.created_date) > oneDayAgo
        );

        if (logsToday.length >= 2) {
          continue; // Skip - limite de 2 par jour atteinte
        }

        // Vérifier quand était la dernière notification
        const lastNotif = recentLogs?.[0];
        const lastNotifTime = lastNotif ? new Date(lastNotif.created_date) : null;

        // Déterminer quel type de notification envoyer
        let notificationType = null;
        let message = null;

        // CAS 1: Nouvel utilisateur (inscrit depuis moins de 24h)
        const userAgeHours = (now - new Date(user.created_date)) / (1000 * 60 * 60);
        if (userAgeHours < 24 && (!lastNotifTime || (now - lastNotifTime) > 24 * 60 * 60 * 1000)) {
          notificationType = 'new_user';
          message = '🎁 Gagne de l\'argent avec CDL ! Invite tes amis et commence à gagner dès maintenant 💰';
        }

        // CAS 2: Après première course
        if (!notificationType && user.premiere_course_effectuee && (!lastNotifTime || (now - lastNotifTime) > 24 * 60 * 60 * 1000)) {
          const courseNotifs = (recentLogs || []).filter(l => l.notification_type === 'first_course');
          if (courseNotifs.length === 0) {
            notificationType = 'first_course';
            message = '🔥 Tu viens d\'utiliser CDL ! Invite tes amis et gagne 200 F par personne 💰';
          }
        }

        // CAS 3: Utilisateur inactif (48h sans activité)
        if (!notificationType && user.date_derniere_activite) {
          const lastActivityTime = new Date(user.date_derniere_activite);
          if (lastActivityTime < twoDaysAgo && (!lastNotifTime || (now - lastNotifTime) > 48 * 60 * 60 * 1000)) {
            notificationType = 'inactive_48h';
            message = '⏳ Tu peux gagner de l\'argent sans bouger ! Invite tes amis sur CDL et augmente tes gains 💰';
          }
        }

        // CAS 4: Utilisateur actif (>3 courses)
        if (!notificationType && user.nombre_total_courses && user.nombre_total_courses > 3 && (!lastNotifTime || (now - lastNotifTime) > 72 * 60 * 60 * 1000)) {
          notificationType = 'active_user';
          message = '💪 Tu utilises déjà CDL ! Pourquoi ne pas gagner encore plus ? Invite tes amis maintenant 💰';
        }

        // CAS 7: Aucun filleul après 24h
        if (!notificationType && userAgeHours > 24) {
          const referrals = await base44.asServiceRole.entities.UserReferral.filter(
            { referrer_email: user.email, status: 'active' }
          );
          if ((!referrals || referrals.length === 0) && (!lastNotifTime || (now - lastNotifTime) > 24 * 60 * 60 * 1000)) {
            const noRefNotifs = (recentLogs || []).filter(l => l.notification_type === 'no_referrals');
            if (noRefNotifs.length === 0) {
              notificationType = 'no_referrals';
              message = '😏 Tu n\'as encore invité personne ? Commence maintenant et gagne tes premiers 200 F 💰';
            }
          }
        }

        // CAS 5 & 6: Progression vers 5000F
        if (!notificationType) {
          const balances = await base44.asServiceRole.entities.UserReferralBalance.filter(
            { user_email: user.email }
          );

          if (balances && balances.length > 0) {
            const balance = balances[0];
            const refBalance = balance.referral_balance || 0;

            // CAS 6: Seuil atteint
            if (refBalance >= 5000) {
              const thresholdNotifs = (recentLogs || []).filter(l => l.notification_type === 'threshold_reached');
              if (thresholdNotifs.length === 0) {
                notificationType = 'threshold_reached';
                message = '🎉 Bravo ! Tu peux maintenant retirer tes gains de parrainage 💰';
              }
            }
            // CAS 5: Progression
            else if (refBalance > 1000 && refBalance < 5000 && (!lastNotifTime || (now - lastNotifTime) > 72 * 60 * 60 * 1000)) {
              const remaining = 5000 - refBalance;
              notificationType = 'progress_5000';
              message = `💰 Tu es à ${remaining}F de pouvoir retirer tes gains ! Invite encore des amis pour atteindre 5000F 🚀`;
            }
          }
        }

        // Envoyer la notification si applicable
        if (notificationType && message) {
          // Créer le log
          await base44.asServiceRole.entities.ReferralNotificationLog.create({
            user_email: user.email,
            notification_type: notificationType,
            message,
            status: 'sent',
          });

          // Envoyer la notification
          await base44.asServiceRole.entities.Notification.create({
            destinataire_email: user.email,
            destinataire_role: 'user',
            titre: '💰 Opportunité de parrainage',
            message,
            type: 'info',
            lue: false,
          });

          console.log(`[checkReferralOpportunities] Notification ${notificationType} sent to ${user.email}`);
          notificationsSent++;
        }
      } catch (e) {
        console.error(`[checkReferralOpportunities] Error processing ${user.email}:`, e);
        // Continue to next user
      }
    }

    console.log(`[checkReferralOpportunities] Completed. Notifications sent: ${notificationsSent}`);
    return Response.json({ success: true, processed: users.length, notificationsSent });
  } catch (error) {
    console.error('[checkReferralOpportunities] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});