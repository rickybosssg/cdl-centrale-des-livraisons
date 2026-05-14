/**
 * repairAdminAccess — CORRECTIF GLOBAL ADMIN
 * 
 * Permet à un utilisateur de s'auto-attribuer le rôle admin SANS vérification préalable.
 * À utiliser UNIQUEMENT en cas de blocage admin (403 errors).
 * 
 * LOGS DÉTAILLÉS :
 *   [ADMIN_REPAIR_START] — Début réparation
 *   [ADMIN_REPAIR_USER_FOUND] — Utilisateur trouvé
 *   [ADMIN_REPAIR_UPDATE] — Mise à jour effectuée
 *   [ADMIN_REPAIR_VERIFY] — Vérification après mise à jour
 *   [ADMIN_REPAIR_SUCCESS] — Succès confirmé
 *   [ADMIN_REPAIR_ERROR] — Erreur critique
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
    console.log('[ADMIN_REPAIR_START] ========================================');
    console.log('[ADMIN_REPAIR_START] Timestamp:', new Date().toISOString());
    
    const base44 = createClientFromRequest(req);
    
    // Récupérer l'utilisateur connecté (même sans rôle admin)
    const user = await base44.auth.me();
    
    if (!user) {
      console.error('[ADMIN_REPAIR_ERROR] ❌ Aucun utilisateur connecté');
      return Response.json({ 
        error: 'Unauthorized — No user logged in',
        suggestion: 'Please login first at /connexion'
      }, { status: 401, headers: corsHeaders });
    }

    console.log('[ADMIN_REPAIR_USER_FOUND] ✅ User:', {
      email: user.email,
      role: user.role,
      user_type: user.user_type,
      id: user.id,
    });

    // CIBLE : le compte connecté lui-même (ou email spécifié)
    const body = await req.json().catch(() => ({}));
    const targetEmail = (body.target_email || user.email).trim().toLowerCase();

    console.log('[ADMIN_REPAIR_TARGET] Target email:', targetEmail);

    // Récupérer l'utilisateur cible depuis la BDD
    const targetUsers = await base44.asServiceRole.entities.User.filter({ email: targetEmail });
    
    if (!targetUsers || targetUsers.length === 0) {
      console.error('[ADMIN_REPAIR_ERROR] ❌ User not found in DB:', targetEmail);
      return Response.json({ 
        error: `User ${targetEmail} not found in database`,
        suggestion: 'User may not exist yet. Please complete registration first.'
      }, { status: 404, headers: corsHeaders });
    }

    const targetUser = targetUsers[0];
    console.log('[ADMIN_REPAIR_USER_DB] Found in DB:', {
      id: targetUser.id,
      email: targetUser.email,
      role: targetUser.role,
      user_type: targetUser.user_type,
      active_profile_type: targetUser.active_profile_type,
      is_admin: targetUser.is_admin,
      admin_status: targetUser.admin_status,
    });

    // DONNÉES DE MISE À JOUR COMPLÈTES
    const now = new Date().toISOString();
    const updateData = {
      role: 'admin',
      user_type: 'admin',
      active_profile_type: 'admin',
      is_admin: true,
      admin_status: 'active',
      admin_verified: true,
      admin_verified_at: now,
      statut_compte: 'actif',
      profil_valide: true,
      driver_online: false,
      livreur_bloque: false,
      livreur_suspendu: false,
      profiles_list: JSON.stringify(['admin']),
      updated_at: now,
    };

    console.log('[ADMIN_REPAIR_UPDATE_DATA] Will apply:', JSON.stringify(updateData, null, 2));

    // APPLIQUER LA MISE À JOUR
    await base44.asServiceRole.entities.User.update(targetUser.id, updateData);
    console.log('[ADMIN_REPAIR_UPDATE] ✅ User updated in DB');

    // Délai de synchronisation
    await new Promise(resolve => setTimeout(resolve, 800));

    // VÉRIFICATION IMMÉDIATE
    const verifyUsers = await base44.asServiceRole.entities.User.filter({ email: targetEmail });
    const verifyUser = verifyUsers[0];

    console.log('[ADMIN_REPAIR_VERIFY] Verification:', {
      role: verifyUser?.role,
      user_type: verifyUser?.user_type,
      active_profile_type: verifyUser?.active_profile_type,
      is_admin: verifyUser?.is_admin,
      admin_status: verifyUser?.admin_status,
    });

    // CRÉER LE PROFIL ADMIN SI INEXISTANT
    const adminProfiles = await base44.asServiceRole.entities.UserProfile.filter({
      user_email: targetEmail,
      profile_type: 'admin',
      deleted: false,
    });

    if (adminProfiles.length === 0) {
      console.log('[ADMIN_REPAIR_CREATE_PROFILE] Creating admin profile...');
      await base44.asServiceRole.entities.UserProfile.create({
        user_email: targetEmail,
        profile_type: 'admin',
        status: 'actif',
        is_active_profile: true,
        completion_percentage: 100,
        validated_at: now,
        validated_by: 'system_auto_repair',
      });
      console.log('[ADMIN_REPAIR_CREATE_PROFILE] ✅ Admin profile created');
    } else {
      // Mettre à jour le profil admin existant
      await base44.asServiceRole.entities.UserProfile.update(adminProfiles[0].id, {
        status: 'actif',
        is_active_profile: true,
        validated_at: now,
      });
      console.log('[ADMIN_REPAIR_PROFILE] ✅ Admin profile updated');
    }

    // DÉSACTIVER LES AUTRES PROFILS (optionnel)
    const otherProfiles = await base44.asServiceRole.entities.UserProfile.filter({
      user_email: targetEmail,
      profile_type: { $ne: 'admin' },
      deleted: false,
    });

    for (const profile of otherProfiles) {
      await base44.asServiceRole.entities.UserProfile.update(profile.id, {
        is_active_profile: false,
      });
      console.log('[ADMIN_REPAIR_DEACTIVATE] Deactivated profile:', profile.profile_type);
    }

    // CRÉER UNE NOTIFICATION
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: targetEmail,
      destinataire_role: 'admin',
      titre: '✅ Accès administrateur activé',
      message: 'Votre compte dispose maintenant des privilèges administrateur. Redémarrez l\'application pour appliquer les changements.',
      type: 'success',
      lue: false,
      target_screen: '/admin-pro',
    });

    // LOG ADMINISTRATIF
    await base44.asServiceRole.entities.AdminActionLog.create({
      admin_email: targetEmail,
      object_type: 'user',
      object_id: targetUser.id,
      object_name: targetEmail,
      action: 'admin_access_repair',
      reason: 'Auto-repair via repairAdminAccess function',
      target_email: targetEmail,
      details: JSON.stringify({
        previous_role: targetUser.role,
        new_role: 'admin',
        timestamp: now,
      }),
    });

    console.log('[ADMIN_REPAIR_SUCCESS] ========================================');
    console.log('[ADMIN_REPAIR_SUCCESS] ✅ Admin access repaired for:', targetEmail);
    console.log('[ADMIN_REPAIR_SUCCESS] Final state:', {
      email: verifyUser.email,
      role: verifyUser.role,
      user_type: verifyUser.user_type,
      active_profile_type: verifyUser.active_profile_type,
      is_admin: verifyUser.is_admin,
    });

    return Response.json({
      success: true,
      message: 'Admin access successfully repaired',
      user: {
        email: verifyUser.email,
        role: verifyUser.role,
        user_type: verifyUser.user_type,
        active_profile_type: verifyUser.active_profile_type,
        is_admin: verifyUser.is_admin,
        admin_status: verifyUser.admin_status,
      },
      profile: {
        type: 'admin',
        status: 'actif',
        is_active: true,
      },
      logs: {
        updated_at: now,
        verification_passed: verifyUser?.role === 'admin',
        profile_created: adminProfiles.length === 0,
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
    console.error('[ADMIN_REPAIR_ERROR] ========================================');
    console.error('[ADMIN_REPAIR_ERROR] ❌ CRITICAL ERROR:', error.message);
    console.error('[ADMIN_REPAIR_ERROR] Stack:', error.stack);
    
    return Response.json({ 
      error: error.message,
      stack: error.stack,
      suggestion: 'Check Base44 dashboard → Code → Functions → repairAdminAccess logs for details'
    }, { 
      status: 500, 
      headers: corsHeaders 
    });
  }
});