/**
 * forceReleaseDriver — Libère un livreur bloqué (nombre_courses_actives → 0)
 * Admin uniquement. Utilisé quand une course est annulée de force.
 *
 * Payload: { driver_email }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });

  const base44 = createClientFromRequest(req);
  let user = null;
  try { user = await base44.auth.me(); } catch (_) {}
  if (!user) return Response.json({ error: 'Non authentifié' }, { status: 401 });
  if (user.role !== 'admin') return Response.json({ error: 'Admin requis' }, { status: 403 });

  const { driver_email, course_id } = await req.json();
  if (!driver_email) return Response.json({ error: 'driver_email requis' }, { status: 400 });

  console.log(`[FORCE_RELEASE_START] driver=${driver_email} | course=${course_id || 'N/A'} | by=${user.email}`);

  // Trouver le livreur
  const users = await base44.asServiceRole.entities.User.filter({ email: driver_email });
  if (!users || users.length === 0) {
    console.error(`[FORCE_RELEASE_ERROR] User not found: ${driver_email}`);
    return Response.json({ error: 'Livreur introuvable' }, { status: 404 });
  }

  const livreur = users[0];
  const prevCount = livreur.nombre_courses_actives || 0;

  await base44.asServiceRole.entities.User.update(livreur.id, {
    nombre_courses_actives: 0,
  });

  console.log(`[FORCE_RELEASE_SUCCESS] driver=${driver_email} | nombre_courses_actives: ${prevCount} → 0`);

  // Vérifier si la course est annulée (diagnostic)
  if (course_id) {
    const courses = await base44.asServiceRole.entities.Course.filter({ id: course_id });
    const c = courses?.[0];
    console.log(`[COURSE_STATUS_REAL] course=${course_id} | statut=${c?.statut} | settlement=${c?.settlement_status}`);

    if (c && c.statut !== 'annulee') {
      await base44.asServiceRole.entities.Course.update(course_id, {
        statut: 'annulee',
        frais_annulation: 0,
      });
      console.log(`[FORCE_CANCEL_SUCCESS] course=${course_id} forcée → annulee`);
    } else if (c?.statut === 'annulee') {
      console.log(`[FORCE_CANCEL_SUCCESS] course=${course_id} déjà annulee ✓`);
    }
  }

  // Vérif Bedou client — pas de débit si settlement pending
  let bedouStatus = 'non vérifié';
  if (course_id) {
    try {
      const courses = await base44.asServiceRole.entities.Course.filter({ id: course_id });
      const c = courses?.[0];
      if (c?.client_email) {
        const bedous = await base44.asServiceRole.entities.Bedou.filter({ user_email: c.client_email });
        const b = bedous?.[0];
        bedouStatus = b ? `solde=${b.solde_disponible} FCFA | statut=${b.statut_bedou}` : 'wallet introuvable';
        console.log(`[BEDOU_CHECK] client=${c.client_email} | ${bedouStatus}`);
      }
    } catch (e) {
      console.error(`[BEDOU_CHECK_ERROR] ${e.message}`);
    }
  }

  return Response.json({
    success: true,
    driver_email,
    nombre_courses_actives_avant: prevCount,
    nombre_courses_actives_apres: 0,
    course_id: course_id || null,
    bedou_client: bedouStatus,
  });
});