import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Admin only
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Récupérer tous les users avec user_type = "client"
    const clientUsers = await base44.asServiceRole.entities.User.filter({ user_type: 'client' });
    
    // Récupérer tous les Clients existants
    const existingClients = await base44.asServiceRole.entities.Client.list('-created_date', 1000);
    const existingEmails = new Set(existingClients.map(c => c.email));

    // Créer les Clients manquants
    const missing = clientUsers.filter(u => !existingEmails.has(u.email));
    
    for (const u of missing) {
      await base44.asServiceRole.entities.Client.create({
        nom_complet: u.full_name || '',
        numero_telephone: u.telephone || '',
        email: u.email,
        quartier_principal: u.quartier || '',
        date_inscription: u.created_date || new Date().toISOString(),
        statut_client: 'Actif',
        nombre_total_courses: u.total_courses || 0,
        total_depense: 0,
      });
    }

    return Response.json({ synced: missing.length, total: clientUsers.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});