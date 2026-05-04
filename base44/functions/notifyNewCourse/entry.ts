/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  notifyNewCourse — VERROUILLÉ v2.0                          ║
 * ║  NOTIFICATIONS_SYSTEM_LOCKED = true                         ║
 * ║  ✅ 100% via sendCdlNotification (source unique)            ║
 * ║  ❌ NE PAS remettre de FCM direct ici                       ║
 * ║  ❌ NE PAS changer le channel_id (géré par sendCdlNotif)    ║
 * ║  ✅ Toujours retourner { ok: true }                         ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * notifyNewCourse — Automation entity Course (create)
 * - Notifie le client : confirmation de réception
 * - Notifie les admins : nouvelle course à dispatcher
 *
 * NE notifie PAS les livreurs directement.
 * La notification livreur est gérée par autoDispatch.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const course = body.data;

    if (!course) return Response.json({ ok: true, skipped: 'no_data' });

    // Ne traiter que les nouvelles courses en attente
    if (!['en_attente', 'en_attente_dispatch'].includes(course.statut)) {
      return Response.json({ ok: true, skipped: 'not_en_attente' });
    }

    console.log(`[notifyNewCourse] START | course=${course.id} | ${course.quartier_depart} → ${course.quartier_arrivee} | prix=${course.prix}`);
    console.log(`[NOTIF_SOURCE] notifyNewCourse | event=course_created | course_id=${course.id}`);

    const notify = (payload) => {
      console.log(`[notifyNewCourse] → sendCdlNotification | to=${payload.user_email || payload.role} | type=${payload.data?.type}`);
      return base44.asServiceRole.functions.invoke('sendCdlNotification', payload).catch(e =>
        console.warn('[notifyNewCourse] notify non-fatal:', e.message)
      );
    };

    const tasks = [];

    // ── 1. Client : confirmation de réception ────────────────────────────────
    if (course.client_email) {
      tasks.push(notify({
        user_email: course.client_email,
        title: '📦 Demande reçue !',
        body: `Votre demande a été envoyée. Recherche d'un livreur en cours pour ${course.quartier_depart} → ${course.quartier_arrivee}.`,
        data: {
          type: 'course_created',
          entity_id: course.id,
          entity_type: 'Course',
          notif_route: `/course/${course.id}/track`,
        },
      }));
    }

    // ── 2. Admins : nouvelle course à dispatcher ─────────────────────────────
    tasks.push(notify({
      role: 'admin',
      title: '📋 Nouvelle course en attente',
      body: `${course.quartier_depart} → ${course.quartier_arrivee} · ${course.type_colis || '?'} · ${course.prix || 0} F`,
      data: {
        type: 'new_course',
        entity_id: course.id,
        entity_type: 'Course',
        notif_route: '/dispatch-monitor',
      },
    }));

    await Promise.allSettled(tasks);
    console.log(`[notifyNewCourse] DONE | tasks=${tasks.length} | +${Date.now() - t0}ms`);
    return Response.json({ ok: true, sent: tasks.length });

  } catch (err) {
    console.error(`[notifyNewCourse] 🔴 ERREUR CRITIQUE | ${err.message} | +${Date.now() - t0}ms`);
    return Response.json({ ok: true });
  }
});