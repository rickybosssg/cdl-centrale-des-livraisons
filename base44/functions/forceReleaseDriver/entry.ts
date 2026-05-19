/**
 * forceReleaseDriver — Libération admin d'un livreur bloqué
 *
 * RECALCUL RÉEL depuis BDD (jamais décrémentation cache).
 * Auth : admin uniquement (role=admin en BDD).
 * ⚠️ N'écrit JAMAIS statut='annulee' directement — voir cancelCourseAction pour ça.
 *
 * Payload: { driver_email, course_id? }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ACTIVE_STATUTS = new Set([
  'assignee_attente', 'acceptee', 'driver_en_route_pickup',
  'arrived_pickup', 'en_cours', 'arrived_dropoff',
]);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });

  const base44 = createClientFromRequest(req);
  let user = null;
  try { user = await base44.auth.me(); } catch (_) {}
  if (!user) return Response.json({ error: 'Non authentifié' }, { status: 401 });

  // Auth : vérifier rôle admin en BDD (pas uniquement le token JWT)
  let isAdmin = user.role === 'admin';
  if (!isAdmin) {
    const dbUsers = await base44.asServiceRole.entities.User.filter({ email: user.email }).catch(() => []);
    isAdmin = dbUsers?.[0]?.role === 'admin';
  }
  if (!isAdmin) return Response.json({ error: 'Admin requis' }, { status: 403 });

  const { driver_email, course_id } = await req.json();
  if (!driver_email) return Response.json({ error: 'driver_email requis' }, { status: 400 });

  console.log(`[FORCE_RELEASE_START] driver=${driver_email} | course=${course_id || 'N/A'} | by=${user.email}`);

  // Trouver le livreur
  const users = await base44.asServiceRole.entities.User.filter({ email: driver_email });
  if (!users || users.length === 0) {
    return Response.json({ error: 'Livreur introuvable' }, { status: 404 });
  }
  const livreur = users[0];
  const prevCount = livreur.nombre_courses_actives || 0;

  // Recalcul RÉEL depuis BDD — source unique, jamais décrémentation cache
  const allCourses = await base44.asServiceRole.entities.Course.filter({ livreur_email: driver_email });
  const realCount = allCourses.filter(c =>
    (!course_id || c.id !== course_id) && ACTIVE_STATUTS.has(c.statut) && !c.is_deleted
  ).length;

  await base44.asServiceRole.entities.User.update(livreur.id, {
    nombre_courses_actives: realCount,
  });

  console.log(`[FORCE_RELEASE_SUCCESS] driver=${driver_email} | stored=${prevCount} → real=${realCount} | by=${user.email}`);

  // Log admin
  await base44.asServiceRole.entities.AdminActionLog.create({
    admin_email: user.email,
    admin_name: user.full_name || user.email,
    action_type: 'DRIVER_FORCE_RELEASED',
    entity_type: 'User',
    entity_id: livreur.id,
    details: `Libération forcée livreur ${driver_email} | courses_actives: ${prevCount} → ${realCount}${course_id ? ` | course_ref=${course_id}` : ''}`,
  }).catch(() => {});

  // Diagnostic course si fournie
  let courseDiag = null;
  if (course_id) {
    const courses = await base44.asServiceRole.entities.Course.filter({ id: course_id }).catch(() => []);
    const c = courses?.[0];
    courseDiag = c ? { statut: c.statut, settlement_status: c.settlement_status } : 'introuvable';
    console.log(`[COURSE_DIAG] course=${course_id} | statut=${c?.statut} | settlement=${c?.settlement_status}`);
  }

  return Response.json({
    success: true,
    driver_email,
    nombre_courses_actives_avant: prevCount,
    nombre_courses_actives_apres: realCount,
    course_id: course_id || null,
    course_diag: courseDiag,
  });
});