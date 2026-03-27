import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const base44 = createClientFromRequest(req);

    // Support both direct call and entity automation payload
    const course = body.data || body.course;
    const courseId = body.event?.entity_id || body.course_id;

    // Fetch course if not provided directly
    let courseData = course;
    if (!courseData && courseId) {
      const results = await base44.asServiceRole.entities.Course.filter({ id: courseId });
      courseData = results[0];
    }

    if (!courseData || !courseData.client_email) {
      return Response.json({ message: 'Pas de client à mettre à jour' });
    }

    const email = courseData.client_email;

    // Find existing client
    const existing = await base44.asServiceRole.entities.Client.filter({ email });

    if (existing.length === 0) {
      // Create new client
      await base44.asServiceRole.entities.Client.create({
        nom_complet: courseData.client_name || '',
        email,
        numero_telephone: courseData.telephone_expediteur || '',
        quartier_principal: courseData.quartier_depart || '',
        date_inscription: new Date().toISOString(),
        nombre_total_courses: 1,
        total_depense: courseData.statut === 'livree' ? (courseData.prix || 0) : 0,
        date_derniere_course: new Date().toISOString(),
        statut_client: 'Actif',
      });
    } else {
      const client = existing[0];
      const nbCourses = (client.nombre_total_courses || 0) + 1;
      const totalDepense = (client.total_depense || 0) + (courseData.statut === 'livree' ? (courseData.prix || 0) : 0);

      // Determine status based on activity
      let statut = client.statut_client || 'Actif';
      if (statut !== 'Bloqué' && statut !== 'Inactif') {
        if (nbCourses >= 20) statut = 'VIP';
        else if (nbCourses >= 10) statut = 'Fréquent';
        else statut = 'Actif';
      }

      await base44.asServiceRole.entities.Client.update(client.id, {
        nom_complet: courseData.client_name || client.nom_complet,
        nombre_total_courses: nbCourses,
        total_depense: totalDepense,
        date_derniere_course: new Date().toISOString(),
        statut_client: statut,
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});