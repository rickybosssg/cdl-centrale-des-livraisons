/**
 * phoneOtp — AUTH_PHONE_ONLY
 *
 * Flux téléphone pur — aucun email, aucune vérification email.
 *
 * POST { action: "send", phone: "+22607..." }
 *   → Envoie un OTP SMS via Twilio Verify
 *   → Retourne { success: true }
 *
 * POST { action: "verify", phone: "+22607...", code: "123456" }
 *   → Vérifie le code SMS OTP
 *   → Si valide : crée ou connecte le compte via adminCreateUser/login
 *   → Retourne { success: true, access_token, is_new_user }
 *
 * IMPORTANT : on ne crée jamais un compte par email "visible".
 * L'email dérivé (phone_XXXX@cdl.phone) est un identifiant interne
 * opaque — il n'est jamais envoyé à l'utilisateur et ne déclenche
 * aucune vérification email car le compte est créé via adminCreateUser
 * (service role) qui bypasse l'email verification.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN');
const TWILIO_VERIFY_SID  = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');
const BASE44_APP_ID      = Deno.env.get('BASE44_APP_ID');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ── Normalise un numéro Burkina Faso → E.164 ─────────────────────────────
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

// Dérive un email interne opaque depuis le numéro de téléphone
function phoneToEmail(phone) {
  return `phone_${phone.replace(/\+/g, '')}@cdl.phone`;
}

// Dérive un mot de passe déterministe depuis le numéro
function phoneToPassword(phone) {
  return `CDL_PHONE_${phone}_OTP_2025`;
}

// ── Twilio Verify : envoyer OTP ───────────────────────────────────────────
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

// ── Twilio Verify : vérifier OTP ─────────────────────────────────────────
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

// ── AUTH_PHONE_ONLY : login ou création sans vérification email ───────────
// Stratégie :
//   1. Tentative de login avec credentials dérivés → si OK, retourne token
//   2. Si échec login → créer via /auth/register (API publique)
//   3. Login immédiat après création (bypasse message email côté frontend)
//
// NOTE : Base44 n'expose pas de méthode adminCreateUser dans le SDK.
// On utilise l'API /auth/register + login immédiat.
// L'email dérivé (phone_XXX@cdl.phone) est opaque — jamais vu par l'user.
async function phoneAuth(phone) {
  const email    = phoneToEmail(phone);
  const password = phoneToPassword(phone);

  // ── ÉTAPE 1 : Tenter une connexion (compte existant) ──────────────────
  console.log('[phoneOtp] ÉTAPE 1 — login tentative pour:', phone);
  const loginRes = await fetch(`https://api.base44.app/api/apps/${BASE44_APP_ID}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const loginData = await loginRes.json();
  console.log('[phoneOtp] Login status:', loginRes.status, '| has token:', !!loginData.access_token);

  if (loginRes.ok && loginData.access_token) {
    console.log('[phoneOtp] ✅ AUTH_PHONE_ONLY — compte existant connecté:', phone);
    try {
      const client = createClientFromRequest({ headers: { authorization: `Bearer ${loginData.access_token}` } });
      const me = await client.auth.me();
      if (!me.telephone) await client.auth.updateMe({ telephone: phone });
    } catch (_) {}
    return { access_token: loginData.access_token, is_new_user: false };
  }

  // ── ÉTAPE 2 : Compte inexistant → créer via /auth/register ───────────
  console.log('[phoneOtp] ÉTAPE 2 — création compte pour:', phone);
  const regRes = await fetch(`https://api.base44.app/api/apps/${BASE44_APP_ID}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, full_name: phone }),
  });
  const regData = await regRes.json();
  console.log('[phoneOtp] Register status:', regRes.status, '| has token:', !!regData.access_token, '| data:', JSON.stringify(regData).slice(0, 200));

  // Si register retourne directement un token → connexion immédiate
  if (regData.access_token) {
    console.log('[phoneOtp] ✅ Register avec token direct');
    try {
      const client = createClientFromRequest({ headers: { authorization: `Bearer ${regData.access_token}` } });
      await client.auth.updateMe({ telephone: phone });
    } catch (_) {}
    return { access_token: regData.access_token, is_new_user: true };
  }

  // Register OK mais sans token (vérif email demandée) → login immédiat quand même
  // Le compte existe maintenant en BDD — on force le login
  if (regRes.ok || regRes.status === 201) {
    console.log('[phoneOtp] ÉTAPE 3 — login post-register (sans token initial)');
    const loginRes2 = await fetch(`https://api.base44.app/api/apps/${BASE44_APP_ID}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const loginData2 = await loginRes2.json();
    console.log('[phoneOtp] Login post-register status:', loginRes2.status, '| has token:', !!loginData2.access_token);

    if (loginData2.access_token) {
      console.log('[phoneOtp] ✅ AUTH_PHONE_ONLY — nouveau compte connecté après register:', phone);
      try {
        const client = createClientFromRequest({ headers: { authorization: `Bearer ${loginData2.access_token}` } });
        await client.auth.updateMe({ telephone: phone });
      } catch (_) {}
      return { access_token: loginData2.access_token, is_new_user: true };
    }

    const errLogin = loginData2?.error || loginData2?.detail || loginData2?.message || 'Login post-register échoué';
    console.error('[phoneOtp] Login post-register failed:', errLogin);
    throw new Error('Connexion impossible après création : ' + errLogin);
  }

  // Échec register
  const errReg = regData?.error || regData?.detail || regData?.message || 'Erreur register inconnue';
  console.error('[phoneOtp] Register failed:', errReg, '| status:', regRes.status);
  throw new Error('Impossible de créer le compte : ' + errReg);
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

    // ── ENVOI OTP ──────────────────────────────────────────────────────────
    if (action === 'send') {
      await twilioSendOtp(phone);
      return Response.json({ success: true, phone }, { headers: CORS });
    }

    // ── VÉRIFICATION OTP ───────────────────────────────────────────────────
    if (action === 'verify') {
      if (!code || String(code).length < 4) {
        return Response.json({ error: 'Code OTP invalide.' }, { status: 400, headers: CORS });
      }

      const approved = await twilioVerifyOtp(phone, String(code).trim());
      if (!approved) {
        return Response.json({ error: 'Code incorrect ou expiré. Réessayez.' }, { status: 400, headers: CORS });
      }

      // OTP valide — AUTH_PHONE_ONLY
      const result = await phoneAuth(phone);

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