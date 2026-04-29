/**
 * notifyCourseEvents — Handler automation entity Course
 *
 * Déclenché sur create + update de Course.
 * Envoie les notifications FCM push via base44.functions.invoke (SDK)
 * pour que l'appel soit authentifié et que asServiceRole fonctionne côté sendCdlNotification.
 *
 * Anti-doublon : vérifie oldStatut !== statut avant d'envoyer.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

    // Utiliser le SDK pour que sendCdlNotification reçoive un contexte authentifié
    const base44 = createClientFromRequest(req);

    const notify = (payload) =>
      base44.asServiceRole.functions.invoke('sendCdlNotification', payload).catch(e =>
        console.warn('[notifyCourseEvents] notify error (non-fatal):', e.message)
      );

    // ── CRÉATION : nouvelle course → notifier client (confirmation) + admins ──
    if (event?.type === 'create') {
      // 1. Confirmation immédiate au client
      if (course.client_email) {
        await notify({
          user_email: course.client_email,
          title: '✅ Course créée avec succès !',
          body: `${course.quartier_depart} → ${course.quartier_arrivee} — ${course.prix || 0} F. Recherche d'un livreur en cours...`,
          data: {
            type: 'course_created',
            entity_id: courseId,
            role: 'client',
            notif_route: `/course/${courseId}/track`,
          },
        });
      }
      // 2. Notification admin
      await notify({
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

    // En recherche → notifier le client
    if (statut === 'en_recherche' && course.client_email) {
      await notify({
        user_email: course.client_email,
        title: '🔍 Recherche d\'un livreur...',
        body: `Nous cherchons le meilleur livreur disponible pour votre course ${course.quartier_depart} → ${course.quartier_arrivee}.`,
        data: {
          type: 'course_searching',
          entity_id: courseId,
          role: 'client',
          notif_route: `/course/${courseId}/track`,
        },
      });
    }

    // Assignée/proposée au livreur → notifier livreur avec priorité selon urgence
    if (statut === 'assignee_attente' && course.livreur_email) {
      const urgence = course.urgence || 'normal';
      const urgenceEmoji = urgence === 'tres_urgent' ? '🔥🔥' : urgence === 'urgent' ? '🔥' : '🛵';
      const prixDisplay = course.prix ? `${course.prix.toLocaleString()} F` : '';
      await notify({
        user_email: course.livreur_email,
        title: `${urgenceEmoji} Nouvelle course${urgence !== 'normal' ? ' URGENTE' : ''} !`,
        body: `${course.quartier_depart} → ${course.quartier_arrivee} — ${prixDisplay}. Répondez en 60s !`,
        urgence,
        data: {
          type: 'course_assigned',
          entity_id: courseId,
          role: 'livreur',
          urgence,
          notif_route: `/course-livreur/${courseId}`,
        },
      });
    }

    // Acceptée par le livreur → notifier client
    if (statut === 'acceptee' && course.client_email) {
      await notify({
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

    // Colis récupéré (en_cours) → notifier client
    if (statut === 'en_cours' && course.client_email) {
      await notify({
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

    // Livrée → notifier client + livreur
    if (statut === 'livree') {
      if (course.client_email) {
        await notify({
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
        await notify({
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

    // Paiement validé (livrée + paiement confirmé) → notifier livreur
    if (statut === 'paiement_valide' && course.livreur_email) {
      await notify({
        user_email: course.livreur_email,
        title: '💸 Paiement reçu !',
        body: `Le paiement de ${course.gain_livreur || course.prix || 0} F a été validé pour la course ${course.quartier_depart} → ${course.quartier_arrivee}.`,
        data: {
          type: 'payment_validated',
          entity_id: courseId,
          role: 'livreur',
          notif_route: '/mes-gains',
        },
      });
    }

    // Annulée → notifier client + livreur
    if (statut === 'annulee') {
      if (course.client_email) {
        await notify({
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
        await notify({
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