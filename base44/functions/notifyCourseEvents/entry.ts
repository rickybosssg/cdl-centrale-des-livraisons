/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  notifyCourseEvents — VERROUILLÉ                            ║
 * ║  NOTIFICATIONS_SYSTEM_LOCKED = true                         ║
 * ║  ❌ NE PAS MODIFIER les appels notify()                     ║
 * ║  ❌ NE PAS SUPPRIMER les try/catch                          ║
 * ║  ✅ Toujours retourner { ok: true }                         ║
 * ║  LOGS : event_type | user_id | fcm_sent | execution_time   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const { event, data, old_data } = body;

    if (!data) return Response.json({ ok: true });

    const course = data;
    const courseId = event?.entity_id || course.id || '';
    const statut = course.statut || '';
    const oldStatut = old_data?.statut || '';

    console.log(`[notifyCourseEvents] START | event=${event?.type} | statut=${statut} | oldStatut=${oldStatut} | id=${courseId}`);

    const base44 = createClientFromRequest(req);

    // LOG OBLIGATOIRE
    console.log(`[notifyCourseEvents] ━━━ START ━━━ | event_type=${event?.type} | statut=${statut} | oldStatut=${oldStatut} | entity_id=${courseId}`);

    const notify = (payload) => {
      console.log(`[notifyCourseEvents] → notify | user=${payload.user_email || ''} role=${payload.role || ''} type=${payload.data?.type || ''}`);
      return base44.asServiceRole.functions.invoke('sendCdlNotification', payload).catch(e =>
        console.warn('[notifyCourseEvents] notify error (non-fatal):', e.message)
      );
    };

    // ── CRÉATION — géré exclusivement par notifyNewCourse (éviter doublon) ───
    if (event?.type === 'create') {
      console.log(`[notifyCourseEvents] SKIP create — géré par notifyNewCourse | +${Date.now() - t0}ms`);
      return Response.json({ ok: true, skipped: 'create_handled_by_notifyNewCourse' });
    }

    // ── UPDATE : seulement si statut a changé ─────────────────────────────────
    if (event?.type !== 'update' || statut === oldStatut) {
      return Response.json({ ok: true });
    }

    const tasks = [];

    // assignee_attente → push livreur déjà envoyé par autoDispatch/createSmartDispatch
    // NE PAS renvoyer ici pour éviter le doublon
    if (statut === 'assignee_attente') {
      console.log(`[notifyCourseEvents] SKIP assignee_attente push livreur — déjà envoyé par autoDispatch`);
    }

    // Acceptée → client
    if (statut === 'acceptee' && course.client_email) {
      tasks.push(notify({
        user_email: course.client_email,
        title: '✅ Livreur en chemin !',
        body: `${course.livreur_name || 'Votre livreur'} a accepté votre course et arrive bientôt.`,
        data: { type: 'course_accepted', entity_id: courseId, entity_type: 'Course', notif_route: `/course/${courseId}/track` },
      }));
    }

    // Livreur en route vers départ → client
    if (statut === 'driver_en_route_pickup' && course.client_email) {
      tasks.push(notify({
        user_email: course.client_email,
        title: '🛵 Votre livreur est en route !',
        body: `${course.livreur_name || 'Votre livreur'} se dirige vers le point de récupération.`,
        data: { type: 'course_assigned', entity_id: courseId, entity_type: 'Course', notif_route: `/course/${courseId}/track` },
      }));
    }

    // Livreur arrivé au point de départ → client (statuts anciens + nouveaux)
    if ((statut === 'arrived_pickup' || statut === 'arrivee_point_depart') && course.client_email) {
      tasks.push(notify({
        user_email: course.client_email,
        title: '📍 Votre livreur est arrivé !',
        body: `${course.livreur_name || 'Votre livreur'} est au point de récupération. Préparez votre colis.`,
        data: { type: 'livreur_arrived_pickup', entity_id: courseId, entity_type: 'Course', notif_route: `/course/${courseId}/track` },
      }));
    }

    // En cours (colis récupéré) → client
    if (statut === 'en_cours' && course.client_email) {
      tasks.push(notify({
        user_email: course.client_email,
        title: '📦 Colis récupéré — en route !',
        body: `Votre colis est en livraison vers ${course.quartier_arrivee}.`,
        data: { type: 'course_in_progress', entity_id: courseId, entity_type: 'Course', notif_route: `/course/${courseId}/track` },
      }));
    }

    // Livreur arrivé à destination → client
    if ((statut === 'arrived_dropoff' || statut === 'proche_destination') && course.client_email) {
      tasks.push(notify({
        user_email: course.client_email,
        title: '⚡ Livreur à destination !',
        body: `${course.livreur_name || 'Votre livreur'} est arrivé à destination. Préparez-vous à recevoir votre colis.`,
        data: { type: 'livreur_near_destination', entity_id: courseId, entity_type: 'Course', notif_route: `/course/${courseId}/track` },
      }));
    }

    // Livrée → client + livreur
    if (statut === 'livree') {
      if (course.client_email) {
        tasks.push(notify({
          user_email: course.client_email,
          title: '🎉 Colis livré !',
          body: `Votre colis a été livré par ${course.livreur_name || 'votre livreur'}. Notez-le !`,
          data: { type: 'course_delivered', entity_id: courseId, entity_type: 'Course', notif_route: `/course/${courseId}/track` },
        }));
      }
      if (course.livreur_email) {
        tasks.push(notify({
          user_email: course.livreur_email,
          title: '💰 Livraison confirmée !',
          body: `${course.quartier_arrivee} — Gain : +${course.gain_livreur || 0} F crédités sur votre Bedou.`,
          data: { type: 'course_delivered_driver', entity_id: courseId, entity_type: 'Course', notif_route: '/mes-livraisons' },
        }));
      }
    }

    // Paiement validé → livreur
    if (statut === 'paiement_valide' && course.livreur_email) {
      tasks.push(notify({
        user_email: course.livreur_email,
        title: '💸 Paiement reçu !',
        body: `Le paiement de ${course.gain_livreur || course.prix || 0} F a été validé — ${course.quartier_depart} → ${course.quartier_arrivee}.`,
        data: { type: 'payment_validated', entity_id: courseId, entity_type: 'Course', notif_route: '/mes-gains' },
      }));
    }

    // Annulée → client + livreur
    if (statut === 'annulee') {
      if (course.client_email) {
        tasks.push(notify({
          user_email: course.client_email,
          title: '❌ Course annulée',
          body: course.frais_annulation > 0
            ? `Votre course a été annulée. Frais : ${course.frais_annulation.toLocaleString()} F.`
            : `Votre course ${course.quartier_depart} → ${course.quartier_arrivee} a été annulée.`,
          data: { type: 'course_cancelled', entity_id: courseId, entity_type: 'Course', notif_route: '/mes-courses' },
        }));
      }
      if (course.livreur_email) {
        tasks.push(notify({
          user_email: course.livreur_email,
          title: '❌ Course annulée',
          body: `La course ${course.quartier_depart} → ${course.quartier_arrivee} a été annulée.`,
          data: { type: 'course_cancelled', entity_id: courseId, entity_type: 'Course', notif_route: '/courses-disponibles' },
        }));
      }
    }

    await Promise.allSettled(tasks);
    console.log(`[notifyCourseEvents] DONE update statut=${statut} tasks=${tasks.length} | +${Date.now() - t0}ms`);
    return Response.json({ ok: true });

  } catch (err) {
    // Protection globale — jamais throw bloquant
    console.error(`[notifyCourseEvents] 🔴 ERREUR CRITIQUE | ${err.message} | execution_time=${Date.now() - t0}ms`);
    return Response.json({ ok: true });
  }
});