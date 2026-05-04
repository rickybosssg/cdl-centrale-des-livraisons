import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const t0 = Date.now();
  const base44 = createClientFromRequest(req);

  let user = null;
  try { user = await base44.auth.me(); } catch (e) {
    return Response.json({ error: 'Non authentifié' }, { status: 401 });
  }
  if (!user) return Response.json({ error: 'Non authentifié' }, { status: 401 });

  const isAdmin = user.role === 'admin';
  const body = await req.json().catch(() => ({}));
  const targetEmail = isAdmin ? (body.target_email || null) : user.email;

  let adminUsers = [];
  if (isAdmin && !targetEmail) {
    adminUsers = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
  } else {
    adminUsers = [{ email: targetEmail || user.email, role: user.role, full_name: user.full_name }];
  }

  const results = await Promise.all(adminUsers.map(async (admin) => {
    try {
      const allTokens = await base44.asServiceRole.entities.FcmToken.filter({ user_email: admin.email });
      const activeTokens = allTokens.filter(t => t.is_active === true);
      const androidTokens = activeTokens.filter(t => t.device_type === 'android_native');
      const webTokens = activeTokens.filter(t => t.device_type === 'web');
      const latestToken = [...activeTokens].sort((a, b) =>
        new Date(b.last_used || b.registered_at || 0) - new Date(a.last_used || a.registered_at || 0)
      )[0] || null;

      let status = 'ok';
      let issue = null;
      if (allTokens.length === 0) {
        status = 'no_token';
        issue = 'Aucun token FCM en BDD — l\'appareil n\'a jamais enregistré son token';
      } else if (activeTokens.length === 0) {
        status = 'token_inactive';
        issue = `${allTokens.length} token(s) en BDD mais tous inactifs`;
      }

      console.log(`[ADMIN_FCM_STATUS] email=${admin.email} | status=${status} | active=${activeTokens.length} | android=${androidTokens.length} | web=${webTokens.length} | latest=${latestToken?.token?.slice(0, 20) || 'NONE'}... | last_used=${latestToken?.last_used || 'NEVER'}`);

      return {
        email: admin.email,
        full_name: admin.full_name || admin.email,
        role: admin.role,
        status,
        issue,
        tokens_total: allTokens.length,
        tokens_active: activeTokens.length,
        tokens_android: androidTokens.length,
        tokens_web: webTokens.length,
        latest_token_prefix: latestToken?.token?.slice(0, 30) || null,
        latest_token_device: latestToken?.device_type || null,
        latest_token_last_used: latestToken?.last_used || null,
        latest_token_registered_at: latestToken?.registered_at || null,
        latest_token_id: latestToken?.id || null,
        can_receive_push: activeTokens.length > 0,
      };
    } catch (e) {
      return { email: admin.email, status: 'error', issue: e.message, can_receive_push: false };
    }
  }));

  const withToken = results.filter(r => r.can_receive_push).length;
  const withoutToken = results.filter(r => !r.can_receive_push);
  const overallOk = withToken > 0;

  if (!overallOk) {
    console.error(`[ADMIN_FCM_STATUS] AUCUN ADMIN N'A DE TOKEN FCM ACTIF | admins=${results.length} | issues=${withoutToken.map(a => `${a.email}:${a.status}`).join(',')}`);
  }

  return Response.json({
    ok: overallOk,
    checked_at: new Date().toISOString(),
    admins_count: results.length,
    admins_with_token: withToken,
    admins_without_token: withoutToken.length,
    details: results,
    summary: overallOk
      ? `${withToken}/${results.length} admin(s) peuvent recevoir des push`
      : `Aucun admin ne peut recevoir de push`,
    delay_ms: Date.now() - t0,
  });
});