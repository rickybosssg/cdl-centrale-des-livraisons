/**
 * notifyCourseEvents — Handler automation entity Course
 *
 * Déclenché sur create + update de Course.
 * Envoie UNIQUEMENT les notifications FCM push (pas les in-app Notification en BDD
 * qui sont déjà créées par autoDispatch / bedouEngine / cancelCourseWithFees).
 *
 * Anti-doublon : vérifie oldStatut !== statut avant d'envoyer.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const APP_ID = Deno.env.get('BASE44_APP_ID') || '';
const FCM_URL = `https://api.base44.app/api/apps/${APP_ID}/functions/sendCdlNotification`;

async function notifyFcm(payload) {
  try {
    await fetch(FCM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn('[notifyCourseEvents] notifyFcm error (non-fatal):', e.message);
  }
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { event, data, old_data } = body;

    if (!data) return Response.json({ ok: true });

    const course = data;
    const courseId = event?.entity_id || course.id || '';
    const statut = course.statut || '';
    const oldStatut = old_data?.statut || '';

    console.log(`[notifyCourseEvents] event=${event?.type} | statut=${statut} | oldStatut=${oldStatut} | id=${courseId}`);

    // ── CRÉATION : nouvelle course → notifier les admins via FCM ────────────
    if (event?.type === 'create') {
      await notifyFcm({
        role: 'admin',
        title: '🛵 Nouvelle course créée',
        body: `${course.client_name || course.client_email} : ${course.quartier_depart} → ${course.quartier_arrivee} (${course.prix || 0} F)`,
        data: {
          type: 'new_course',
          screen: 'GererCourses',
          entity_id: courseId,
          role: 'admin',
          notif_route: '/gerer-courses',
        },
      });
      return Response.json({ ok: true });
    }

    // ── UPDATE : seulement si le statut a vraiment changé ─────────────────────
    if (event?.type !== 'update' || statut === oldStatut) {
      return Response.json({ ok: true });
    }

    // Assignée/proposée au livreur → notifier livreur via FCM
    if (statut === 'assignee_attente' && course.livreur_email) {
      await notifyFcm({
        user_email: course.livreur_email,
        title: '🛵 Nouvelle course disponible !',
        body: `${course.quartier_depart} → ${course.quartier_arrivee} — ${course.prix || 0} F. Répondez en 60s !`,
        data: {
          type: 'course_assigned',
          screen: 'CourseLivreur',
          entity_id: courseId,
          role: 'livreur',
          notif_route: `/course-livreur/${courseId}`,
        },
      });
    }

    // Acceptée par le livreur → notifier client via FCM
    if (statut === 'acceptee' && course.client_email) {
      await notifyFcm({
        user_email: course.client_email,
        title: '✅ Livreur en chemin !',
        body: `${course.livreur_name || 'Votre livreur'} a accepté votre course et arrive bientôt.`,
        data: {
          type: 'course_accepted',
          entity_id: courseId,
          role: 'client',
          notif_route: `/course/${courseId}/track`,
        },
      });
    }

    // Colis récupéré (en_cours) → notifier client via FCM
    if (statut === 'en_cours' && course.client_email) {
      await notifyFcm({
        user_email: course.client_email,
        title: '🏃 Colis en route !',
        body: `Votre colis est en cours de livraison vers ${course.quartier_arrivee}.`,
        data: {
          type: 'course_in_progress',
          entity_id: courseId,
          role: 'client',
          notif_route: `/course/${courseId}/track`,
        },
      });
    }

    // Livrée → notifier client + livreur via FCM
    if (statut === 'livree') {
      if (course.client_email) {
        await notifyFcm({
          user_email: course.client_email,
          title: '🎉 Colis livré !',
          body: `Votre colis a bien été livré par ${course.livreur_name || 'votre livreur'}. Notez-le !`,
          data: {
            type: 'course_delivered',
            entity_id: courseId,
            role: 'client',
            notif_route: `/course/${courseId}/track`,
          },
        });
      }
      if (course.livreur_email) {
        await notifyFcm({
          user_email: course.livreur_email,
          title: '💰 Livraison confirmée !',
          body: `${course.quartier_arrivee} — Gain : +${course.gain_livreur || 0} F crédités sur votre Bedou.`,
          data: {
            type: 'course_delivered_driver',
            entity_id: courseId,
            role: 'livreur',
            notif_route: '/mes-livraisons',
          },
        });
      }
    }

    // Annulée → notifier client + livreur via FCM
    if (statut === 'annulee') {
      if (course.client_email) {
        await notifyFcm({
          user_email: course.client_email,
          title: '❌ Course annulée',
          body: course.frais_annulation > 0
            ? `Votre course a été annulée. Frais : ${course.frais_annulation.toLocaleString()} F.`
            : `Votre course ${course.quartier_depart} → ${course.quartier_arrivee} a été annulée.`,
          data: {
            type: 'course_cancelled',
            entity_id: courseId,
            role: 'client',
            notif_route: '/mes-courses',
          },
        });
      }
      if (course.livreur_email) {
        await notifyFcm({
          user_email: course.livreur_email,
          title: '❌ Course annulée',
          body: `La course ${course.quartier_depart} → ${course.quartier_arrivee} a été annulée.`,
          data: {
            type: 'course_cancelled',
            entity_id: courseId,
            role: 'livreur',
            notif_route: '/courses-disponibles',
          },
        });
      }
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[notifyCourseEvents] ERROR:', err.message);
    return Response.json({ ok: true }); // Ne jamais bloquer l'automation
  }
});