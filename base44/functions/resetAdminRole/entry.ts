import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Remettre le rôle admin
    await base44.asServiceRole.entities.User.update(user.id, {
      role: 'admin',
      user_type: 'dispatcher',
      user_roles: JSON.stringify(['admin']),
    });

    return Response.json({ success: true, message: 'Vous êtes rétabli administrateur' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});