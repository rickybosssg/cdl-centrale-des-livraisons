/**
 * testAdminCreateUser — Test: trouver comment créer un user vérifié + obtenir son token
 * via les seules APIs disponibles côté Deno
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const BASE44_APP_ID = Deno.env.get('BASE44_APP_ID');
const BASE_AUTH = `https://api.base44.app/api/apps/${BASE44_APP_ID}/auth`;

function phoneToEmail(phone) { return `phone_${phone.replace(/\+/g, '')}@cdl.phone`; }
function phoneToPassword(phone) { return `CDL_PHONE_${phone}_OTP_2025`; }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me().catch(() => null);
    if (caller?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const phone = body.phone || '+22670222999';
    const email = phoneToEmail(phone);
    const password = phoneToPassword(phone);
    const result = { phone, email, steps: [] };

    // Extraire le service token
    const authHeader = req.headers.get('authorization') || '';
    const serviceToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    result.steps.push({ step: 'service_token', preview: serviceToken?.slice(0, 20) });

    // STEP 1: Register (crée le user)
    const rReg = await fetch(`${BASE_AUTH}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const dReg = await rReg.json();
    result.steps.push({ step: 'register', status: rReg.status, fields: Object.keys(dReg) });
    if (dReg.access_token) {
      return Response.json({ ...result, success: true, note: 'Login direct depuis register' });
    }

    await new Promise(r => setTimeout(r, 1500));

    // STEP 2: Lire le user créé
    const users = await base44.asServiceRole.entities.User.filter({ email });
    const user = users[0] || null;
    result.steps.push({ step: 'find_user', found: !!user, id: user?.id, verified: user?.is_verified });
    if (!user) return Response.json(result);

    // STEP 3: Mettre is_verified = true via SDK update
    await base44.asServiceRole.entities.User.update(user.id, { is_verified: true });
    result.steps.push({ step: 'set_is_verified_true', ok: true });

    await new Promise(r => setTimeout(r, 500));

    // STEP 4: Vérifier que is_verified est bien à true
    const users2 = await base44.asServiceRole.entities.User.filter({ email });
    const user2 = users2[0] || null;
    result.steps.push({ step: 'read_after_verify', is_verified: user2?.is_verified });

    // STEP 5: Login direct maintenant que is_verified = true
    const rLogin = await fetch(`${BASE_AUTH}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const dLogin = await rLogin.json();
    result.steps.push({
      step: 'login_after_verify',
      status: rLogin.status,
      token: !!dLogin.access_token,
      msg: dLogin.error || dLogin.detail || dLogin.message || null,
    });

    if (dLogin.access_token) {
      result.success = true;
      result.token_preview = dLogin.access_token.slice(0, 30) + '...';
    }

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});