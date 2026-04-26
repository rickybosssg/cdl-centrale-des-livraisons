/**
 * testApiKey — Teste si api_key user est lisible via SDK et utilisable comme Bearer
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const BASE44_APP_ID = Deno.env.get('BASE44_APP_ID');
const BASE_AUTH = `https://api.base44.app/api/apps/${BASE44_APP_ID}/auth`;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const targetEmail = body.email || 'phone_22670555333@cdl.phone';
    const result = { email: targetEmail, steps: [] };

    // ÉTAPE 1 : Lire le user via SDK asServiceRole — est-ce que api_key est inclus ?
    const users = await base44.asServiceRole.entities.User.filter({ email: targetEmail });
    const targetUser = users[0] || null;

    result.steps.push({
      step: 'sdk_read_user',
      found: !!targetUser,
      fields: Object.keys(targetUser || {}),
      api_key: targetUser?.api_key || null,
      is_verified: targetUser?.is_verified || false,
      id: targetUser?.id || null,
    });

    // ÉTAPE 0 : Tester avec api_key hardcodé connu (phone_22670998877)
    // Tester avec le user VÉRIFIÉ (phone_22670555333) — api_key: 1f6e00353c3d4521afdef8323ced3e49
    const verifiedApiKey = '1f6e00353c3d4521afdef8323ced3e49';
    const unverifiedApiKey = 'fa6a0a70fa5d4e1e82ccc628fb9f52bb'; // phone_22670998877, otp=627222
    const unverifiedEmail = 'phone_22670998877@cdl.phone';
    const unverifiedOtp = '627222';

    // Test 1: api_key du user vérifié comme Bearer sur cdl.base44.app
    const rA = await fetch(`https://cdl.base44.app/api/apps/${BASE44_APP_ID}/auth/me`, {
      headers: { 'Authorization': `Bearer ${verifiedApiKey}` },
    });
    const dA = await rA.json().catch(() => null);
    result.steps.push({ step: 'verified_api_key_as_bearer', status: rA.status, ok: rA.ok, data: dA });

    // Test 2: verify-otp pour activer le compte non vérifié
    const rB = await fetch(`https://cdl.base44.app/api/apps/${BASE44_APP_ID}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: unverifiedEmail, otp_code: unverifiedOtp }),
    });
    const dB = await rB.json().catch(() => null);
    result.steps.push({ step: 'verify_otp_unverified', status: rB.status, ok: rB.ok, token: !!dB?.access_token, data: dB });

    // Test 3: Si verify-otp OK → tenter api_key comme Bearer
    if (dB?.access_token) {
      const rC = await fetch(`https://cdl.base44.app/api/apps/${BASE44_APP_ID}/auth/me`, {
        headers: { 'Authorization': `Bearer ${unverifiedApiKey}` },
      });
      const dC = await rC.json().catch(() => null);
      result.steps.push({ step: 'api_key_after_verify', status: rC.status, ok: rC.ok, data: dC });
    }

    return Response.json(result);

    // ÉTAPE 1b : Lire via REST direct avec service token (api_key peut y être)
    const authHeader = req.headers.get('authorization') || '';
    const serviceToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const userId = targetUser?.id;

    if (userId && serviceToken) {
      const rRest = await fetch(`https://api.base44.app/api/apps/${BASE44_APP_ID}/entities/User/${userId}`, {
        headers: { 'Authorization': `Bearer ${serviceToken}` },
      });
      const dRest = await rRest.json().catch(() => null);
      result.steps.push({
        step: 'rest_read_user_direct',
        status: rRest.status,
        fields: Object.keys(dRest || {}),
        api_key: dRest?.api_key || null,
        otp_code: dRest?.otp_code || null,
      });
      if (dRest?.api_key) {
        result.api_key_found_via_rest = true;
        // Continuer avec cet api_key
        const apiKey = dRest.api_key;
        const r1 = await fetch(`https://api.base44.app/api/apps/${BASE44_APP_ID}/auth/me`, {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        const d1 = await r1.json().catch(() => null);
        result.steps.push({ step: 'api_key_bearer_test', status: r1.status, email: d1?.email, ok: r1.ok, fields: Object.keys(d1 || {}) });
        return Response.json(result);
      }
    }

    if (!targetUser?.api_key) {
      return Response.json({ ...result, note: 'api_key non visible via SDK ni REST' });
    }

    const apiKey = targetUser.api_key;

    // ÉTAPE 2 : Utiliser api_key comme Bearer token
    const r1 = await fetch(`${BASE_AUTH}/me`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    const d1 = await r1.json().catch(() => null);
    result.steps.push({
      step: 'api_key_as_bearer_on_me',
      status: r1.status,
      email: d1?.email || null,
      id: d1?.id || null,
      ok: r1.ok,
    });

    // ÉTAPE 3 : Utiliser api_key comme X-API-Key header
    const r2 = await fetch(`${BASE_AUTH}/me`, {
      headers: { 'X-API-Key': apiKey },
    });
    const d2 = await r2.json().catch(() => null);
    result.steps.push({
      step: 'api_key_as_x_api_key',
      status: r2.status,
      email: d2?.email || null,
      ok: r2.ok,
    });

    // ÉTAPE 4 : Échanger api_key contre un access_token via /auth/token
    const endpoints = [
      `${BASE_AUTH}/token`,
      `${BASE_AUTH}/api-key-login`,
      `https://api.base44.app/api/apps/${BASE44_APP_ID}/auth/token`,
    ];
    for (const url of endpoints) {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
      });
      const d = await r.json().catch(() => null);
      result.steps.push({
        step: `post_api_key_to_${url.split('/auth/')[1]}`,
        status: r.status,
        access_token: d?.access_token ? d.access_token.slice(0, 20) + '...' : null,
        fields: Object.keys(d || {}),
      });
    }

    // ÉTAPE 5 : Si le Bearer api_key fonctionne → c'est notre token direct !
    if (r1.ok && d1?.email) {
      result.success = true;
      result.note = 'api_key fonctionne directement comme Bearer token !';
    }

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});