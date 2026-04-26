/**
 * testPatchOtp — Test: patcher l'otp_code Base44 via SDK update
 *
 * Stratégie: après register, UPDATE le champ otp_code du user
 * avec une valeur connue, puis appeler verify-otp avec cette valeur.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const BASE44_APP_ID = Deno.env.get('BASE44_APP_ID');
const CDL_BASE = `https://cdl.base44.app/api/apps/${BASE44_APP_ID}`;

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
    const phone = body.phone || '+22670333111';
    const email = phoneToEmail(phone);
    const password = phoneToPassword(phone);
    const result = { phone, email, steps: [] };

    // STEP 1: Login direct (si existant et vérifié)
    const rLogin = await fetch(`${CDL_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const dLogin = await rLogin.json();
    if (dLogin.access_token) {
      return Response.json({ ...result, success: true, note: 'Login direct', token: dLogin.access_token.slice(0, 30) });
    }
    result.steps.push({ step: 'login', status: rLogin.status, msg: dLogin.error || dLogin.detail || null });

    // STEP 2: Register
    const rReg = await fetch(`${CDL_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const dReg = await rReg.json();
    result.steps.push({ step: 'register', status: rReg.status, fields: Object.keys(dReg) });
    if (dReg.access_token) {
      return Response.json({ ...result, success: true, note: 'Register direct', token: dReg.access_token.slice(0, 30) });
    }

    await new Promise(r => setTimeout(r, 1500));

    // STEP 3: Lire le user
    const users = await base44.asServiceRole.entities.User.filter({ email });
    const user = users[0] || null;
    result.steps.push({ step: 'read_user', found: !!user, id: user?.id, is_verified: user?.is_verified });
    if (!user) return Response.json(result);

    // STEP 4: Patcher otp_code via SDK update
    const knownOtp = '999888'; // OTP connu
    const futureExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    try {
      await base44.asServiceRole.entities.User.update(user.id, {
        otp_code: knownOtp,
        otp_expires_at: futureExpiry,
      });
      result.steps.push({ step: 'patch_otp', ok: true, otp: knownOtp });
    } catch (e) {
      result.steps.push({ step: 'patch_otp', ok: false, error: e.message });
    }

    // STEP 5: Vérifier que l'OTP a été patché
    await new Promise(r => setTimeout(r, 500));
    const usersAfter = await base44.asServiceRole.entities.User.filter({ email });
    const userAfter = usersAfter[0] || null;
    result.steps.push({
      step: 'read_after_patch',
      otp_code: userAfter?.otp_code || null,
      is_verified: userAfter?.is_verified,
    });

    // STEP 6: verify-otp avec l'OTP patché
    const rVerify = await fetch(`${CDL_BASE}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp_code: knownOtp }),
    });
    const dVerify = await rVerify.json();
    result.steps.push({
      step: 'verify_otp_patched',
      status: rVerify.status,
      token: !!dVerify.access_token,
      msg: dVerify.message || dVerify.detail || dVerify.error || null,
    });

    if (dVerify.access_token) {
      result.success = true;
      result.token = dVerify.access_token.slice(0, 30) + '...';
    }

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});