import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Ajouter le rôle admin aux rôles existants
    let roles = [];
    if (user.user_roles) {
      try { roles = JSON.parse(user.user_roles); } catch (_) {}
    }
    if (user.user_type && !roles.includes(user.user_type)) {
      roles.push(user.user_type);
    }
    if (!roles.includes('admin')) {
      roles.push('admin');
    }
    
    await base44.asServiceRole.entities.User.update(user.id, {
      role: 'admin',
      user_roles: JSON.stringify(roles),
    });

    return Response.json({ success: true, message: 'Vous êtes rétabli administrateur' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});