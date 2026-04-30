import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── Stratégie optimisée : traiter seulement 30 users par run ─────────────
    // L'automation tourne toutes les heures → tous les users sont couverts en rotation
    const users = await base44.asServiceRole.entities.User.list('-created_date', 30);
    if (!users || users.length === 0) {
      return Response.json({ success: true, processed: 0 });
    }

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    let notificationsSent = 0;

    for (const user of users) {
      try {
        await sleep(300); // 300ms entre chaque user → max ~9 req/s safe

        // Vérifier la limite quotidienne (1 seule requête BDD par user)
        const recentLogs = await base44.asServiceRole.entities.ReferralNotificationLog.filter(
          { user_email: user.email },
          '-created_date',
          5
        );

        const logsToday = (recentLogs || []).filter(l => new Date(l.created_date) > oneDayAgo);
        if (logsToday.length >= 1) continue; // Max 1 notif par jour par user

        const lastNotif = recentLogs?.[0];
        const lastNotifTime = lastNotif ? new Date(lastNotif.created_date) : null;
        const userAgeHours = (now - new Date(user.created_date)) / (1000 * 60 * 60);

        let notificationType = null;
        let message = null;

        // CAS 1: Nouvel utilisateur (< 24h) — priorité haute
        if (userAgeHours < 24 && !lastNotifTime) {
          notificationType = 'new_user';
          message = '🎁 Gagne de l\'argent avec CDL ! Invite tes amis et commence à gagner dès maintenant 💰';
        }

        // CAS 2: Après première course
        if (!notificationType && user.premiere_course_effectuee) {
          const hasFirstCourseNotif = (recentLogs || []).some(l => l.notification_type === 'first_course');
          if (!hasFirstCourseNotif) {
            notificationType = 'first_course';
            message = '🔥 Tu viens d\'utiliser CDL ! Invite tes amis et gagne 200 F par personne 💰';
          }
        }

        // CAS 3: Inactif depuis 48h
        if (!notificationType && user.date_derniere_activite) {
          const lastActivity = new Date(user.date_derniere_activite);
          if (lastActivity < twoDaysAgo && (!lastNotifTime || (now - lastNotifTime) > 48 * 60 * 60 * 1000)) {
            notificationType = 'inactive_48h';
            message = '⏳ Tu peux gagner de l\'argent sans bouger ! Invite tes amis sur CDL 💰';
          }
        }

        // CAS 4: Utilisateur actif
        if (!notificationType && user.nombre_total_courses > 3 && (!lastNotifTime || (now - lastNotifTime) > 72 * 60 * 60 * 1000)) {
          notificationType = 'active_user';
          message = '💪 Tu utilises déjà CDL ! Invite tes amis et gagne encore plus 💰';
        }

        // Envoyer si applicable (2 créations BDD max)
        if (notificationType && message) {
          await sleep(200);
          await base44.asServiceRole.entities.ReferralNotificationLog.create({
            user_email: user.email,
            notification_type: notificationType,
            message,
            status: 'sent',
          });
          await sleep(200);
          await base44.asServiceRole.entities.Notification.create({
            destinataire_email: user.email,
            destinataire_role: 'user',
            titre: '💰 Opportunité de parrainage',
            message,
            type: 'info',
            lue: false,
          });
          console.log(`[checkReferralOpportunities] ✅ ${notificationType} → ${user.email}`);
          notificationsSent++;
        }
      } catch (e) {
        if (e?.status === 429 || e?.message?.includes('Rate limit')) {
          console.warn(`[checkReferralOpportunities] Rate limit — pause 5s`);
          await sleep(5000);
        } else {
          console.error(`[checkReferralOpportunities] Error ${user.email}:`, e?.message);
        }
      }
    }

    console.log(`[checkReferralOpportunities] Done. sent: ${notificationsSent}/${users.length}`);
    return Response.json({ success: true, processed: users.length, notificationsSent });
  } catch (error) {
    console.error('[checkReferralOpportunities] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});