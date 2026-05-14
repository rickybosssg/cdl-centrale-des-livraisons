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
    console.log('[forceAdminRole] ========================================');
    console.log('[forceAdminRole] START | Timestamp:', new Date().toISOString());
    
    const base44 = createClientFromRequest(req);
    const currentUser = await base44.auth.me();

    console.log('[forceAdminRole] Current user:', {
      email: currentUser?.email,
      role: currentUser?.role,
      user_type: currentUser?.user_type,
    });

    // ADMIN AUTO-REPAIR : permettre à tout utilisateur connecté de forcer admin
    // (la fonction est elle-même protégée par l'authentification Base44)
    if (!currentUser) {
      console.error('[forceAdminRole] ❌ No user logged in');
      return Response.json({ error: 'Unauthorized — Login required' }, { status: 401, headers: corsHeaders });
    }

    const { target_email } = await req.json().catch(() => ({}));
    if (!target_email || !target_email.includes('@')) {
      return Response.json({ error: 'Invalid email — must contain @' }, { status: 400, headers: corsHeaders });
    }

    console.log('[forceAdminRole] 🎯 Target email:', target_email);

    // Récupérer l'utilisateur
    const users = await base44.asServiceRole.entities.User.filter({ email: target_email });
    if (!users || users.length === 0) {
      console.error('[forceAdminRole] ❌ User not found:', target_email);
      return Response.json({ error: 'User not found', email: target_email }, { status: 404, headers: corsHeaders });
    }

    const user = users[0];
    console.log('[forceAdminRole] ✅ User found:', {
      id: user.id,
      email: user.email,
      current_role: user.role,
      current_user_type: user.user_type,
      current_active_profile: user.active_profile_type,
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
      driver_online: false,
      livreur_bloque: false,
      livreur_suspendu: false,
      profiles_list: JSON.stringify(['admin']),
      updated_at: now,
    };

    console.log('[forceAdminRole] 📝 Update data:', JSON.stringify(updateData, null, 2));
    await base44.asServiceRole.entities.User.update(user.id, updateData);
    console.log('[forceAdminRole] ✅ User updated in DB');
    
    // Délai de synchronisation
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // VÉRIFICATION IMMÉDIATE
    const verifyUsers = await base44.asServiceRole.entities.User.filter({ email: target_email });
    const verifyUser = verifyUsers[0];
    console.log('[forceAdminRole] 🔍 Verification:', {
      role: verifyUser?.role,
      user_type: verifyUser?.user_type,
      active_profile_type: verifyUser?.active_profile_type,
      is_admin: verifyUser?.is_admin,
    });
    
    // CRÉER LE PROFIL ADMIN SI INEXISTANT
    const adminProfiles = await base44.asServiceRole.entities.UserProfile.filter({
      user_email: target_email,
      profile_type: 'admin',
      deleted: false,
    });

    if (adminProfiles.length === 0) {
      console.log('[forceAdminRole] Creating admin profile...');
      await base44.asServiceRole.entities.UserProfile.create({
        user_email: target_email,
        profile_type: 'admin',
        status: 'actif',
        is_active_profile: true,
        completion_percentage: 100,
        validated_at: now,
        validated_by: 'forceAdminRole_function',
      });
      console.log('[forceAdminRole] ✅ Admin profile created');
    }

    console.log('[forceAdminRole] ========================================');
    console.log('[forceAdminRole] ✅ SUCCESS | Admin role forced for:', target_email);

    return Response.json({
      success: true,
      message: 'Admin role successfully forced',
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
    console.error('[forceAdminRole] ❌ ERROR:', error.message);
    console.error('[forceAdminRole] Stack:', error.stack);
    return Response.json({ error: error.message, stack: error.stack }, { status: 500, headers: corsHeaders });
  }
});