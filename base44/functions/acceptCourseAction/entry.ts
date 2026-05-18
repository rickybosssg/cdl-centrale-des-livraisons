/**
 * acceptCourseAction — Acceptation d'une course par un livreur
 * Remplace le Course.update direct frontend (évite 403 RLS APK)
 *
 * Payload: { course_id }
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
  const { course_id } = body;

  if (!course_id) {
    return Response.json({ error: 'course_id requis' }, { status: 400 });
  }

  console.log(`[ACCEPT_ACTION_START] course=${course_id} | user=${user.email}`);

  // Récupérer la course
  let courses = [];
  try {
    courses = await base44.asServiceRole.entities.Course.filter({ id: course_id });
  } catch (_) {}

  if (!courses || courses.length === 0) {
    console.error(`[ACCEPT_ACTION_ERROR] course not found | course=${course_id}`);
    return Response.json({ error: 'Course introuvable' }, { status: 404 });
  }

  const c = courses[0];

  const ACCEPTABLE = ['en_attente', 'assignee_attente', 'proposee', 'pending_driver_acceptance', 'en_attente_acceptation'];
  if (!ACCEPTABLE.includes(c.statut)) {
    console.error(`[ACCEPT_ACTION_ERROR] wrong statut | statut=${c.statut} | course=${course_id}`);
    return Response.json({ error: `Course non disponible (statut: ${c.statut})`, statut: c.statut }, { status: 409 });
  }

  const now = new Date().toISOString();

  await base44.asServiceRole.entities.Course.update(course_id, {
    statut: 'acceptee',
    livreur_email: user.email,
    livreur_name: user.full_name || user.email,
    telephone_livreur: user.telephone || '',
    date_acceptation: now,
    mode_assignation: c.mode_assignation || 'auto',
    heure_assignation: c.heure_assignation || now,
  });

  // Mettre à jour les stats livreur
  try {
    await base44.asServiceRole.entities.User.update(user.id, {
      nombre_courses_actives: (user.nombre_courses_actives || 0) + 1,
      courses_acceptees: (user.courses_acceptees || 0) + 1,
      courses_refusees_consecutives: 0,
    });
  } catch (_) {}

  // Notifier le client
  if (c.client_email) {
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: c.client_email,
      destinataire_role: 'client',
      titre: '🛵 Livreur en route !',
      message: `${user.full_name || 'Un livreur'} a accepté votre course ${c.quartier_depart}→${c.quartier_arrivee}.`,
      type: 'success',
      lue: false,
      course_id,
      target_screen: `/course/${course_id}/track`,
    }).catch(() => {});
  }

  console.log(`[ACCEPT_ACTION_SUCCESS] course=${course_id} | livreur=${user.email}`);
  return Response.json({ success: true, courseId: course_id, statut: 'acceptee', livreur_email: user.email });
});