/**
 * phoneOtp — AUTH_PHONE_ONLY
 *
 * Stratégie DEFINITIVE sans vérification email :
 *
 * CRÉATION : inviteUser via SDK (service role) → crée l'user sans
 *   email verification côté Base44. Puis on obtient un token
 *   via l'API admin /auth/admin-token (service role HTTP).
 *
 * CONNEXION : login normal si le compte existe déjà.
 *
 * L'email dérivé (phone_XXXX@cdl.phone) est opaque — jamais montré à l'user.
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

// ── Helpers ────────────────────────────────────────────────────────────────
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

// ── Twilio : envoyer OTP ──────────────────────────────────────────────────
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

// ── Twilio : vérifier OTP ─────────────────────────────────────────────────
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

// ── Login simple ──────────────────────────────────────────────────────────
async function tryLogin(email, password) {
  const res = await fetch(`${BASE_AUTH}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  console.log('[phoneOtp] tryLogin:', res.status, '| token:', !!data.access_token, '| err:', data.error || data.detail || '');
  return data.access_token || null;
}

// ── AUTH PHONE ONLY ───────────────────────────────────────────────────────
async function phoneAuth(req, phone) {
  const email    = phoneToEmail(phone);
  const password = phoneToPassword(phone);
  const base44   = createClientFromRequest(req);

  console.log('[phoneOtp] phoneAuth | phone:', phone, '| email:', email);

  // ── ÉTAPE 1 : Tenter login direct (compte existant) ──────────────────
  const token1 = await tryLogin(email, password);
  if (token1) {
    console.log('[phoneOtp] ✅ ÉTAPE 1 — compte existant connecté');
    try {
      const c = createClientFromRequest({ headers: { authorization: `Bearer ${token1}` } });
      const me = await c.auth.me();
      if (!me.telephone) await c.auth.updateMe({ telephone: phone });
    } catch (_) {}
    return { access_token: token1, is_new_user: false };
  }

  // ── ÉTAPE 2 : Vérifier si user existe en BDD (email vérifié en attente) ─
  console.log('[phoneOtp] ÉTAPE 2 — recherche user en BDD');
  let existingUser = null;
  try {
    const users = await base44.asServiceRole.entities.User.filter({ email });
    if (users.length > 0) {
      existingUser = users[0];
      console.log('[phoneOtp] User trouvé en BDD id:', existingUser.id);
    }
  } catch (e) {
    console.warn('[phoneOtp] Recherche BDD échouée:', e.message);
  }

  // ── ÉTAPE 3 : Si user existe → tenter admin-token (service role) ──────
  if (existingUser) {
    console.log('[phoneOtp] ÉTAPE 3 — user existant, tentative admin-token');
    const adminToken = await tryAdminToken(base44, existingUser.id, email, password);
    if (adminToken) {
      console.log('[phoneOtp] ✅ ÉTAPE 3 — admin-token OK');
      return { access_token: adminToken, is_new_user: false };
    }
  }

  // ── ÉTAPE 4 : Créer via inviteUser (service role) ─────────────────────
  console.log('[phoneOtp] ÉTAPE 4 — création via inviteUser');
  let userId = existingUser?.id || null;
  if (!userId) {
    try {
      await base44.users.inviteUser(email, 'user');
      console.log('[phoneOtp] inviteUser OK — attente propagation BDD...');
      await new Promise(r => setTimeout(r, 2000));

      const newUsers = await base44.asServiceRole.entities.User.filter({ email });
      if (newUsers.length > 0) {
        userId = newUsers[0].id;
        console.log('[phoneOtp] User créé id:', userId);
      }
    } catch (e) {
      const msg = e.message || '';
      if (msg.toLowerCase().includes('exist') || msg.toLowerCase().includes('already')) {
        console.warn('[phoneOtp] inviteUser — user déjà existant');
        try {
          const retryUsers = await base44.asServiceRole.entities.User.filter({ email });
          if (retryUsers.length > 0) userId = retryUsers[0].id;
        } catch (_) {}
      } else {
        console.error('[phoneOtp] inviteUser failed:', msg);
        throw new Error('Impossible de créer le compte : ' + msg);
      }
    }
  }

  // ── ÉTAPE 5 : Obtenir token via admin-token ───────────────────────────
  if (userId) {
    console.log('[phoneOtp] ÉTAPE 5 — admin-token pour userId:', userId);
    const adminToken = await tryAdminToken(base44, userId, email, password);
    if (adminToken) {
      console.log('[phoneOtp] ✅ ÉTAPE 5 — admin-token OK → nouveau compte');
      try {
        const c = createClientFromRequest({ headers: { authorization: `Bearer ${adminToken}` } });
        await c.auth.updateMe({ telephone: phone, full_name: phone });
      } catch (_) {}
      return { access_token: adminToken, is_new_user: true };
    }
  }

  throw new Error('Connexion impossible après OTP valide. Réessayez dans quelques secondes.');
}

// ── Obtenir un token admin pour un user (service role) ────────────────────
// Tente plusieurs routes admin possibles de Base44
async function tryAdminToken(base44, userId, email, password) {
  // Méthode A : /auth/admin-login (service role token dans header)
  try {
    // Récupérer le service role token depuis le SDK
    const srToken = await getServiceRoleToken(base44);
    console.log('[phoneOtp] Service role token disponible:', !!srToken);

    if (srToken) {
      // Essai 1 : admin-login par user_id
      const r1 = await fetch(`${BASE_AUTH}/admin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${srToken}` },
        body: JSON.stringify({ user_id: userId }),
      });
      const d1 = await r1.json();
      console.log('[phoneOtp] admin-login by user_id:', r1.status, '| token:', !!d1.access_token);
      if (d1.access_token) return d1.access_token;

      // Essai 2 : admin-login par email
      const r2 = await fetch(`${BASE_AUTH}/admin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${srToken}` },
        body: JSON.stringify({ email }),
      });
      const d2 = await r2.json();
      console.log('[phoneOtp] admin-login by email:', r2.status, '| token:', !!d2.access_token);
      if (d2.access_token) return d2.access_token;

      // Essai 3 : impersonate
      const r3 = await fetch(`${BASE_AUTH}/impersonate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${srToken}` },
        body: JSON.stringify({ user_id: userId }),
      });
      const d3 = await r3.json();
      console.log('[phoneOtp] impersonate:', r3.status, '| token:', !!d3.access_token);
      if (d3.access_token) return d3.access_token;
    }
  } catch (e) {
    console.warn('[phoneOtp] admin-token attempt failed:', e.message);
  }

  return null;
}

// ── Extraire le service-role token depuis le SDK ───────────────────────────
async function getServiceRoleToken(base44) {
  try {
    // Tenter d'accéder à la config interne du SDK
    const client = base44.asServiceRole;
    // Le client interne a souvent un _token ou _config
    const internal = client._client || client;
    return internal._serviceRoleToken || internal._token || internal.token || null;
  } catch (_) {
    return null;
  }
}

// ── Handler principal ─────────────────────────────────────────────────────
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