/**
 * updateCourseDelivered — Met à jour le statut d'une course à "livree"
 * Utilisé par le livreur après confirmation de livraison.
 * Utilise asServiceRole pour éviter les 403 RLS.
 *
 * Payload: { course_id, commission_cdl, gain_livreur }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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
  const { course_id, commission_cdl, gain_livreur } = body;

  if (!course_id) {
    return Response.json({ error: 'course_id requis' }, { status: 400 });
  }

  console.log(`[DELIVERY_BACKEND_START] updateCourseDelivered | course=${course_id} | user=${user.email}`);

  // Vérifier que la course existe et que l'utilisateur est bien le livreur (ou admin)
  let courses = [];
  try {
    courses = await base44.asServiceRole.entities.Course.filter({ id: course_id });
  } catch (_) {}

  if (!courses || courses.length === 0) {
    return Response.json({ error: 'Course introuvable' }, { status: 404 });
  }

  const c = courses[0];
  const isAdmin = user.role === 'admin' || user.role === 'dispatcher';

  if (!isAdmin && c.livreur_email !== user.email) {
    console.error(`[DELIVERY_BACKEND_ERROR] 403 | livreur_email=${c.livreur_email} | user=${user.email}`);
    return Response.json({ error: 'Non autorisé — vous n\'êtes pas le livreur de cette course' }, { status: 403 });
  }

  // Idempotence : déjà livrée ?
  if (c.statut === 'livree' || c.settlement_status === 'completed') {
    console.log(`[DELIVERY_BACKEND_SUCCESS] already done | course=${course_id}`);
    return Response.json({ success: true, alreadyDone: true });
  }

  const now = new Date().toISOString();
  const finalGain = gain_livreur || Math.round((c.prix || 0) * 0.8);
  const finalCommission = commission_cdl || ((c.prix || 0) - finalGain);

  await base44.asServiceRole.entities.Course.update(course_id, {
    statut: 'livree',
    date_livraison: now,
    statut_paiement: 'paye',
    commission_cdl: finalCommission,
    gain_livreur: finalGain,
    statut_paiement_livreur: 'Payé',
    settlement_status: 'completed',
    settled_at: now,
  });

  // Libérer le livreur (nombre_courses_actives -1)
  try {
    const livs = await base44.asServiceRole.entities.User.filter({ email: c.livreur_email });
    if (livs?.[0]) {
      await base44.asServiceRole.entities.User.update(livs[0].id, {
        nombre_courses_actives: Math.max(0, (livs[0].nombre_courses_actives || 1) - 1),
      });
    }
  } catch (_) {}

  console.log(`[DELIVERY_BACKEND_SUCCESS] course=${course_id} | statut=livree | gain=${finalGain}`);
  return Response.json({ success: true, courseId: course_id, statut: 'livree', gain_livreur: finalGain });
});