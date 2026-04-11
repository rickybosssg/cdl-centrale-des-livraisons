/**
 * CDL — Synchronisation globale des rôles utilisateurs
 * Source de vérité : UserProfile (profile_type)
 * Corrige user_type + onboarding_completed sur tous les comptes incohérents
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Priorité des rôles si plusieurs profils existent
const ROLE_PRIORITY = ['admin', 'partenaire', 'commercial', 'livreur', 'client'];

function pickPrimaryRole(profileTypes) {
  for (const r of ROLE_PRIORITY) {
    if (profileTypes.includes(r)) return r;
  }
  return profileTypes[0] || null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    console.log('[syncUserRoles] ▶ Démarrage scan global des rôles...');

    // Charger toutes les données en parallèle
    const [allUsers, allProfiles] = await Promise.all([
      base44.asServiceRole.entities.User.list('-created_date', 1000),
      base44.asServiceRole.entities.UserProfile.filter({ deleted: false }),
    ]);

    console.log(`[syncUserRoles] ${allUsers.length} utilisateurs, ${allProfiles.length} profils`);

    // Indexer les profils par email
    const profilesByEmail = {};
    for (const p of allProfiles) {
      if (!p.user_email) continue;
      if (!profilesByEmail[p.user_email]) profilesByEmail[p.user_email] = [];
      profilesByEmail[p.user_email].push(p);
    }

    const results = { fixed: 0, alreadyOk: 0, noProfile: 0, errors: 0 };
    const fixedUsers = [];

    for (const u of allUsers) {
      try {
        const userProfiles = profilesByEmail[u.email] || [];
        const profileTypes = userProfiles.map(p => p.profile_type).filter(Boolean);

        if (profileTypes.length === 0) {
          // Vrai sans profil
          results.noProfile++;
          console.log(`[syncUserRoles] ➖ Sans profil : ${u.email}`);
          continue;
        }

        const primaryRole = pickPrimaryRole(profileTypes);
        const needsFix = u.user_type !== primaryRole || !u.onboarding_completed;

        if (!needsFix) {
          results.alreadyOk++;
          continue;
        }

        console.log(`[syncUserRoles] 🔧 Réparation ${u.email} : user_type=${u.user_type || 'null'} → ${primaryRole} (profils: [${profileTypes.join(', ')}])`);

        await base44.asServiceRole.entities.User.update(u.id, {
          user_type: primaryRole,
          onboarding_completed: true,
        });

        // Log de réparation
        try {
          await base44.asServiceRole.entities.RepairLog.create({
            user_id: u.id,
            user_email: u.email,
            user_type: primaryRole,
            correction: 'sync_roles_global',
            detail: `Réparation automatique : user_type=${u.user_type || 'null'} → ${primaryRole}. Profils détectés: [${profileTypes.join(', ')}]`,
            contexte: 'syncUserRoles',
          });
        } catch (_) {}

        results.fixed++;
        fixedUsers.push({ email: u.email, oldRole: u.user_type, newRole: primaryRole, profiles: profileTypes });
      } catch (err) {
        console.error(`[syncUserRoles] ❌ Erreur pour ${u.email}:`, err.message);
        results.errors++;
      }
    }

    console.log(`[syncUserRoles] ✅ Terminé — Réparés: ${results.fixed}, OK: ${results.alreadyOk}, Sans profil: ${results.noProfile}, Erreurs: ${results.errors}`);

    return Response.json({
      success: true,
      results,
      fixedUsers,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[syncUserRoles] Erreur globale:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});