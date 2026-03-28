import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Créer le Client
    await base44.asServiceRole.entities.Client.create({
      nom_complet: user.full_name || '',
      numero_telephone: body.telephone,
      email: user.email,
      quartier_principal: body.quartier,
      date_inscription: new Date().toISOString(),
      statut_client: 'Nouveau',
      nombre_total_courses: 0,
      total_depense: 0,
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});