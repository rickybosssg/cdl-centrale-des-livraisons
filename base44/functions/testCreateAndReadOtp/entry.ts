/**
 * testCreateAndReadOtp — Crée un user phone via register puis lit son OTP via SDK
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
    const caller = await base44.auth.me().catch(() => null);
    if (caller?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const phone = body.phone || '+22670999111';
    const email = phoneToEmail(phone);
    const password = phoneToPassword(phone);
    const result = { phone, email, steps: [] };

    // STEP 1: Supprimer si existe
    const existing = await base44.asServiceRole.entities.User.filter({ email }).catch(() => []);
    result.steps.push({ step: 'existing', count: existing.length });

    // STEP 2: Register via auth API
    const rReg = await fetch(`${BASE_AUTH}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const dReg = await rReg.json();
    result.steps.push({
      step: 'register',
      status: rReg.status,
      token: !!dReg.access_token,
      fields: Object.keys(dReg),
      msg: dReg.message || dReg.detail || dReg.error || null,
    });

    if (dReg.access_token) {
      return Response.json({ ...result, note: 'Register retourne direct un token — email déjà vérifié ou login automatique' });
    }

    // STEP 3: Attendre propagation
    await new Promise(r => setTimeout(r, 2000));

    // STEP 4: Lire le user créé via SDK
    const newUsers = await base44.asServiceRole.entities.User.filter({ email });
    const newUser = newUsers[0] || null;
    result.steps.push({
      step: 'read_after_register',
      found: !!newUser,
      id: newUser?.id || null,
      is_verified: newUser?.is_verified || false,
      fields: Object.keys(newUser || {}),
      otp_code: newUser?.otp_code || null,
      api_key: newUser?.api_key || null,
    });

    if (!newUser) return Response.json(result);

    // STEP 5: Lire via REST direct avec service token
    const authHeader = req.headers.get('authorization') || '';
    const serviceToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const rRest = await fetch(`https://api.base44.app/api/apps/${BASE44_APP_ID}/entities/User/${newUser.id}`, {
      headers: { 'Authorization': `Bearer ${serviceToken}` },
    });
    const dRest = await rRest.json().catch(() => null);
    result.steps.push({
      step: 'rest_read_fresh_user',
      status: rRest.status,
      otp_code: dRest?.otp_code || null,
      api_key: dRest?.api_key || null,
      is_verified: dRest?.is_verified || false,
      fields: Object.keys(dRest || {}),
    });

    // STEP 6: Tester verify-otp avec l'OTP lu
    const otpToTest = dRest?.otp_code || newUser?.otp_code;
    if (otpToTest) {
      const rVerify = await fetch(`${BASE_AUTH}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp_code: otpToTest }),
      });
      const dVerify = await rVerify.json();
      result.steps.push({
        step: 'verify_otp',
        status: rVerify.status,
        token: !!dVerify.access_token,
        msg: dVerify.message || dVerify.detail || dVerify.error || null,
      });
    } else {
      result.steps.push({ step: 'no_otp_available', note: 'OTP filtré par toutes les APIs' });
    }

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});