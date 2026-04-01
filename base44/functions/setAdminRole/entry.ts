import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Seul un admin peut attribuer le rôle admin
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Only admins can set admin role' }, { status: 403 });
    }

    const { target_email } = await req.json();
    if (!target_email || !target_email.includes('@')) {
      return Response.json({ error: 'Invalid target_email' }, { status: 400 });
    }

    console.log('[setAdminRole] Admin:', user.email, '→ Setting admin for:', target_email);

    // Récupérer l'utilisateur cible
    const targetUsers = await base44.asServiceRole.entities.User.filter({ email: target_email });
    if (targetUsers.length === 0) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const targetUser = targetUsers[0];
    console.log('[setAdminRole] Target user found:', targetUser.id, targetUser.email);

    // Mettre à jour le rôle
    await base44.asServiceRole.entities.User.update(targetUser.id, {
      role: 'admin',
      user_type: 'admin',
      active_profile_type: 'admin',
      is_admin: true,
      admin_status: 'active',
      profiles_list: JSON.stringify(['admin']),
    });

    console.log('[setAdminRole] ✅ Admin role set for:', target_email);

    // Soft-delete tous les profils utilisateur sauf admin
    const profiles = await base44.asServiceRole.entities.UserProfile.filter({
      user_email: target_email,
      deleted: false,
    });

    for (const profile of profiles) {
      if (profile.profile_type !== 'admin') {
        await base44.asServiceRole.entities.UserProfile.update(profile.id, {
          deleted: true,
          deleted_at: new Date().toISOString(),
        });
        console.log('[setAdminRole] Deleted profile:', profile.profile_type);
      }
    }

    // Notifier l'utilisateur
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: target_email,
      destinataire_role: 'admin',
      titre: '✅ Rôle administrateur attribué',
      message: 'Vous avez maintenant accès au dashboard administrateur CDL.',
      type: 'success',
      lue: false,
    });

    // Log administratif
    await base44.asServiceRole.entities.AdminActionLog.create({
      admin_email: user.email,
      object_type: 'partenaire',
      object_id: targetUser.id,
      object_name: target_email,
      action: 'validate',
      reason: 'Admin role assignment',
      target_email: target_email,
    });

    return Response.json({
      success: true,
      message: `Admin role set for ${target_email}`,
      user: {
        email: targetUser.email,
        role: 'admin',
        active_profile_type: 'admin',
      },
    });
  } catch (error) {
    console.error('[setAdminRole] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});