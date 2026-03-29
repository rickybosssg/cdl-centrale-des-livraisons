import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    // Admin only
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Récupérer tous les users
    const allUsers = await base44.asServiceRole.entities.User.list('', 1000);
    
    // Récupérer tous les profils
    const [clients, livreurs, partenaires, commerciaux] = await Promise.all([
      base44.asServiceRole.entities.Client.list('', 1000),
      base44.asServiceRole.entities.User.filter({ user_type: "livreur" }),
      base44.asServiceRole.entities.Partenaire.list('', 1000),
      base44.asServiceRole.entities.User.filter({ user_type: "commercial" }),
    ]);
    
    const anomalies = [];
    const stats = {
      total_users: allUsers.length,
      clients_count: 0,
      livreurs_count: 0,
      partenaires_count: 0,
      commerciaux_count: 0,
      sans_role: [],
      role_mismatch: [],
      orphaned_profiles: [],
    };
    
    // Vérifier chaque user
    const userEmails = new Set();
    allUsers.forEach(u => {
      userEmails.add(u.email);
      
      if (!u.user_type) {
        stats.sans_role.push({ email: u.email, full_name: u.full_name });
      } else if (u.user_type === 'client') {
        stats.clients_count++;
      } else if (u.user_type === 'livreur') {
        stats.livreurs_count++;
      } else if (u.user_type === 'partenaire') {
        stats.partenaires_count++;
      } else if (u.user_type === 'commercial') {
        stats.commerciaux_count++;
      }
    });
    
    // Vérifier les profils orphelins (qui n'ont pas de User correspondant)
    clients.forEach(c => {
      if (c.email && !userEmails.has(c.email)) {
        stats.orphaned_profiles.push({ type: 'Client', email: c.email });
      }
    });
    
    partenaires.forEach(p => {
      if (p.user_email && !userEmails.has(p.user_email)) {
        stats.orphaned_profiles.push({ type: 'Partenaire', email: p.user_email });
      }
    });
    
    return Response.json({
      status: 'ok',
      audit: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});