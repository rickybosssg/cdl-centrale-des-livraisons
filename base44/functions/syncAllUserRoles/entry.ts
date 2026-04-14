/**
 * syncAllUserRoles — Resynchronisation globale des rôles actifs
 *
 * Corrige tous les anciens utilisateurs dont current_role est désynchronisé
 * avec leurs UserProfile.
 *
 * Logique :
 *   1. Pour chaque utilisateur non-admin :
 *      a. Si current_role existe et correspond à un UserProfile actif → OK
 *      b. Si current_role existe mais ne correspond à aucun UserProfile → corriger
 *      c. Si current_role absent → déduire depuis is_active_profile ou premier profil actif
 *   2. Mettre à jour current_role + active_profile_type + driver_online en BDD
 *   3. Journaliser chaque correction
 *
 * Admin-only.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const dry_run = (await req.json().catch(() => ({}))).dry_run !== false; // défaut: dry_run=true pour sécurité

    console.log(`[syncAllUserRoles] START — dry_run=${dry_run}`);

    // 1. Récupérer tous les utilisateurs non-admin
    const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 1000);
    const nonAdmins = allUsers.filter(u => u.role !== 'admin');

    // 2. Récupérer tous les UserProfile en une seule requête
    const allProfiles = await base44.asServiceRole.entities.UserProfile.filter({ deleted: false });

    // Indexer par email
    const profilesByEmail = {};
    for (const p of allProfiles) {
      if (!profilesByEmail[p.user_email]) profilesByEmail[p.user_email] = [];
      profilesByEmail[p.user_email].push(p);
    }

    const corrections = [];
    const ok = [];

    for (const u of nonAdmins) {
      const userProfiles = profilesByEmail[u.email] || [];
      const currentRole = u.current_role || u.active_profile_type;

      if (userProfiles.length === 0) {
        // Pas de profil du tout — ignorer, sera géré à la prochaine connexion
        continue;
      }

      // Chercher le profil correspondant au current_role actuel
      const matchingProfile = currentRole
        ? userProfiles.find(p => p.profile_type === currentRole && !p.deleted)
        : null;

      if (matchingProfile) {
        // ✅ Cohérent — vérifier quand même driver_online
        const expectedDriverOnline = currentRole === 'livreur' ? (u.driver_online ?? false) : false;
        const needsDriverOnlineFix = currentRole !== 'livreur' && u.driver_online === true;

        if (needsDriverOnlineFix) {
          corrections.push({
            email: u.email,
            current_role: currentRole,
            fix: 'driver_online_reset',
            before: { driver_online: u.driver_online },
            after: { driver_online: false },
          });
          if (!dry_run) {
            await base44.asServiceRole.entities.User.update(u.id, { driver_online: false });
          }
        } else {
          ok.push({ email: u.email, current_role: currentRole });
        }
        continue;
      }

      // ❌ Incohérence : current_role ne correspond pas à un UserProfile valide
      // Trouver le bon profil à utiliser
      const activeProfile = userProfiles.find(p => p.is_active_profile && !p.deleted)
        || userProfiles.find(p => p.status === 'actif' && !p.deleted)
        || userProfiles[0];

      if (!activeProfile) continue;

      const correctRole = activeProfile.profile_type;
      const correction = {
        email: u.email,
        fix: 'current_role_mismatch',
        before: { current_role: currentRole, active_profile_type: u.active_profile_type, driver_online: u.driver_online },
        after: {
          current_role: correctRole,
          active_profile_type: correctRole,
          driver_online: correctRole === 'livreur' ? (u.driver_online ?? false) : false,
        },
        profile_id: activeProfile.id,
      };
      corrections.push(correction);
      console.log(`[syncAllUserRoles] CORRECTION: ${u.email} | ${currentRole || 'null'} → ${correctRole}`);

      if (!dry_run) {
        await base44.asServiceRole.entities.User.update(u.id, {
          current_role: correctRole,
          active_profile_type: correctRole,
          driver_online: correctRole === 'livreur' ? (u.driver_online ?? false) : false,
          // Réinitialiser les flags en ligne non pertinents
          client_online: correctRole === 'client',
          commercial_online: correctRole === 'commercial',
          partner_online: correctRole === 'partenaire',
        }).catch(err => console.error(`[syncAllUserRoles] Update error for ${u.email}:`, err.message));

        // Marquer le profil comme actif dans UserProfile
        await base44.asServiceRole.entities.UserProfile.update(activeProfile.id, {
          is_active_profile: true,
        }).catch(() => {});

        // Désactiver les autres profils is_active_profile
        for (const p of userProfiles) {
          if (p.id !== activeProfile.id && p.is_active_profile) {
            await base44.asServiceRole.entities.UserProfile.update(p.id, { is_active_profile: false }).catch(() => {});
          }
        }
      }
    }

    const result = {
      success: true,
      dry_run,
      total_users: nonAdmins.length,
      corrections_count: corrections.length,
      ok_count: ok.length,
      corrections: corrections.slice(0, 50), // Limiter pour la réponse
    };

    console.log(`[syncAllUserRoles] DONE — ${corrections.length} corrections (dry_run=${dry_run})`);
    return Response.json(result);

  } catch (error) {
    console.error('[syncAllUserRoles] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});