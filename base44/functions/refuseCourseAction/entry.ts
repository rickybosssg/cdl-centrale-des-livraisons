/**
 * refuseCourseAction — Refus d'une course par un livreur
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

  console.log(`[REFUSE_ACTION_START] course=${course_id} | user=${user.email}`);

  // Récupérer la course
  let courses = [];
  try {
    courses = await base44.asServiceRole.entities.Course.filter({ id: course_id });
  } catch (_) {}

  if (!courses || courses.length === 0) {
    console.error(`[REFUSE_ACTION_ERROR] course not found | course=${course_id}`);
    return Response.json({ error: 'Course introuvable' }, { status: 404 });
  }

  const c = courses[0];
  const now = new Date().toISOString();

  // Mettre à jour l'historique
  let historique = [];
  try {
    if (c.historique_assignation) historique = JSON.parse(c.historique_assignation);
  } catch (_) {}

  historique = historique.map(h =>
    h.livreur_email?.toLowerCase().trim() === user.email?.toLowerCase().trim() && h.statut === 'proposee'
      ? { ...h, statut: 'refuse', heure_refus: now }
      : h
  );

  await base44.asServiceRole.entities.Course.update(course_id, {
    statut: 'en_attente',
    livreur_email: null,
    livreur_name: null,
    telephone_livreur: null,
    heure_assignation: null,
    historique_assignation: JSON.stringify(historique),
  });

  // Mettre à jour les stats livreur
  try {
    await base44.asServiceRole.entities.User.update(user.id, {
      nombre_courses_actives: Math.max(0, (user.nombre_courses_actives || 1) - 1),
      courses_refusees: (user.courses_refusees || 0) + 1,
      courses_refusees_consecutives: (user.courses_refusees_consecutives || 0) + 1,
    });
  } catch (_) {}

  // Re-dispatcher via moteur unifié (respecte le mode auto/manuel)
  base44.asServiceRole.functions.invoke('cdlDispatch', {
    course_id,
    exclude_emails: [user.email],
  }).catch(() => {});

  console.log(`[REFUSE_ACTION_SUCCESS] course=${course_id} | livreur=${user.email}`);
  return Response.json({ success: true, courseId: course_id, statut: 'en_attente' });
});