/**
 * testInviteAndLogin — Test: inviteUser → set password → login direct
 *
 * inviteUser crée le compte sans vérification email.
 * On tente ensuite de set un password et de login.
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
    const phone = body.phone || '+22670444555';
    const email = phoneToEmail(phone);
    const password = phoneToPassword(phone);
    const result = { phone, email, steps: [] };

    // STEP 1: inviteUser
    try {
      await base44.users.inviteUser(email, 'user');
      result.steps.push({ step: 'inviteUser', ok: true });
    } catch (e) {
      result.steps.push({ step: 'inviteUser', ok: false, error: e.message });
      // Si déjà existant, continuer
      if (!e.message?.toLowerCase().includes('exist')) {
        return Response.json(result);
      }
    }

    // Attendre propagation
    await new Promise(r => setTimeout(r, 3000));

    // STEP 2: Lire le user via SDK
    const users = await base44.asServiceRole.entities.User.filter({ email });
    const user = users[0] || null;
    result.steps.push({
      step: 'read_after_invite',
      found: !!user,
      id: user?.id,
      is_verified: user?.is_verified,
      fields: Object.keys(user || {}),
    });

    if (!user) return Response.json({ ...result, note: 'User non trouvé après invite' });

    // STEP 3: Tenter login direct (le compte invité n'a peut-être pas de password)
    const rLogin = await fetch(`${CDL_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const dLogin = await rLogin.json();
    result.steps.push({
      step: 'login_after_invite',
      status: rLogin.status,
      token: !!dLogin.access_token,
      msg: dLogin.error || dLogin.detail || dLogin.message || null,
    });

    if (dLogin.access_token) {
      result.success = true;
      result.token_preview = dLogin.access_token.slice(0, 30) + '...';
      return Response.json(result);
    }

    // STEP 4: Set password via reset-password puis login
    const rReset = await fetch(`${CDL_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const dReset = await rReset.json();
    result.steps.push({
      step: 'reset_password_request',
      status: rReset.status,
      ok: rReset.ok,
      msg: dReset.message || dReset.detail || dReset.error || null,
    });

    // STEP 5: Tenter register avec le même email (set password)
    const rReg = await fetch(`${CDL_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const dReg = await rReg.json();
    result.steps.push({
      step: 'register_existing_invited',
      status: rReg.status,
      token: !!dReg.access_token,
      fields: Object.keys(dReg),
      msg: dReg.message || dReg.detail || dReg.error || null,
    });

    if (dReg.access_token) {
      result.success = true;
      result.note = 'register sur user invité retourne token directement';
      result.token_preview = dReg.access_token.slice(0, 30) + '...';
      return Response.json(result);
    }

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});