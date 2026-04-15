import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Détecte et fusionne les comptes en doublons créés avec :
 * - le même email via différentes méthodes
 * - le même téléphone via différentes méthodes
 * - le même utilisateur Google
 *
 * Logs détaillés + fusion automatique safe
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();

    if (!me || me.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await req.json();
    const { action, target_email, target_phone } = body; // 'scan' | 'merge'

    console.log(`[detectAndMergeDuplicateAccounts] action=${action}`);

    if (action === 'scan') {
      // Scan pour les doublons
      const duplicates = [];

      // 1. Doublons par email
      if (target_email) {
        const users = await base44.asServiceRole.entities.User.filter({ email: target_email });
        if (users.length > 1) {
          duplicates.push({
            type: 'email',
            identifier: target_email,
            count: users.length,
            users: users.map(u => ({
              id: u.id,
              email: u.email,
              phone: u.telephone,
              role: u.role,
              created_date: u.created_date,
              last_login: u.last_login,
              method: u.created_phone_login ? 'phone' : u.google_id ? 'google' : 'email',
            })),
          });
        }
      }

      // 2. Doublons par téléphone
      if (target_phone) {
        const users = await base44.asServiceRole.entities.User.filter({ telephone: target_phone });
        if (users.length > 1) {
          duplicates.push({
            type: 'phone',
            identifier: target_phone,
            count: users.length,
            users: users.map(u => ({
              id: u.id,
              email: u.email,
              phone: u.telephone,
              role: u.role,
              created_date: u.created_date,
              last_login: u.last_login,
              method: u.created_phone_login ? 'phone' : u.google_id ? 'google' : 'email',
            })),
          });
        }
      }

      return Response.json({
        success: true,
        action: 'scan',
        duplicates,
        count: duplicates.length,
      });
    }

    if (action === 'merge') {
      const { primary_user_id, secondary_user_ids } = body;
      if (!primary_user_id || !secondary_user_ids || secondary_user_ids.length === 0) {
        return Response.json({ error: 'Missing parameters' }, { status: 400 });
      }

      const merged = [];

      for (const secondaryId of secondary_user_ids) {
        try {
          const primary = await base44.asServiceRole.entities.User.filter({ id: primary_user_id });
          const secondary = await base44.asServiceRole.entities.User.filter({ id: secondaryId });

          if (primary.length === 0 || secondary.length === 0) continue;

          const pUser = primary[0];
          const sUser = secondary[0];

          // Merge : garder les infos complètes du primary, combler les trous avec secondary
          const merged_data = {
            email: pUser.email || sUser.email,
            telephone: pUser.telephone || sUser.telephone,
            full_name: pUser.full_name || sUser.full_name,
            google_id: pUser.google_id || sUser.google_id,
            phone_verified: pUser.phone_verified || sUser.phone_verified,
            email_verified: pUser.email_verified || sUser.email_verified,
            onboarding_completed: pUser.onboarding_completed || sUser.onboarding_completed,
            role: pUser.role || sUser.role,
          };

          await base44.asServiceRole.entities.User.update(primary_user_id, merged_data);

          // Redir les profils du secondary vers le primary
          const secondaryProfiles = await base44.asServiceRole.entities.UserProfile.filter({
            user_email: sUser.email,
          });

          for (const prof of secondaryProfiles) {
            await base44.asServiceRole.entities.UserProfile.update(prof.id, {
              user_email: pUser.email,
            });
          }

          // Désactiver le compte secondary
          await base44.asServiceRole.entities.User.update(secondaryId, {
            role: 'deactivated',
          });

          merged.push({
            primary: pUser.email,
            secondary: sUser.email,
            status: 'merged',
            profiles_migrated: secondaryProfiles.length,
          });

          console.log(
            `[detectAndMergeDuplicateAccounts] Merged ${sUser.email} → ${pUser.email}`
          );
        } catch (e) {
          merged.push({
            secondary_id: secondaryId,
            status: 'error',
            error: e.message,
          });
          console.error(`[detectAndMergeDuplicateAccounts] Merge error:`, e.message);
        }
      }

      return Response.json({
        success: true,
        action: 'merge',
        merged,
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[detectAndMergeDuplicateAccounts] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});