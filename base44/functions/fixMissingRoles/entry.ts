import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    // Admin only
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Récupérer tous les users sans rôle
    const allUsers = await base44.asServiceRole.entities.User.list('', 1000);
    const usersWithoutRole = allUsers.filter(u => !u.user_type);
    
    const fixed = [];
    const errors = [];

    // Assigner "client" par défaut à tous les users sans rôle
    for (const u of usersWithoutRole) {
      try {
        await base44.asServiceRole.entities.User.update(u.id, { 
          user_type: 'client' 
        });
        fixed.push({ email: u.email, full_name: u.full_name, assigned: 'client' });
      } catch (err) {
        errors.push({ email: u.email, error: err.message });
      }
    }

    return Response.json({
      status: 'ok',
      fixed_count: fixed.length,
      error_count: errors.length,
      fixed_users: fixed,
      errors: errors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});