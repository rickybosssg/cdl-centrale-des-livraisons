/**
 * phoneOtp — AUTH PAR TÉLÉPHONE (OTP Twilio)
 *
 * SEND   : envoie OTP SMS via Twilio Verify
 * VERIFY : après OTP Twilio validé →
 *   1. Login direct (compte existant et vérifié → password déterministe)
 *   2. Si non trouvé : adminCreateUser (service role SDK) → retourne access_token directement
 *   3. Si existant non vérifié : adminCreateUser avec upsert
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

// ── Helpers ──────────────────────────────────────────────────────────────────
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

// ── Twilio : envoyer OTP ─────────────────────────────────────────────────────
async function twilioSendOtp(phone) {
  const creds = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SID}/Verifications`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phone, Channel: 'sms' }).toString(),
    }
  );
  const data = await res.json();
  console.log('[phoneOtp] Twilio send:', res.status, data?.status);
  if (!res.ok) throw new Error(data?.message || `Twilio error ${res.status}`);
  return data;
}

// ── Twilio : vérifier OTP ────────────────────────────────────────────────────
async function twilioVerifyOtp(phone, code) {
  const creds = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SID}/VerificationCheck`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phone, Code: code }).toString(),
    }
  );
  const data = await res.json();
  console.log('[phoneOtp] Twilio verify:', res.status, data?.status);
  if (!res.ok) throw new Error(data?.message || `Twilio verify error ${res.status}`);
  return data?.status === 'approved';
}

// ── Login direct avec password déterministe ──────────────────────────────────
async function tryDirectLogin(email, password) {
  const res = await fetch(`${BASE_AUTH}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  console.log('[phoneOtp] tryDirectLogin:', res.status, '| token:', !!data.access_token);
  return data.access_token || null;
}

// ── Flux auth principal ──────────────────────────────────────────────────────
async function phoneAuth(base44, phone) {
  const email    = phoneToEmail(phone);
  const password = phoneToPassword(phone);

  // ÉTAPE 1 : Login direct (compte existant et déjà vérifié)
  const existingToken = await tryDirectLogin(email, password);
  if (existingToken) {
    console.log('[phoneOtp] ✅ Login direct OK');
    return { access_token: existingToken, is_new_user: false };
  }

  // ÉTAPE 2 : Créer ou récupérer le user via adminCreateUser (service role SDK)
  console.log('[phoneOtp] adminCreateUser pour:', email);
  const result = await base44.asServiceRole.auth.adminCreateUser({
    email,
    password,
    full_name: phone,
    role: 'user',
  });

  console.log('[phoneOtp] adminCreateUser résultat:', JSON.stringify(result));

  if (!result?.access_token) {
    throw new Error('adminCreateUser n\'a pas retourné de token. Réessayez.');
  }

  return { access_token: result.access_token, is_new_user: result.is_new_user ?? true };
}

// ── Handler principal ─────────────────────────────────────────────────────────
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
      return Response.json(
        { error: 'Numéro invalide. Format attendu : +226XXXXXXXX' },
        { status: 400, headers: CORS }
      );
    }

    console.log('[phoneOtp] action:', action, '| phone:', phone);

    // ── SEND ──────────────────────────────────────────────────────────────────
    if (action === 'send') {
      await twilioSendOtp(phone);
      return Response.json({ success: true, phone }, { headers: CORS });
    }

    // ── VERIFY ────────────────────────────────────────────────────────────────
    if (action === 'verify') {
      if (!code || String(code).length < 4) {
        return Response.json({ error: 'Code OTP invalide.' }, { status: 400, headers: CORS });
      }

      const approved = await twilioVerifyOtp(phone, String(code).trim());
      if (!approved) {
        return Response.json(
          { error: 'Code incorrect ou expiré. Réessayez.' },
          { status: 400, headers: CORS }
        );
      }

      // Créer le client avec le service role (req contient le token injecté par Base44)
      const base44 = createClientFromRequest(req);

      const authResult = await phoneAuth(base44, phone);

      // Mettre à jour le numéro de téléphone si nécessaire (best-effort)
      try {
        const userClient = createClientFromRequest({
          headers: { get: (h) => h === 'authorization' ? `Bearer ${authResult.access_token}` : null },
        });
        const me = await userClient.auth.me();
        if (!me.telephone) {
          await userClient.auth.updateMe({ telephone: phone });
        }
      } catch (_) {}

      return Response.json({
        success: true,
        access_token: authResult.access_token,
        is_new_user: authResult.is_new_user,
        phone,
      }, { headers: CORS });
    }

    return Response.json(
      { error: 'Action inconnue : "send" ou "verify".' },
      { status: 400, headers: CORS }
    );

  } catch (err) {
    console.error('[phoneOtp] Exception:', err.message);
    return Response.json(
      { error: err.message || 'Erreur serveur' },
      { status: 500, headers: CORS }
    );
  }
});