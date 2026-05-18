/**
 * fcmAudit — Audit complet des tokens FCM par utilisateur
 *
 * Retourne pour chaque user :
 * - email, rôle, profils actifs
 * - token présent/absent, actif/inactif
 * - last_seen, device_id, platform, date création
 * - doublons éventuels
 * - cause probable si absent
 *
 * Admin uniquement.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

function tokenAge(t) {
  const ref = t.last_used || t.registered_at;
  if (!ref) return null;
  return Math.round((Date.now() - new Date(ref).getTime()) / (1000 * 3600));
}

function diagnoseMissingToken(userTokens, userProfiles) {
  if (!userTokens || userTokens.length === 0) {
    // Jamais de token enregistré
    const hasProfile = userProfiles && userProfiles.length > 0;
    if (!hasProfile) return 'user_never_logged_in_or_no_profile';
    return 'app_never_opened_or_permission_denied';
  }
  const allInactive = userTokens.every(t => !t.is_active);
  if (allInactive) {
    const newest = userTokens.reduce((a, b) => {
      const da = new Date(a.last_used || a.registered_at || 0).getTime();
      const db = new Date(b.last_used || b.registered_at || 0).getTime();
      return db > da ? b : a;
    }, userTokens[0]);
    const age = tokenAge(newest);
    if (age !== null && age > 24 * 30) return 'token_expired_over_30_days';
    if (age !== null && age > 24 * 7) return 'token_inactive_over_7_days';
    return 'token_deactivated_recently';
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin requis' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { limit = 100 } = body;

    console.log(`[FCM_AUDIT_START] admin=${user.email} | ts=${new Date().toISOString()}`);

    // Charger tous les tokens
    const allTokens = await base44.asServiceRole.entities.FcmToken.list('-registered_at', 2000);
    // Charger tous les profils actifs (pour identifier les users)
    const allProfiles = await base44.asServiceRole.entities.UserProfile.filter({ deleted: false }, null, 2000);

    // Index tokens par user_email
    const tokensByUser = {};
    for (const t of allTokens) {
      if (!tokensByUser[t.user_email]) tokensByUser[t.user_email] = [];
      tokensByUser[t.user_email].push(t);
    }

    // Index profils par user_email
    const profilesByUser = {};
    for (const p of allProfiles) {
      if (!profilesByUser[p.user_email]) profilesByUser[p.user_email] = [];
      profilesByUser[p.user_email].push(p);
    }

    // Tous les emails connus (union tokens + profils)
    const allEmails = new Set([
      ...Object.keys(tokensByUser),
      ...Object.keys(profilesByUser),
    ]);

    const rows = [];

    for (const email of allEmails) {
      const userTokens = tokensByUser[email] || [];
      const userProfiles = profilesByUser[email] || [];

      const activeTokens = userTokens.filter(t => t.is_active);
      const inactiveTokens = userTokens.filter(t => !t.is_active);

      // Doublons : tokens exacts identiques
      const tokenValues = userTokens.map(t => t.token).filter(Boolean);
      const uniqueValues = new Set(tokenValues);
      const duplicateCount = tokenValues.length - uniqueValues.size;

      // Token le plus récent
      const latestToken = userTokens.sort((a, b) => {
        const da = new Date(a.last_used || a.registered_at || 0).getTime();
        const db = new Date(b.last_used || b.registered_at || 0).getTime();
        return db - da;
      })[0] || null;

      // Profil actif
      const activeProfile = userProfiles.find(p => p.is_active_profile && p.status === 'actif') || userProfiles[0] || null;

      const status = activeTokens.length > 0 ? 'ok' : userTokens.length > 0 ? 'inactive' : 'missing';
      const diagCause = status !== 'ok' ? diagnoseMissingToken(userTokens, userProfiles) : null;

      rows.push({
        email,
        role: activeProfile?.profile_type || null,
        profiles: userProfiles.map(p => ({ type: p.profile_type, status: p.status })),
        status, // 'ok' | 'inactive' | 'missing'
        token_count: userTokens.length,
        active_count: activeTokens.length,
        inactive_count: inactiveTokens.length,
        duplicate_count: duplicateCount,
        last_seen: latestToken ? (latestToken.last_used || latestToken.registered_at || null) : null,
        last_device_id: latestToken?.device_id || null,
        last_platform: latestToken?.platform || latestToken?.device_type || null,
        last_registered_at: latestToken?.registered_at || null,
        token_preview: latestToken ? latestToken.token.slice(0, 40) + '...' : null,
        diag_cause: diagCause,
        tokens: userTokens.map(t => ({
          id: t.id,
          token_preview: t.token?.slice(0, 40) + '...',
          is_active: t.is_active,
          device_type: t.device_type,
          platform: t.platform,
          device_id: t.device_id,
          registered_at: t.registered_at,
          last_used: t.last_used,
          age_hours: tokenAge(t),
        })),
      });
    }

    // Trier : missing first, puis inactive, puis ok
    const order = { missing: 0, inactive: 1, ok: 2 };
    rows.sort((a, b) => order[a.status] - order[b.status]);

    const summary = {
      total_users: rows.length,
      users_with_active_token: rows.filter(r => r.status === 'ok').length,
      users_with_inactive_token: rows.filter(r => r.status === 'inactive').length,
      users_without_token: rows.filter(r => r.status === 'missing').length,
      total_tokens: allTokens.length,
      total_active_tokens: allTokens.filter(t => t.is_active).length,
      total_inactive_tokens: allTokens.filter(t => !t.is_active).length,
      total_duplicates: rows.reduce((acc, r) => acc + r.duplicate_count, 0),
      generated_at: new Date().toISOString(),
    };

    console.log(`[FCM_AUDIT_DONE] ${JSON.stringify(summary)}`);

    return Response.json({ success: true, summary, rows: rows.slice(0, limit) });

  } catch (err) {
    console.error('[FCM_AUDIT_ERROR]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});