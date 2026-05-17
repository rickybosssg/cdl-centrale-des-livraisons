/**
 * CDL — notifyAdminCourseComplete v3 STUB
 *
 * ⚠️ DÉPRÉCIÉ — NE PAS MODIFIER
 * Doublonnait notifyCourseEvents (automation entity Course update).
 * Créait directement des Notification sans passer par sendCdlNotification.
 * Les notifications "livraison complétée" admin sont gérées par notifyCourseEvents.
 * Redirige vers sendCdlNotification role=admin.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const courseData = body.data || {};
  const courseId = body.event?.entity_id || body.course_id || courseData.id;

  console.log('[notifyAdminCourseComplete] STUB → redirection vers sendCdlNotification');

  if (!courseId) return Response.json({ ok: true, skipped: 'no_course_id' });

  // Seulement si statut livree
  if (courseData.statut && courseData.statut !== 'livree') {
    return Response.json({ ok: true, skipped: 'not_livree' });
  }

  await base44.asServiceRole.functions.invoke('sendCdlNotification', {
    role: 'admin',
    title: '✅ Livraison complétée',
    body: `${courseData.quartier_depart || '?'} → ${courseData.quartier_arrivee || '?'} · ${courseData.livreur_name || '?'} · ${courseData.prix || '?'} FCFA`,
    data: {
      type: 'course_delivered',
      entity_id: courseId,
      entity_type: 'Course',
      notif_route: '/admin/financial-dashboard',
    },
  }).catch(() => {});

  return Response.json({ ok: true, redirected: true });
});