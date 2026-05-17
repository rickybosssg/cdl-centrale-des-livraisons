/**
 * CDL — notifyCourseStatus v4 STUB
 *
 * ⚠️ DÉPRÉCIÉ — NE PAS MODIFIER
 * DOUBLON CRITIQUE avec notifyCourseEvents (automation entity Course update).
 * Les deux fonctions envoyaient des notifications FCM directes + BDD pour les mêmes
 * changements de statut → doublon push garanti sur chaque transition.
 *
 * notifyCourseEvents est la fonction officielle (via sendCdlNotification).
 * Cette fonction ne fait rien pour éviter les doublons.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  const course = body.data;
  const oldStatut = body.old_data?.statut;
  const newStatut = course?.statut;

  console.log(`[notifyCourseStatus] STUB (DÉPRÉCIÉ) — doublon supprimé | ${oldStatut} → ${newStatut} | géré par notifyCourseEvents`);

  return Response.json({ ok: true, skipped: true, reason: 'handled_by_notifyCourseEvents', note: 'DEPRECATED' });
});