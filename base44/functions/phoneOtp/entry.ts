/**
 * phoneOtp — AUTH PAR TÉLÉPHONE (OTP Twilio)
 *
 * Stratégie définitive (otp_code inaccessible via API) :
 *
 * SEND   : envoie OTP SMS via Twilio Verify
 * VERIFY : après OTP Twilio validé →
 *   1. Login direct (si compte déjà vérifié)
 *   2. Si non vérifié : inviteUser (service role) → crée compte sans email verify
 *   3. Obtenir token via /auth/admin-login (service role Bearer)
 *
 * Remarque : inviteUser crée le compte avec role=user, sans vérification email.
 * L'email est opaque (phone_XXXX@cdl.phone), jamais affiché à l'utilisateur.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN');
const TWILIO_VERIFY_SID  = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');
const BASE44_APP_ID      = Deno.env.get('BASE44_APP_ID');

const BASE_AUTH = `https://api.base44.app/api/apps/${BASE44_APP_ID}/auth`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function normalizePhone(raw) {
  if (!raw) return null;
  let n = String(raw).replace(/\s+/g, '').replace(/-/g, '');
  if (n.startsWith('+')) return n;
  if (n.startsWith('00226')) return '+' + n.slice(2);
  if (n.startsWith('226') && n.length === 11) return '+' + n;
  if (/^\d{8}$/.test(n)) return '+226' + n;
  if (/^\d{7,10}$/.test(n)) return '+226' + n;
  return null;
}

function phoneToEmail(phone) {
  return `phone_${phone.replace(/\+/g, '')}@cdl.phone`;
}

function phoneToPassword(phone) {
  return `CDL_PHONE_${phone}_OTP_2025`;
}

// ── Twilio : envoyer OTP ────────────────────────────────────────────────────
async function twilioSendOtp(phone) {
  const creds = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SID}/Verifications`,
    {
      method: 'POST',
      headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: phone, Channel: 'sms' }).toString(),
    }
  );
  const data = await res.json();
  console.log('[phoneOtp] Twilio send:', res.status, data?.status);
  if (!res.ok) throw new Error(data?.message || `Twilio error ${res.status}`);
  return data;
}

// ── Twilio : vérifier OTP ───────────────────────────────────────────────────
async function twilioVerifyOtp(phone, code) {
  const creds = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SID}/VerificationCheck`,
    {
      method: 'POST',
      headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: phone, Code: code }).toString(),
    }
  );
  const data = await res.json();
  console.log('[phoneOtp] Twilio verify:', res.status, data?.status);
  if (!res.ok) throw new Error(data?.message || `Twilio verify error ${res.status}`);
  return data?.status === 'approved';
}

// ── Login direct (compte déjà vérifié) ──────────────────────────────────────
async function tryLogin(email, password) {
  const res = await fetch(`${BASE_AUTH}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  console.log('[phoneOtp] tryLogin:', res.status, '| token:', !!data.access_token);
  return data.access_token || null;
}

// ── Admin login via service role token ──────────────────────────────────────
async function tryAdminLogin(userId, email, serviceToken) {
  if (!serviceToken) return null;

  // Essai 1 : admin-login par user_id
  const r1 = await fetch(`${BASE_AUTH}/admin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceToken}` },
    body: JSON.stringify({ user_id: userId }),
  });
  const d1 = await r1.json();
  console.log('[phoneOtp] admin-login(user_id):', r1.status, '| token:', !!d1.access_token);
  if (d1.access_token) return d1.access_token;

  // Essai 2 : admin-login par email
  const r2 = await fetch(`${BASE_AUTH}/admin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceToken}` },
    body: JSON.stringify({ email }),
  });
  const d2 = await r2.json();
  console.log('[phoneOtp] admin-login(email):', r2.status, '| token:', !!d2.access_token);
  if (d2.access_token) return d2.access_token;

  // Essai 3 : impersonate
  const r3 = await fetch(`${BASE_AUTH}/impersonate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceToken}` },
    body: JSON.stringify({ user_id: userId }),
  });
  const d3 = await r3.json();
  console.log('[phoneOtp] impersonate:', r3.status, '| token:', !!d3.access_token);
  if (d3.access_token) return d3.access_token;

  return null;
}

// ── Flux auth principal (après OTP Twilio validé) ───────────────────────────
async function phoneAuth(req, phone) {
  const email    = phoneToEmail(phone);
  const password = phoneToPassword(phone);
  const base44   = createClientFromRequest(req);

  // Extraire le service token depuis la requête (injecté par Base44 en service role)
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const serviceToken = authHeader.replace(/^Bearer\s+/i, '').trim() || null;

  console.log('[phoneOtp] phoneAuth | phone:', phone, '| serviceToken:', !!serviceToken);

  // ÉTAPE 1 : Login direct (compte existant et déjà vérifié)
  const token1 = await tryLogin(email, password);
  if (token1) {
    console.log('[phoneOtp] ✅ Login direct OK');
    try {
      const c = createClientFromRequest({ headers: { authorization: `Bearer ${token1}` } });
      const me = await c.auth.me();
      if (!me.telephone) await c.auth.updateMe({ telephone: phone });
    } catch (_) {}
    return { access_token: token1, is_new_user: false };
  }

  // ÉTAPE 2 : Chercher si user existe en BDD
  let userId = null;
  let isNewUser = true;
  try {
    const existing = await base44.asServiceRole.entities.User.filter({ email });
    if (existing.length > 0) {
      userId = existing[0].id;
      isNewUser = false;
      console.log('[phoneOtp] User existant id:', userId);
    }
  } catch (e) {
    console.warn('[phoneOtp] Recherche BDD:', e.message);
  }

  // ÉTAPE 3 : Si user existant non vérifié → tenter admin-login
  if (userId && !isNewUser) {
    const adminTok = await tryAdminLogin(userId, email, serviceToken);
    if (adminTok) {
      console.log('[phoneOtp] ✅ Admin-login OK (user existant non vérifié)');
      try {
        const c = createClientFromRequest({ headers: { authorization: `Bearer ${adminTok}` } });
        const me = await c.auth.me();
        if (!me.telephone) await c.auth.updateMe({ telephone: phone });
      } catch (_) {}
      return { access_token: adminTok, is_new_user: false };
    }
  }

  // ÉTAPE 4 : Créer via inviteUser (sans vérification email)
  if (!userId) {
    console.log('[phoneOtp] Création via inviteUser...');
    try {
      await base44.users.inviteUser(email, 'user');
      console.log('[phoneOtp] inviteUser OK');
      await new Promise(r => setTimeout(r, 2000));

      const newUsers = await base44.asServiceRole.entities.User.filter({ email });
      if (newUsers.length > 0) {
        userId = newUsers[0].id;
        isNewUser = true;
        console.log('[phoneOtp] User créé id:', userId);
      }
    } catch (e) {
      const msg = e.message || '';
      // Si user déjà existant (doublon race)
      if (msg.toLowerCase().includes('exist') || msg.toLowerCase().includes('already')) {
        console.warn('[phoneOtp] inviteUser: user déjà existant');
        const retry = await base44.asServiceRole.entities.User.filter({ email }).catch(() => []);
        if (retry.length > 0) userId = retry[0].id;
      } else {
        throw new Error('Impossible de créer le compte : ' + msg);
      }
    }
  }

  if (!userId) {
    throw new Error('Compte introuvable après création. Réessayez.');
  }

  // ÉTAPE 5 : Obtenir token via admin-login (service role)
  const adminToken = await tryAdminLogin(userId, email, serviceToken);
  if (adminToken) {
    console.log('[phoneOtp] ✅ Admin-login OK (nouveau user)');
    try {
      const c = createClientFromRequest({ headers: { authorization: `Bearer ${adminToken}` } });
      await c.auth.updateMe({ telephone: phone, full_name: phone });
    } catch (_) {}
    return { access_token: adminToken, is_new_user: isNewUser };
  }

  // ÉTAPE 6 : Fallback — register + verify-otp (si admin-login indisponible)
  console.log('[phoneOtp] admin-login indisponible, tentative register+verify...');
  const rReg = await fetch(`${BASE_AUTH}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const dReg = await rReg.json();
  if (dReg.access_token) {
    return { access_token: dReg.access_token, is_new_user: true };
  }

  throw new Error('Connexion impossible. Réessayez dans quelques secondes.');
}

// ── Handler principal ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS });
  }

  try {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SID) {
      return Response.json({ error: 'Configuration Twilio manquante.' }, { status: 500, headers: CORS });
    }

    const body = await req.json().catch(() => ({}));
    const { action, phone: rawPhone, code } = body;

    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return Response.json({ error: 'Numéro invalide. Format attendu : +226XXXXXXXX' }, { status: 400, headers: CORS });
    }

    console.log('[phoneOtp] action:', action, '| phone:', phone);

    if (action === 'send') {
      await twilioSendOtp(phone);
      return Response.json({ success: true, phone }, { headers: CORS });
    }

    if (action === 'verify') {
      if (!code || String(code).length < 4) {
        return Response.json({ error: 'Code OTP invalide.' }, { status: 400, headers: CORS });
      }

      const approved = await twilioVerifyOtp(phone, String(code).trim());
      if (!approved) {
        return Response.json({ error: 'Code incorrect ou expiré. Réessayez.' }, { status: 400, headers: CORS });
      }

      const result = await phoneAuth(req, phone);

      return Response.json({
        success: true,
        access_token: result.access_token,
        is_new_user: result.is_new_user,
        phone,
      }, { headers: CORS });
    }

    return Response.json({ error: 'Action inconnue : "send" ou "verify".' }, { status: 400, headers: CORS });

  } catch (err) {
    console.error('[phoneOtp] Exception:', err.message);
    return Response.json({ error: err.message || 'Erreur serveur' }, { status: 500, headers: CORS });
  }
});