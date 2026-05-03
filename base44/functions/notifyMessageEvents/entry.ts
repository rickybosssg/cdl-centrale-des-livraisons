/**
 * notifyMessageEvents — Handler automation entity Message
 *
 * - Nouveau message course → destinataire (client ou livreur selon sender_role)
 * - Ne notifie jamais l'expéditeur
 *
 * LOGS : notification_type | target_user | fcm_sent | delay_ms
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { event, data } = body;

    if (!data || event?.type !== 'create') return Response.json({ ok: true });

    const msg = data;
    const courseId = msg.course_id || '';
    const senderEmail = msg.sender_email || '';
    const senderName = msg.sender_name || senderEmail;
    const senderRole = msg.sender_role || 'client';
    const contenu = msg.contenu || '';
    const preview = contenu.length > 80 ? contenu.slice(0, 80) + '...' : contenu;

    console.log(`[notifyMessageEvents] START | courseId=${courseId} | sender=${senderEmail} | role=${senderRole} | +${Date.now() - t0}ms`);

    if (!courseId || !senderEmail) return Response.json({ ok: true });

    const notify = (payload) => {
      console.log(`[notifyMessageEvents] → notify | user=${payload.user_email || ''} type=${payload.data?.type || ''}`);
      return base44.asServiceRole.functions.invoke('sendCdlNotification', payload).catch(e =>
        console.warn('[notifyMessageEvents] notify error (non-fatal):', e?.message)
      );
    };

    // Charger la course pour connaître client + livreur
    let course = null;
    try {
      const courses = await base44.asServiceRole.entities.Course.filter({ id: courseId }, null, 1);
      course = courses?.[0] || null;
    } catch (e) {
      console.warn('[notifyMessageEvents] course not found:', e?.message);
    }

    if (!course) return Response.json({ ok: true });

    const tasks = [];

    // Si l'expéditeur est le livreur → notifier le client
    if (senderRole === 'livreur' && course.client_email && course.client_email !== senderEmail) {
      tasks.push(notify({
        user_email: course.client_email,
        title: '💬 Message de votre livreur',
        body: `${senderName} : ${preview}`,
        data: {
          type: 'new_message',
          entity_id: courseId,
          entity_type: 'Course',
          notif_route: `/course/${courseId}/track`,
        },
      }));
    }

    // Si l'expéditeur est le client → notifier le livreur
    if (senderRole === 'client' && course.livreur_email && course.livreur_email !== senderEmail) {
      tasks.push(notify({
        user_email: course.livreur_email,
        title: '💬 Message du client',
        body: `${senderName} : ${preview}`,
        data: {
          type: 'new_message',
          entity_id: courseId,
          entity_type: 'Course',
          notif_route: `/course-livreur/${courseId}`,
        },
      }));
    }

    // Si l'expéditeur est admin → notifier client ET livreur
    if (senderRole === 'admin') {
      if (course.client_email && course.client_email !== senderEmail) {
        tasks.push(notify({
          user_email: course.client_email,
          title: '📣 Message important CDL',
          body: `CDL Support : ${preview}`,
          data: {
            type: 'admin_message',
            entity_id: courseId,
            entity_type: 'Course',
            notif_route: `/course/${courseId}/track`,
          },
        }));
      }
      if (course.livreur_email && course.livreur_email !== senderEmail) {
        tasks.push(notify({
          user_email: course.livreur_email,
          title: '📣 Message important CDL',
          body: `CDL Support : ${preview}`,
          data: {
            type: 'admin_message',
            entity_id: courseId,
            entity_type: 'Course',
            notif_route: `/course-livreur/${courseId}`,
          },
        }));
      }
    }

    await Promise.allSettled(tasks);
    console.log(`[notifyMessageEvents] DONE | tasks=${tasks.length} | +${Date.now() - t0}ms`);
    return Response.json({ ok: true });

  } catch (err) {
    console.error(`[notifyMessageEvents] 🔴 ERREUR CRITIQUE | ${err.message} | execution_time=${Date.now() - t0}ms`);
    return Response.json({ ok: true });
  }
});