/**
 * phoneOtp — AUTH PAR TÉLÉPHONE (OTP Twilio)
 *
 * Flux :
 *  SEND   : envoie OTP SMS via Twilio Verify
 *  VERIFY : valide OTP Twilio →
 *    1. Tente login direct (user déjà vérifié)
 *    2. Si échec → inviteUser (crée sans vérification email) + register → token direct
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

// email interne dérivé du téléphone (domaine @cdl.app)
function phoneToEmail(phone) {
  return `phone_${phone.replace(/\+/g, '')}@cdl.app`;
}

// password déterministe — jamais exposé à l'utilisateur
function phoneToPassword(phone) {
  return `CDL_${phone.replace(/\+/g, '')}_2025!`;
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

// ── Login direct ─────────────────────────────────────────────────────────────
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

// ── Register direct ──────────────────────────────────────────────────────────
// Retourne le token si le user est invité (pré-créé) — pas de vérif email
async function tryRegister(email, password, fullName) {
  const res = await fetch(`${BASE_AUTH}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, full_name: fullName }),
  });
  const data = await res.json();
  console.log('[phoneOtp] tryRegister:', res.status, '| token:', !!data.access_token, '| fields:', Object.keys(data));
  return data.access_token || null;
}

// ── Flux auth principal ──────────────────────────────────────────────────────
async function phoneAuth(base44, phone) {
  const email    = phoneToEmail(phone);
  const password = phoneToPassword(phone);
  const fullName = phone; // nom = numéro de téléphone par défaut

  // ── ÉTAPE 1 : Login direct (user existant et vérifié) ─────────────────────
  const token1 = await tryLogin(email, password);
  if (token1) {
    console.log('[phoneOtp] ✅ ÉTAPE 1 — Login direct réussi');
    return { access_token: token1, is_new_user: false };
  }

  // ── ÉTAPE 2 : Vérifier si le user existe en BDD (non vérifié ou invité) ──
  const existingUsers = await base44.asServiceRole.entities.User.filter({ email }).catch(() => []);
  const existingUser = existingUsers[0] || null;
  console.log('[phoneOtp] ÉTAPE 2 — user en BDD:', !!existingUser, '| is_verified:', existingUser?.is_verified);

  if (existingUser) {
    // User existe mais login a échoué → tenter register (peut retourner token si invité)
    const token2 = await tryRegister(email, password, fullName);
    if (token2) {
      console.log('[phoneOtp] ✅ ÉTAPE 2a — Register sur user existant → token');
      return { access_token: token2, is_new_user: false };
    }
    // Retenter login (register peut avoir défini le password)
    await new Promise(r => setTimeout(r, 1000));
    const token2b = await tryLogin(email, password);
    if (token2b) {
      console.log('[phoneOtp] ✅ ÉTAPE 2b — Login après register → token');
      return { access_token: token2b, is_new_user: false };
    }
  }

  // ── ÉTAPE 3 : Nouvel utilisateur — inviteUser + register ─────────────────
  console.log('[phoneOtp] ÉTAPE 3 — Nouvel utilisateur: inviteUser + register');

  // inviteUser crée le compte sans exiger la vérification email
  try {
    await base44.users.inviteUser(email, 'user');
    console.log('[phoneOtp] inviteUser OK');
  } catch (e) {
    console.warn('[phoneOtp] inviteUser warn:', e.message);
    // Continuer même si déjà existant
  }

  // Attendre la propagation BDD
  await new Promise(r => setTimeout(r, 2000));

  // register sur le user invité → retourne un token DIRECT (pas d'OTP email)
  const token3 = await tryRegister(email, password, fullName);
  if (token3) {
    console.log('[phoneOtp] ✅ ÉTAPE 3a — register après inviteUser → token');
    return { access_token: token3, is_new_user: true };
  }

  // Dernier recours : login (au cas où register a défini le mot de passe)
  await new Promise(r => setTimeout(r, 1000));
  const token3b = await tryLogin(email, password);
  if (token3b) {
    console.log('[phoneOtp] ✅ ÉTAPE 3b — login après inviteUser+register → token');
    return { access_token: token3b, is_new_user: true };
  }

  throw new Error('Impossible de créer la session. Réessayez dans quelques instants.');
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

      const base44 = createClientFromRequest(req);
      const authResult = await phoneAuth(base44, phone);

      // Mettre à jour le profil avec le numéro de téléphone (best-effort)
      try {
        const userClient = createClientFromRequest({
          headers: { get: (h) => h === 'authorization' ? `Bearer ${authResult.access_token}` : null },
        });
        const me = await userClient.auth.me();
        if (me && !me.telephone) {
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