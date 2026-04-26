/**
 * testPhoneAuthV2 — Test isolé du flux phoneAuth (sans Twilio)
 * Stratégie : inviteUser + register → token direct
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const BASE44_APP_ID = Deno.env.get('BASE44_APP_ID');
const BASE_AUTH = `https://api.base44.app/api/apps/${BASE44_APP_ID}/auth`;

function phoneToEmail(phone) { return `phone_${phone.replace(/\+/g, '')}@cdl.app`; }
function phoneToPassword(phone) { return `CDL_${phone.replace(/\+/g, '')}_2025!`; }

async function tryLogin(email, password) {
  const res = await fetch(`${BASE_AUTH}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const data = await res.json();
  return { token: data.access_token || null, status: res.status, msg: data.error || data.detail || data.message || null };
}

async function tryRegister(email, password, fullName) {
  const res = await fetch(`${BASE_AUTH}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, full_name: fullName }) });
  const data = await res.json();
  return { token: data.access_token || null, status: res.status, fields: Object.keys(data), msg: data.message || data.detail || data.error || null };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me().catch(() => null);
    if (caller?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const phone = body.phone || '+22670888777';
    const email = phoneToEmail(phone);
    const password = phoneToPassword(phone);
    const result = { phone, email, steps: [] };

    // STEP 1: login direct
    const l1 = await tryLogin(email, password);
    result.steps.push({ step: 'login_direct', ...l1 });
    if (l1.token) return Response.json({ ...result, success: true, action: 'login_direct' });

    // STEP 2: user en BDD ?
    const existing = await base44.asServiceRole.entities.User.filter({ email }).catch(() => []);
    result.steps.push({ step: 'find_in_db', count: existing.length, is_verified: existing[0]?.is_verified || false });

    // STEP 3: inviteUser
    try {
      await base44.users.inviteUser(email, 'user');
      result.steps.push({ step: 'inviteUser', ok: true });
    } catch (e) {
      result.steps.push({ step: 'inviteUser', ok: false, error: e.message });
    }

    await new Promise(r => setTimeout(r, 2000));

    // STEP 4: register après invite
    const r1 = await tryRegister(email, password, phone);
    result.steps.push({ step: 'register_after_invite', ...r1 });
    if (r1.token) return Response.json({ ...result, success: true, action: 'register_after_invite', token_preview: r1.token.slice(0, 20) + '...' });

    // STEP 5: login après register
    await new Promise(r => setTimeout(r, 1000));
    const l2 = await tryLogin(email, password);
    result.steps.push({ step: 'login_after_register', ...l2 });
    if (l2.token) return Response.json({ ...result, success: true, action: 'login_after_register', token_preview: l2.token.slice(0, 20) + '...' });

    return Response.json({ ...result, success: false, note: 'Aucun token obtenu' });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});