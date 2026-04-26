/**
 * notifyCourseEvents — Handler automation entity Course
 *
 * Déclenché sur create + update de Course.
 * Envoie les notifications FCM appropriées selon le changement de statut.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const APP_ID = Deno.env.get('BASE44_APP_ID') || '';
const FCM_URL = `https://api.base44.app/api/apps/${APP_ID}/functions/sendCdlNotification`;

async function notifyCdl(payload) {
  try {
    await fetch(FCM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn('[notifyCourseEvents] notifyCdl error (non-fatal):', e.message);
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

    // ── CRÉATION : nouvelle course → notifier les admins ────────────────────
    if (event?.type === 'create') {
      await notifyCdl({
        role: 'admin',
        title: '🛵 Nouvelle course créée',
        body: `${course.client_name || course.client_email} : ${course.quartier_depart} → ${course.quartier_arrivee} (${course.prix || 0} F)`,
        data: {
          type: 'new_course',
          screen: 'GererCourses',
          entity_id: courseId,
          role: 'admin',
        },
      });
      return Response.json({ ok: true });
    }

    // ── UPDATE : changements de statut ────────────────────────────────────────
    if (event?.type === 'update' && statut !== oldStatut) {

      // Course assignée → notifier livreur
      if (['assignee_attente', 'acceptee'].includes(statut) && course.livreur_email) {
        await notifyCdl({
          user_email: course.livreur_email,
          title: '📦 Nouvelle course disponible !',
          body: `${course.quartier_depart} → ${course.quartier_arrivee} — ${course.prix || 0} F`,
          data: {
            type: 'course_assigned',
            screen: 'CourseLivreur',
            entity_id: courseId,
            role: 'livreur',
          },
        });
      }

      // Course acceptée par livreur → notifier client
      if (statut === 'acceptee' && oldStatut !== 'acceptee' && course.client_email) {
        await notifyCdl({
          user_email: course.client_email,
          title: '✅ Livreur en chemin !',
          body: `${course.livreur_name || 'Votre livreur'} a accepté votre course et arrive bientôt.`,
          data: {
            type: 'course_accepted',
            screen: 'CourseDetail',
            entity_id: courseId,
            role: 'client',
          },
        });
      }

      // En cours (colis récupéré) → notifier client
      if (statut === 'en_cours' && course.client_email) {
        await notifyCdl({
          user_email: course.client_email,
          title: '🏃 Colis en route !',
          body: `Votre colis est en cours de livraison vers ${course.quartier_arrivee}.`,
          data: {
            type: 'course_in_progress',
            screen: 'CourseTracking',
            entity_id: courseId,
            role: 'client',
          },
        });
      }

      // Course livrée → notifier client
      if (statut === 'livree' && course.client_email) {
        await notifyCdl({
          user_email: course.client_email,
          title: '🎉 Colis livré !',
          body: `Votre colis a bien été livré. Notez votre livreur !`,
          data: {
            type: 'course_delivered',
            screen: 'CourseDetail',
            entity_id: courseId,
            role: 'client',
          },
        });
        // Notifier aussi le livreur
        if (course.livreur_email) {
          await notifyCdl({
            user_email: course.livreur_email,
            title: '💰 Course terminée !',
            body: `Livraison ${course.quartier_arrivee} confirmée. Gain : ${course.gain_livreur || 0} F`,
            data: {
              type: 'course_delivered',
              screen: 'MesLivraisons',
              entity_id: courseId,
              role: 'livreur',
            },
          });
        }
      }

      // Course annulée
      if (statut === 'annulee') {
        if (course.client_email) {
          await notifyCdl({
            user_email: course.client_email,
            title: '❌ Course annulée',
            body: `Votre course ${course.quartier_depart} → ${course.quartier_arrivee} a été annulée.`,
            data: {
              type: 'course_cancelled',
              screen: 'MesCourses',
              entity_id: courseId,
              role: 'client',
            },
          });
        }
        if (course.livreur_email) {
          await notifyCdl({
            user_email: course.livreur_email,
            title: '❌ Course annulée',
            body: `La course ${course.quartier_depart} → ${course.quartier_arrivee} a été annulée.`,
            data: {
              type: 'course_cancelled',
              screen: 'CoursesDisponibles',
              entity_id: courseId,
              role: 'livreur',
            },
          });
        }
      }
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[notifyCourseEvents] ERROR:', err.message);
    return Response.json({ ok: true }); // Ne jamais bloquer
  }
});