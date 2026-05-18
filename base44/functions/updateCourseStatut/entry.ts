/**
 * updateCourseStatut — Met à jour le statut intermédiaire d'une course (livreur)
 * Remplace le Course.update direct frontend pour les étapes de livraison.
 * Utilise asServiceRole pour éviter 403 RLS APK.
 *
 * Payload: { course_id, new_statut, extra? }
 * Transitions autorisées (livreur uniquement) :
 *   acceptee → driver_en_route_pickup
 *   driver_en_route_pickup → arrived_pickup
 *   arrived_pickup → en_cours
 *   en_cours → arrived_dropoff
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const LIVREUR_TRANSITIONS = {
  acceptee:               ['driver_en_route_pickup'],
  driver_en_route_pickup: ['arrived_pickup'],
  arrived_pickup:         ['en_cours'],
  en_cours:               ['arrived_dropoff'],
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST required' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);

  let user = null;
  try { user = await base44.auth.me(); } catch (_) {}
  if (!user) {
    return Response.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const body = await req.json();
  const { course_id, new_statut, extra = {} } = body;

  if (!course_id || !new_statut) {
    return Response.json({ error: 'course_id et new_statut requis' }, { status: 400 });
  }

  console.log(`[STATUT_ACTION_START] course=${course_id} | new_statut=${new_statut} | user=${user.email}`);

  // Récupérer la course
  let courses = [];
  try {
    courses = await base44.asServiceRole.entities.Course.filter({ id: course_id });
  } catch (_) {}

  if (!courses || courses.length === 0) {
    console.error(`[STATUT_ACTION_ERROR] course not found | course=${course_id}`);
    return Response.json({ error: 'Course introuvable' }, { status: 404 });
  }

  const c = courses[0];
  const isAdmin = user.role === 'admin' || user.role === 'dispatcher';

  // Vérifier que c'est bien le livreur de la course (ou admin)
  if (!isAdmin) {
    const livreurEmailNorm = (c.livreur_email || '').toLowerCase().trim();
    const userEmailNorm = (user.email || '').toLowerCase().trim();
    if (livreurEmailNorm !== userEmailNorm) {
      console.error(`[STATUT_ACTION_ERROR] 403 not livreur | livreur=${livreurEmailNorm} | user=${userEmailNorm}`);
      return Response.json({ error: 'Non autorisé — vous n\'êtes pas le livreur de cette course' }, { status: 403 });
    }
  }

  // Vérifier la transition
  const validNext = LIVREUR_TRANSITIONS[c.statut] || [];
  if (!isAdmin && !validNext.includes(new_statut)) {
    console.error(`[STATUT_ACTION_ERROR] invalid transition | from=${c.statut} | to=${new_statut}`);
    return Response.json({
      error: `Transition invalide: ${c.statut} → ${new_statut}`,
      current_statut: c.statut,
    }, { status: 400 });
  }

  const updateData = { statut: new_statut, ...extra };
  await base44.asServiceRole.entities.Course.update(course_id, updateData);

  console.log(`[STATUT_ACTION_SUCCESS] course=${course_id} | ${c.statut} → ${new_statut} | user=${user.email}`);
  return Response.json({ success: true, courseId: course_id, ancien_statut: c.statut, nouveau_statut: new_statut });
});