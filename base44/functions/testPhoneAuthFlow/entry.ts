/**
 * testPhoneAuthFlow — Test isolation de phoneAuth sans Twilio
 * Permet de tester la création de compte phone en isolation
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const BASE44_APP_ID = Deno.env.get('BASE44_APP_ID');
const BASE_AUTH = `https://api.base44.app/api/apps/${BASE44_APP_ID}/auth`;

function phoneToEmail(phone) {
  return `phone_${phone.replace(/\+/g, '')}@cdl.phone`;
}
function phoneToPassword(phone) {
  return `CDL_PHONE_${phone}_OTP_2025`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Vérifier qu'on est admin
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const phone = body.phone || '+22670999888';
    const email = phoneToEmail(phone);
    const password = phoneToPassword(phone);

    const result = { phone, email, steps: [] };

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
    const users = await base44.asServiceRole.entities.User.filter({ email }).catch(() => []);
    result.steps.push({ step: 'find_in_db', found: users.length, id: users[0]?.id || null });

    // STEP 3: inviteUser
    let inviteError = null;
    try {
      await base44.users.inviteUser(email, 'user');
      result.steps.push({ step: 'invite_user', ok: true });
    } catch (e) {
      inviteError = e.message;
      result.steps.push({ step: 'invite_user', ok: false, error: e.message });
    }

    // STEP 4: Attendre + récupérer user (délai plus long)
    await new Promise(r => setTimeout(r, 4000));
    const newUsers = await base44.asServiceRole.entities.User.filter({ email }).catch(() => []);
    // Essai 2 : list complet récent
    const allRecentUsers = await base44.asServiceRole.entities.User.list('-created_date', 5).catch(() => []);
    const byEmailFromList = allRecentUsers.find(u => u.email === email);
    const userId = newUsers[0]?.id || byEmailFromList?.id || users[0]?.id || null;
    result.steps.push({
      step: 'find_after_invite',
      found: newUsers.length,
      userId,
      recent_emails: allRecentUsers.map(u => u.email),
    });

    // STEP 5: Lire l'otp_code Base44 via API REST directe (le SDK filtre les champs système)
    if (userId) {
      try {
        // Récupérer l'user complet via API REST (service role) pour avoir l'otp_code
        // Tester les routes /auth/ disponibles
        const routesToTest = [
          ['GET', `${BASE_AUTH}/users/${userId}`],
          ['POST', `${BASE_AUTH}/verify-email`],
          ['POST', `${BASE_AUTH}/complete-registration`],
          ['POST', `${BASE_AUTH}/activate`],
          ['POST', `${BASE_AUTH}/confirm-email`],
        ];
        for (const [method, url] of routesToTest) {
          const r = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: method !== 'GET' ? JSON.stringify({ email, user_id: userId }) : undefined,
          });
          const d = await r.json().catch(() => ({}));
          result.steps.push({ step: `route_${method}_${url.split('/').pop()}`, status: r.status, token: !!d.access_token, keys: Object.keys(d).slice(0, 5) });
          if (d.access_token) {
            return Response.json({ ...result, success: true, token: d.access_token.slice(0, 20) + '...' });
          }
        }

        // Explorer base44.asServiceRole.sso
        try {
          const srClient = base44.asServiceRole;
          const sso = srClient.sso;
          const ssoMethods = sso ? Object.getOwnPropertyNames(Object.getPrototypeOf(sso)).filter(m => m !== 'constructor') : [];
          result.steps.push({ step: 'sso_methods', methods: ssoMethods });

          // Tenter sso.getToken ou sso.loginAs
          for (const method of ['getToken', 'loginAs', 'login', 'impersonate', 'generateToken']) {
            if (typeof sso?.[method] === 'function') {
              try {
                const ssoResult = await sso[method]({ user_id: userId, email });
                result.steps.push({ step: `sso_${method}`, ok: true, has_token: !!ssoResult?.access_token });
                if (ssoResult?.access_token) {
                  return Response.json({ ...result, success: true, action: `sso_${method}`, token: ssoResult.access_token.slice(0, 20) + '...' });
                }
              } catch (e3) {
                result.steps.push({ step: `sso_${method}`, error: e3.message.slice(0, 100) });
              }
            }
          }
        } catch (e2) {
          result.steps.push({ step: 'sso_explore', error: e2.message });
        }

        const apiRes = await fetch(`https://api.base44.app/api/apps/${BASE44_APP_ID}/entities/User/${userId}`, {
          headers: { 'X-Service-Role': 'true', 'X-App-Id': BASE44_APP_ID },
        });
        const userViaApi = await apiRes.json();
        result.steps.push({ step: 'read_user_api', status: apiRes.status, keys: Object.keys(userViaApi || {}), is_verified: userViaApi?.is_verified });

        // Essai via le SDK entité standard
        const usersFull = await base44.asServiceRole.entities.User.filter({ email });
        const userFull = usersFull[0];
        const otpCode = userFull?.otp_code;
        result.steps.push({ step: 'read_otp', has_otp: !!otpCode, otp_preview: otpCode ? otpCode.slice(0, 3) + '***' : null });

        if (otpCode) {
          // Vérifier l'email via l'OTP Base44 (bypass email)
          const verifyRes = await fetch(`${BASE_AUTH}/verify-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp: otpCode }),
          });
          const verifyData = await verifyRes.json();
          result.steps.push({ step: 'verify_email_otp', status: verifyRes.status, keys: Object.keys(verifyData), token: !!verifyData.access_token });

          if (verifyData.access_token) {
            return Response.json({ ...result, success: true, action: 'verify_email_otp', token: verifyData.access_token.slice(0, 20) + '...' });
          }

          // Essai avec /verify-otp
          const verifyRes2 = await fetch(`${BASE_AUTH}/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp: otpCode, code: otpCode }),
          });
          const verifyData2 = await verifyRes2.json();
          result.steps.push({ step: 'verify_otp', status: verifyRes2.status, keys: Object.keys(verifyData2), token: !!verifyData2.access_token, data: JSON.stringify(verifyData2).slice(0, 300) });

          if (verifyData2.access_token) {
            return Response.json({ ...result, success: true, action: 'verify_otp', token: verifyData2.access_token.slice(0, 20) + '...' });
          }

          // Après verify, tenter login
          const r5b = await fetch(`${BASE_AUTH}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
          const d5b = await r5b.json();
          result.steps.push({ step: 'login_after_verify', status: r5b.status, token: !!d5b.access_token, error: d5b.error || d5b.detail || null });
          if (d5b.access_token) {
            return Response.json({ ...result, success: true, action: 'login_after_verify', token: d5b.access_token.slice(0, 20) + '...' });
          }
        }
      } catch (e) {
        result.steps.push({ step: 'read_otp', error: e.message });
      }
    }

    return Response.json({ ...result, success: false });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});