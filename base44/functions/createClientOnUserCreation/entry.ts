import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data } = await req.json();

    // Vérifier que c'est un client
    if (data.user_type !== 'client') {
      return Response.json({ skipped: true, reason: 'Not a client' });
    }

    // Créer un enregistrement Client
    await base44.asServiceRole.entities.Client.create({
      nom_complet: data.full_name || '',
      numero_telephone: data.telephone || '',
      email: data.email || '',
      date_inscription: new Date().toISOString(),
      statut_client: 'Nouveau',
      nombre_total_courses: 0,
      total_depense: 0,
    });

    return Response.json({ success: true, created: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});