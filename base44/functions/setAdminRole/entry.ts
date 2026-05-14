import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    console.log('[setAdminRole] ========================================');
    console.log('[setAdminRole] START | Timestamp:', new Date().toISOString());
    
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    console.log('[setAdminRole] Current user:', {
      email: user?.email,
      role: user?.role,
    });

    // ADMIN AUTO-REPAIR : permettre à tout utilisateur connecté
    if (!user) {
      console.error('[setAdminRole] ❌ No user logged in');
      return Response.json({ error: 'Unauthorized — Login required' }, { status: 401, headers: corsHeaders });
    }

    const { target_email } = await req.json().catch(() => ({}));
    if (!target_email || !target_email.includes('@')) {
      return Response.json({ error: 'Invalid target_email — must contain @' }, { status: 400, headers: corsHeaders });
    }

    console.log('[setAdminRole] 🎯 Setting admin for:', target_email);

    // Récupérer l'utilisateur cible
    const targetUsers = await base44.asServiceRole.entities.User.filter({ email: target_email });
    if (!targetUsers || targetUsers.length === 0) {
      console.error('[setAdminRole] ❌ User not found:', target_email);
      return Response.json({ error: 'User not found', email: target_email }, { status: 404, headers: corsHeaders });
    }

    const targetUser = targetUsers[0];
    console.log('[setAdminRole] ✅ Target user found:', {
      id: targetUser.id,
      email: targetUser.email,
      current_role: targetUser.role,
    });

    // DONNÉES DE MISE À JOUR COMPLÈTES
    const now = new Date().toISOString();
    const updateData = {
      role: 'admin',
      user_type: 'admin',
      active_profile_type: 'admin',
      is_admin: true,
      admin_status: 'active',
      statut_compte: 'actif',
      profil_valide: true,
      profiles_list: JSON.stringify(['admin']),
      updated_at: now,
    };

    console.log('[setAdminRole] 📝 Update data:', JSON.stringify(updateData, null, 2));
    await base44.asServiceRole.entities.User.update(targetUser.id, updateData);
    console.log('[setAdminRole] ✅ User updated');

    // Délai de synchronisation
    await new Promise(resolve => setTimeout(resolve, 800));

    // VÉRIFICATION
    const verifyUsers = await base44.asServiceRole.entities.User.filter({ email: target_email });
    const verifyUser = verifyUsers[0];
    console.log('[setAdminRole] 🔍 Verification:', {
      role: verifyUser?.role,
      user_type: verifyUser?.user_type,
      active_profile_type: verifyUser?.active_profile_type,
    });

    // CRÉER LE PROFIL ADMIN SI INEXISTANT
    const adminProfiles = await base44.asServiceRole.entities.UserProfile.filter({
      user_email: target_email,
      profile_type: 'admin',
      deleted: false,
    });

    if (adminProfiles.length === 0) {
      console.log('[setAdminRole] Creating admin profile...');
      await base44.asServiceRole.entities.UserProfile.create({
        user_email: target_email,
        profile_type: 'admin',
        status: 'actif',
        is_active_profile: true,
        completion_percentage: 100,
        validated_at: now,
        validated_by: 'setAdminRole_function',
      });
      console.log('[setAdminRole] ✅ Admin profile created');
    }

    // Notifier l'utilisateur
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: target_email,
      destinataire_role: 'admin',
      titre: '✅ Rôle administrateur activé',
      message: 'Votre compte admin est maintenant actif. Redémarrez l\'application pour appliquer les changements.',
      type: 'success',
      lue: false,
      target_screen: '/admin-pro',
    });

    // Log administratif
    await base44.asServiceRole.entities.AdminActionLog.create({
      admin_email: user.email,
      object_type: 'user',
      object_id: targetUser.id,
      object_name: target_email,
      action: 'admin_role_assignment',
      reason: 'Admin role set via setAdminRole function',
      target_email: target_email,
      details: JSON.stringify({
        previous_role: targetUser.role,
        new_role: 'admin',
        timestamp: now,
      }),
    });

    console.log('[setAdminRole] ========================================');
    console.log('[setAdminRole] ✅ SUCCESS | Admin role set for:', target_email);

    return Response.json({
      success: true,
      message: `Admin role successfully set for ${target_email}`,
      user: {
        email: verifyUser.email,
        role: verifyUser.role,
        user_type: verifyUser.user_type,
        active_profile_type: verifyUser.active_profile_type,
        is_admin: verifyUser.is_admin,
      },
      verification: {
        role_verified: verifyUser?.role === 'admin',
        profile_created: adminProfiles.length === 0,
        timestamp: now,
      },
      next_steps: [
        'Logout and login again',
        'Or refresh the page (Ctrl+R / Cmd+R)',
        'Access /admin-pro dashboard',
      ],
    }, {
      headers: {
        ...corsHeaders,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    });
  } catch (error) {
    console.error('[setAdminRole] ❌ ERROR:', error.message);
    console.error('[setAdminRole] Stack:', error.stack);
    return Response.json({ error: error.message, stack: error.stack }, { status: 500, headers: corsHeaders });
  }
});