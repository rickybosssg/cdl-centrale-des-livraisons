/**
 * testPhoneAuthFlow — Test isolation de phoneAuth sans Twilio
 * Stratégie :
 * 1. /auth/register → crée user + génère otp_code
 * 2. Lire otp_code via API REST Base44 (service role) — le SDK filtre ce champ
 * 3. POST /auth/verify-otp → active le compte
 * 4. Login avec email+password
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const BASE44_APP_ID = Deno.env.get('BASE44_APP_ID');
const BASE_AUTH = `https://api.base44.app/api/apps/${BASE44_APP_ID}/auth`;
const BASE_AUTH_CDL = `https://cdl.base44.app/api/apps/${BASE44_APP_ID}/auth`;
const BASE_ENTITIES = `https://api.base44.app/api/apps/${BASE44_APP_ID}/entities`;

function phoneToEmail(phone) {
  return `phone_${phone.replace(/\+/g, '')}@cdl.phone`;
}
function phoneToPassword(phone) {
  return `CDL_PHONE_${phone}_OTP_2025`;
}

// Lire l'otp_code via REST direct en testant plusieurs méthodes d'auth
async function readOtpCode(userId, userApiKey, serviceToken) {
  // Méthode 1 : API Key du user (X-API-Key header)
  const methods = [
    { 'X-API-Key': userApiKey },
    { 'Authorization': `Api-Key ${userApiKey}` },
    { 'Authorization': `Bearer ${serviceToken}` },
  ];
  for (const headers of methods) {
    const res = await fetch(`${BASE_ENTITIES}/User/${userId}`, { headers });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data?.otp_code) return { otp: data.otp_code, method: JSON.stringify(Object.keys(headers)) };
    }
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const phone = body.phone || '+22670999888';
    const email = phoneToEmail(phone);
    const password = phoneToPassword(phone);

    const result = { phone, email, steps: [] };

    // Extraire le token de la requête entrante (service role injecté par Base44)
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const serviceToken = authHeader.replace('Bearer ', '').trim();
    result.steps.push({ step: 'service_token', has_token: !!serviceToken, token_preview: serviceToken ? serviceToken.slice(0, 15) + '...' : null });

    // TEST BACKOFFICE: tester différents endpoints pour lire otp_code
    if (body.test_backoffice) {
      const testUserId = body.userId;
      const testEmail = body.test_email;
      const BASE_API = `https://api.base44.app/api/apps/${BASE44_APP_ID}`;
      const endpoints = [
        `${BASE_API}/entities/User/${testUserId}?include_system=true`,
        `${BASE_API}/entities/User/${testUserId}?fields=otp_code,email,is_verified`,
        `${BASE_API}/auth/users/${testUserId}`,
        `${BASE_API}/auth/user?email=${encodeURIComponent(testEmail)}`,
        `https://api.base44.app/api/admin/apps/${BASE44_APP_ID}/users/${testUserId}`,
      ];
      for (const url of endpoints) {
        const r = await fetch(url, { headers: { 'Authorization': `Bearer ${serviceToken}` } });
        const d = await r.json().catch(() => null);
        result.steps.push({ step: `GET_${url.split(BASE44_APP_ID)[1].split('?')[0]}`, status: r.status, otp_code: d?.otp_code || null, has_token: !!d?.access_token, fields: Object.keys(d || {}).slice(0, 10) });
      }
      return Response.json(result);
    }

    // TEST INVITE: tester inviteUser → login via api_key comme Bearer
    if (body.test_invite) {
      const testEmail = `phone_test_invite_${Date.now()}@cdl.phone`;
      result.steps.push({ step: 'test_email', email: testEmail });

      // Créer via inviteUser
      await base44.users.inviteUser(testEmail, 'user');
      result.steps.push({ step: 'inviteUser', ok: true });

      // Attendre propagation
      await new Promise(r => setTimeout(r, 2000));

      // Lire l'utilisateur créé (api_key visible via SDK service role ?)
      const newUsers = await base44.asServiceRole.entities.User.filter({ email: testEmail });
      const newUser = newUsers[0] || null;
      result.steps.push({
        step: 'read_invited_user',
        found: !!newUser,
        fields: Object.keys(newUser || {}),
        api_key: newUser?.api_key || null,
        otp_code: newUser?.otp_code || null,
        is_verified: newUser?.is_verified || false,
      });

      // Tenter login via api_key comme Bearer token
      if (newUser?.api_key) {
        const r = await fetch(`${BASE_AUTH}/me`, {
          headers: { 'Authorization': `Bearer ${newUser.api_key}` },
        });
        const d = await r.json().catch(() => null);
        result.steps.push({ step: 'login_via_api_key', status: r.status, data: d });
      }

      return Response.json(result);
    }

    // TEST DIRECT: si otp_override + skip_admin_login → tester uniquement verify-otp
    if (body.otp_override && body.skip_admin_login) {
      const r = await fetch(`${BASE_AUTH}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: phoneToEmail(phone), otp_code: body.otp_override }),
      });
      const d = await r.json().catch(() => ({}));
      const step = { step: 'direct_verify_otp', status: r.status, token: !!d.access_token, msg: d.message || d.detail || d.error || '' };
      result.steps.push(step);
      if (d.access_token) {
        return Response.json({ ...result, success: true, token: d.access_token.slice(0, 20) + '...' });
      }
      return Response.json({ ...result, success: false });
    }

    // STEP 1: Login direct
    const r1 = await fetch(`${BASE_AUTH}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const d1 = await r1.json();
    result.steps.push({ step: 'login_direct', status: r1.status, token: !!d1.access_token, error: d1.error || d1.detail || null });

    if (d1.access_token) {
      return Response.json({ ...result, success: true, action: 'existing_user', token: d1.access_token.slice(0, 20) + '...' });
    }

    // STEP 2: Chercher en BDD
    const existingUsers = await base44.asServiceRole.entities.User.filter({ email }).catch(() => []);
    let userId = existingUsers[0]?.id || null;
    result.steps.push({ step: 'find_in_db', found: existingUsers.length, id: userId });

    // STEP 3: Créer via /auth/register si nécessaire
    if (!userId) {
      const rReg = await fetch(`${BASE_AUTH}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const dReg = await rReg.json();
      result.steps.push({ step: 'register', status: rReg.status, token: !!dReg.access_token, msg: dReg.message || dReg.detail || dReg.error || null });

      if (dReg.access_token) {
        return Response.json({ ...result, success: true, action: 'register_direct', token: dReg.access_token.slice(0, 20) + '...' });
      }

      // Attendre propagation BDD
      await new Promise(r => setTimeout(r, 2000));
      const newUsers = await base44.asServiceRole.entities.User.filter({ email }).catch(() => []);
      userId = newUsers[0]?.id || null;
      result.steps.push({ step: 'find_after_register', userId, found: newUsers.length });
    }

    if (!userId) {
      return Response.json({ ...result, success: false, error: 'User introuvable après register' });
    }

    // STEP 4 : Lire otp_code via API REST directe (service token en Bearer)
    const restRes = await fetch(`${BASE_ENTITIES}/User/${userId}`, {
      headers: { 'Authorization': `Bearer ${serviceToken}` },
    });
    const restData = await restRes.json().catch(() => null);
    const otpCode = restData?.otp_code || null;
    const isVerified = restData?.is_verified || false;
    result.steps.push({
      step: 'rest_read_user',
      status: restRes.status,
      otp_code: otpCode,
      is_verified: isVerified,
      fields: Object.keys(restData || {}),
    });

    // Si déjà vérifié → login direct
    if (isVerified) {
      const rLogin = await fetch(`${BASE_AUTH}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const dLogin = await rLogin.json();
      if (dLogin.access_token) {
        return Response.json({ ...result, success: true, action: 'login_already_verified', token: dLogin.access_token.slice(0, 20) + '...' });
      }
    }

    // STEP 5 : Tenter admin-login avec le service token
    const adminAttempts = [
      { url: `${BASE_AUTH}/admin-login`, body: { user_id: userId } },
      { url: `${BASE_AUTH}/admin-login`, body: { email } },
      { url: `${BASE_AUTH}/impersonate`, body: { user_id: userId } },
      { url: `${BASE_AUTH_CDL}/admin-login`, body: { user_id: userId } },
      { url: `${BASE_AUTH_CDL}/impersonate`, body: { user_id: userId } },
    ];

    for (const attempt of adminAttempts) {
      const r = await fetch(attempt.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceToken}` },
        body: JSON.stringify(attempt.body),
      });
      const d = await r.json().catch(() => ({}));
      const label = `admin-login:${attempt.url.split('/auth/')[1]}(${Object.keys(attempt.body)[0]})`;
      result.steps.push({ step: label, status: r.status, token: !!d.access_token, msg: (d.message || d.detail || d.error || '').slice(0, 150) });
      if (d.access_token) {
        return Response.json({ ...result, success: true, action: label, token: d.access_token.slice(0, 20) + '...' });
      }
    }

    // STEP 6 : verify-otp si otp_code disponible
    if (otpCode) {
      const r = await fetch(`${BASE_AUTH}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp_code: otpCode }),
      });
      const d = await r.json().catch(() => ({}));
      result.steps.push({ step: 'verify-otp', status: r.status, token: !!d.access_token, msg: (d.message || d.detail || d.error || '').slice(0, 150) });
      if (d.access_token) {
        return Response.json({ ...result, success: true, action: 'verify-otp', token: d.access_token.slice(0, 20) + '...' });
      }
    }

    return Response.json({ ...result, success: false, note: 'Toutes les méthodes échouées' });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});