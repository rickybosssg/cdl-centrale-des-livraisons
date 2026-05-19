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

    // ── TOUTES LES NOTIFICATIONS sont gérées par notificationOrchestrator ──────
    // notifyCourseEvents est désormais un ROUTEUR LÉGER vers notificationOrchestrator.
    // Il ne construit plus les payloads lui-même — SOURCE UNIQUE dans notificationOrchestrator.

    // Skip create — géré par notifyNewCourse + notificationOrchestrator.course_assigned
    if (event?.type === 'create') {
      console.log(`[notifyCourseEvents] SKIP create — géré par notifyNewCourse | +${Date.now() - t0}ms`);
      return Response.json({ ok: true, skipped: 'create_handled_by_notifyNewCourse' });
    }

    // Skip si pas de changement de statut
    if (event?.type !== 'update' || statut === oldStatut) {
      return Response.json({ ok: true });
    }

    // Mapping statut → event orchestrateur
    const STATUT_TO_EVENT = {
      acceptee:               'course_accepted',
      driver_en_route_pickup: 'course_en_route',
      arrived_pickup:         'course_arrived_pickup',
      arrivee_point_depart:   'course_arrived_pickup',
      en_cours:               'course_pickup',
      arrived_dropoff:        'course_arrived_dropoff',
      proche_destination:     'course_arrived_dropoff',
      livree:                 'course_delivered',
      annulee:                'course_cancelled',
    };

    const orchEvent = STATUT_TO_EVENT[statut];
    if (!orchEvent) {
      console.log(`[notifyCourseEvents] statut=${statut} → pas de notif orchestrateur | +${Date.now() - t0}ms`);
      return Response.json({ ok: true });
    }

    // livree : déjà géré par courseStateMachine.DELIVER → notificationOrchestrator
    // On skip ici pour éviter le doublon
    if (statut === 'livree') {
      console.log(`[notifyCourseEvents] SKIP livree — géré par courseStateMachine → notificationOrchestrator | +${Date.now() - t0}ms`);
      return Response.json({ ok: true, skipped: 'livree_handled_by_courseStateMachine' });
    }

    // annulee : déjà géré par cancelCourseAction → notificationOrchestrator
    if (statut === 'annulee') {
      console.log(`[notifyCourseEvents] SKIP annulee — géré par cancelCourseAction → notificationOrchestrator | +${Date.now() - t0}ms`);
      return Response.json({ ok: true, skipped: 'annulee_handled_by_cancelCourseAction' });
    }

    // Pour les autres transitions : déléguer à notificationOrchestrator
    await base44.asServiceRole.functions.invoke('notificationOrchestrator', {
      event: orchEvent,
      course_id: courseId,
      course: {
        client_email: course.client_email,
        livreur_email: course.livreur_email,
        livreur_name: course.livreur_name,
        quartier_depart: course.quartier_depart,
        quartier_arrivee: course.quartier_arrivee,
        gain_livreur: course.gain_livreur,
        prix: course.prix,
        telephone_expediteur: course.telephone_expediteur,
        telephone_livreur: course.telephone_livreur,
      },
    }).catch(e => console.warn('[notifyCourseEvents] orchestrateur error (non-fatal):', e.message));

    console.log(`[notifyCourseEvents] → notificationOrchestrator | event=${orchEvent} | statut=${statut} | +${Date.now() - t0}ms`);
    return Response.json({ ok: true, routed_to: 'notificationOrchestrator', event: orchEvent });

  } catch (err) {
    // Protection globale — jamais throw bloquant
    console.error(`[notifyCourseEvents] 🔴 ERREUR CRITIQUE | ${err.message} | execution_time=${Date.now() - t0}ms`);
    return Response.json({ ok: true });
  }
});