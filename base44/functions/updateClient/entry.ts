import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function calculerStatut(nbCourses, totalDepense, existingStatut) {
  // Ne pas écraser un statut Bloqué
  if (existingStatut === 'Bloqué') return 'Bloqué';
  if (totalDepense >= 50000 || nbCourses >= 20) return 'VIP';
  if (nbCourses >= 10) return 'Fidèle';
  if (nbCourses >= 2) return 'Actif';
  return 'Nouveau';
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const base44 = createClientFromRequest(req);

    const courseData = body.data || body.course;
    const courseId = body.event?.entity_id || body.course_id;

    let course = courseData;
    if (!course && courseId) {
      const results = await base44.asServiceRole.entities.Course.filter({ id: courseId });
      course = results[0];
    }

    if (!course || !course.client_email) {
      return Response.json({ message: 'Pas de client à mettre à jour' });
    }

    const email = course.client_email;
    const existing = await base44.asServiceRole.entities.Client.filter({ email });
    const now = new Date().toISOString();

    if (existing.length === 0) {
      // Nouveau client
      await base44.asServiceRole.entities.Client.create({
        nom_complet: course.client_name || '',
        email,
        numero_telephone: course.telephone_expediteur || '',
        quartier_principal: course.quartier_depart || '',
        date_inscription: now,
        nombre_total_courses: 1,
        total_depense: course.statut === 'livree' ? (course.prix || 0) : 0,
        date_derniere_course: now,
        statut_client: 'Nouveau',
      });
    } else {
      const client = existing[0];
      const nbCourses = (client.nombre_total_courses || 0) + 1;
      const totalDepense = (client.total_depense || 0) + (course.statut === 'livree' ? (course.prix || 0) : 0);
      const statut = calculerStatut(nbCourses, totalDepense, client.statut_client);

      await base44.asServiceRole.entities.Client.update(client.id, {
        nom_complet: course.client_name || client.nom_complet,
        nombre_total_courses: nbCourses,
        total_depense: totalDepense,
        date_derniere_course: now,
        statut_client: statut,
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});