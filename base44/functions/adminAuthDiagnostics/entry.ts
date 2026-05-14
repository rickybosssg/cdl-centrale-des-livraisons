/**
 * adminAuthDiagnostics — Diagnostic complet des accès admin
 * 
 * Retourne l'état complet d'un utilisateur : rôle, profils, permissions
 * Utilisable depuis le frontend pour éviter d'utiliser asServiceRole côté client
 */
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
    console.log('[adminAuthDiagnostics] START');
    
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const targetEmail = body.email || user.email;

    // Récupérer l'utilisateur cible
    const targetUsers = await base44.asServiceRole.entities.User.filter({ email: targetEmail });
    const targetUser = targetUsers[0];

    if (!targetUser) {
      return Response.json({ 
        error: 'User not found',
        email: targetEmail 
      }, { status: 404, headers: corsHeaders });
    }

    // Récupérer tous les profils
    const allProfiles = await base44.asServiceRole.entities.UserProfile.filter({
      user_email: targetEmail,
      deleted: false,
    });

    const adminProfile = allProfiles.find(p => p.profile_type === 'admin');

    // Vérifier les permissions backend
    let backendFunctionsEnabled = false;
    try {
      await base44.asServiceRole.entities.DispatchModeState.list('-updated_at', 1);
      backendFunctionsEnabled = true;
    } catch (err) {
      console.error('[adminAuthDiagnostics] Backend functions error:', err.message);
    }

    return Response.json({
      success: true,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        role: targetUser.role,
        user_type: targetUser.user_type,
        active_profile_type: targetUser.active_profile_type,
        is_admin: targetUser.is_admin,
        admin_status: targetUser.admin_status,
        statut_compte: targetUser.statut_compte,
        profil_valide: targetUser.profil_valide,
        profiles_list: targetUser.profiles_list,
        has_admin_profile: !!adminProfile,
        admin_profile_status: adminProfile?.status,
        admin_profile_is_active: adminProfile?.is_active_profile,
      },
      profiles: {
        total: allProfiles.length,
        admin: !!adminProfile,
        admin_status: adminProfile?.status,
        admin_is_active: adminProfile?.is_active_profile,
        all: allProfiles.map(p => ({
          type: p.profile_type,
          status: p.status,
          is_active: p.is_active_profile,
        })),
      },
      backend: {
        functions_enabled: backendFunctionsEnabled,
        as_service_role_available: true,
      },
      diagnostics: {
        can_access_admin_dashboard: targetUser.role === 'admin' && !!adminProfile,
        needs_repair: targetUser.role !== 'admin' || !adminProfile,
        timestamp: new Date().toISOString(),
      }
    }, {
      headers: {
        ...corsHeaders,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    });

  } catch (error) {
    console.error('[adminAuthDiagnostics] ERROR:', error.message);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500, headers: corsHeaders });
  }
});