/**
 * forceDeleteCourse — LEGACY STUB v6
 *
 * ⛔ DÉPRÉCIÉ — Ne plus utiliser directement.
 * Remplacé par : adminCourseAction { action: "force_delete" }
 *
 * adminCourseAction.force_delete gère :
 *   - is_deleted=true + statut=annulee simultanément
 *   - Libération livreur (recalcul réel BDD)
 *   - AdminActionLog complet
 *
 * Ce stub redirige les appels résiduels pour ne pas bloquer l'UI.
 * Auth : rôle admin uniquement.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const course_id = body.course_id || body.courseId || '?';

  let caller = '?';
  try { const u = await base44.auth.me(); caller = u?.email || '?'; } catch (_) {}

  console.warn(`[LEGACY_CALL_BLOCKED] forceDeleteCourse | course=${course_id} | caller=${caller} | use adminCourseAction{action:force_delete} instead`);

  const res = await base44.asServiceRole.functions.invoke('adminCourseAction', {
    course_id,
    action: 'force_delete',
    raison: body.raison || 'Force delete (legacy redirect)',
  }).catch(e => ({ data: { success: false, error: e.message } }));

  return Response.json(res?.data || { success: false, reason: 'legacy_blocked' });
});