import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const currentUser = await base44.auth.me();

    // Seul un admin peut forcer le rôle admin
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.email !== 'weezyh2@gmail.com')) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { target_email } = await req.json();
    if (!target_email || !target_email.includes('@')) {
      return Response.json({ error: 'Invalid email' }, { status: 400 });
    }

    console.log('[forceAdminRole] Forcing admin role for:', target_email);

    // Récupérer l'utilisateur
    const users = await base44.asServiceRole.entities.User.filter({ email: target_email });
    if (!users || users.length === 0) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const user = users[0];
    console.log('[forceAdminRole] User found:', user.id, '| Current role:', user.role, '| Current user_type:', user.user_type);

    // Mettre à jour TOUS les champs qui définissent le rôle
    const updateData = {
      role: 'admin',
      user_type: 'admin',
      active_profile_type: 'admin',
      is_admin: true,
      admin_status: 'active',
      profiles_list: JSON.stringify(['admin']),
    };

    console.log('[forceAdminRole] Updating user with:', JSON.stringify(updateData));

    await base44.asServiceRole.entities.User.update(user.id, updateData);

    // Vérifier que c'est bien mis à jour
    const updatedUsers = await base44.asServiceRole.entities.User.filter({ email: target_email });
    const updatedUser = updatedUsers[0];

    console.log('[forceAdminRole] ✅ Updated user:', {
      email: updatedUser.email,
      role: updatedUser.role,
      user_type: updatedUser.user_type,
      active_profile_type: updatedUser.active_profile_type,
    });

    return Response.json({
      success: true,
      user: {
        email: updatedUser.email,
        role: updatedUser.role,
        user_type: updatedUser.user_type,
        active_profile_type: updatedUser.active_profile_type,
      },
    });
  } catch (error) {
    console.error('[forceAdminRole] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});