/**
 * phoneOtp — Envoi et vérification OTP via Twilio Verify
 *
 * POST { action: "send", phone: "+22607..." }
 *   → Envoie un OTP SMS via Twilio Verify
 *   → Retourne { success: true }
 *
 * POST { action: "verify", phone: "+22607...", code: "123456" }
 *   → Vérifie le code OTP
 *   → Si valide : connecte ou crée le compte Base44
 *   → Retourne { success: true, access_token, is_new_user }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TWILIO_ACCOUNT_SID  = Deno.env.get('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN   = Deno.env.get('TWILIO_AUTH_TOKEN');
const TWILIO_VERIFY_SID   = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');
const BASE44_APP_ID       = Deno.env.get('BASE44_APP_ID');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ── Normalise un numéro Burkina Faso → E.164 ──────────────────────────────
function normalizePhone(raw) {
  if (!raw) return null;
  let n = String(raw).replace(/\s+/g, '').replace(/-/g, '');
  // Déjà en E.164
  if (n.startsWith('+')) return n;
  // 00226...
  if (n.startsWith('00226')) return '+' + n.slice(2);
  // 226XXXXXXXX (11 chiffres)
  if (n.startsWith('226') && n.length === 11) return '+' + n;
  // Numéro local 8 chiffres → +226
  if (/^\d{8}$/.test(n)) return '+226' + n;
  // Numéro local 7-10 chiffres
  if (/^\d{7,10}$/.test(n)) return '+226' + n;
  return null;
}

// ── Twilio Verify : envoyer OTP ────────────────────────────────────────────
async function twilioSendOtp(phone) {
  const creds = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const url = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SID}/Verifications`;

  const body = new URLSearchParams({ To: phone, Channel: 'sms' });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const data = await res.json();
  console.log('[phoneOtp] Twilio send response:', res.status, data?.status, data?.sid);

  if (!res.ok) {
    console.error('[phoneOtp] Twilio send error:', JSON.stringify(data));
    throw new Error(data?.message || `Twilio error ${res.status}`);
  }
  return data;
}

// ── Twilio Verify : vérifier OTP ──────────────────────────────────────────
async function twilioVerifyOtp(phone, code) {
  const creds = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const url = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SID}/VerificationCheck`;

  const body = new URLSearchParams({ To: phone, Code: code });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const data = await res.json();
  console.log('[phoneOtp] Twilio verify response:', res.status, data?.status);

  if (!res.ok) {
    console.error('[phoneOtp] Twilio verify error:', JSON.stringify(data));
    throw new Error(data?.message || `Twilio verify error ${res.status}`);
  }

  return data?.status === 'approved';
}

// ── Base44 : login ou création de compte via numéro ────────────────────────
// Stratégie : email dérivé du numéro + mot de passe dérivé sécurisé
// (Base44 n'a pas d'auth native par téléphone)
async function loginOrCreateByPhone(base44, phone) {
  const derivedEmail    = `phone_${phone.replace(/\+/g, '')}@cdl.phone`;
  const derivedPassword = `CDL_PHONE_${phone}_OTP_AUTH_2024`;

  // 1. Essayer de se connecter
  const loginRes = await fetch(`https://api.base44.app/api/apps/${BASE44_APP_ID}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: derivedEmail, password: derivedPassword }),
  });
  const loginData = await loginRes.json();

  if (loginRes.ok && loginData.access_token) {
    console.log('[phoneOtp] ✅ Connexion existante par téléphone:', phone);
    // Mettre à jour le profil avec le numéro si absent
    const tempBase44 = createClientFromRequest({ headers: { authorization: `Bearer ${loginData.access_token}` } });
    try {
      const me = await tempBase44.auth.me();
      if (!me.telephone) {
        await tempBase44.auth.updateMe({ telephone: phone });
      }
    } catch (_) {}
    return { access_token: loginData.access_token, is_new_user: false };
  }

  // 2. Créer le compte
  console.log('[phoneOtp] Création nouveau compte pour:', phone);
  const regRes = await fetch(`https://api.base44.app/api/apps/${BASE44_APP_ID}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: derivedEmail,
      password: derivedPassword,
      full_name: phone,
    }),
  });
  const regData = await regRes.json();
  console.log('[phoneOtp] Register status:', regRes.status, '| has token:', !!regData.access_token);

  // Si l'inscription a réussi avec un token → connexion directe
  if (regRes.ok && regData.access_token) {
    try {
      const tempBase44 = createClientFromRequest({ headers: { authorization: `Bearer ${regData.access_token}` } });
      await tempBase44.auth.updateMe({ telephone: phone });
    } catch (_) {}
    console.log('[phoneOtp] ✅ Nouveau compte créé + connecté pour:', phone);
    return { access_token: regData.access_token, is_new_user: true };
  }

  // Si l'inscription a réussi MAIS sans token (ex: vérif email demandée par la plateforme)
  // → forcer une connexion immédiate avec les credentials dérivés
  if (regRes.ok || regRes.status === 201) {
    console.log('[phoneOtp] Inscription OK sans token — tentative de connexion immédiate...');
    const loginRes2 = await fetch(`https://api.base44.app/api/apps/${BASE44_APP_ID}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: derivedEmail, password: derivedPassword }),
    });
    const loginData2 = await loginRes2.json();
    if (loginRes2.ok && loginData2.access_token) {
      try {
        const tempBase44 = createClientFromRequest({ headers: { authorization: `Bearer ${loginData2.access_token}` } });
        await tempBase44.auth.updateMe({ telephone: phone });
      } catch (_) {}
      console.log('[phoneOtp] ✅ Connexion après inscription pour:', phone);
      return { access_token: loginData2.access_token, is_new_user: true };
    }
    console.warn('[phoneOtp] Login post-register échoué:', loginData2);
  }

  // 3. Cas edge : échec complet
  const errMsg = regData?.detail || regData?.message || regData?.error || 'Erreur création compte';
  console.error('[phoneOtp] Register failed:', errMsg, '| status:', regRes.status);
  throw new Error('Impossible de créer ou connecter le compte : ' + errMsg);
}

// ── Handler principal ──────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS });
  }

  try {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SID) {
      console.error('[phoneOtp] Secrets Twilio manquants !');
      return Response.json({ error: 'Configuration Twilio manquante côté serveur.' }, { status: 500, headers: CORS });
    }

    const body = await req.json().catch(() => ({}));
    const { action, phone: rawPhone, code } = body;

    // Normalisation numéro
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return Response.json({ error: 'Numéro de téléphone invalide. Format attendu : +226XXXXXXXX' }, { status: 400, headers: CORS });
    }

    console.log('[phoneOtp] Action:', action, '| Phone:', phone);

    // ── ENVOI OTP ────────────────────────────────────────────────────────────
    if (action === 'send') {
      await twilioSendOtp(phone);
      return Response.json({ success: true, phone }, { headers: CORS });
    }

    // ── VÉRIFICATION OTP ─────────────────────────────────────────────────────
    if (action === 'verify') {
      if (!code || String(code).length < 4) {
        return Response.json({ error: 'Code OTP invalide.' }, { status: 400, headers: CORS });
      }

      const approved = await twilioVerifyOtp(phone, String(code).trim());
      if (!approved) {
        return Response.json({ error: 'Code OTP incorrect ou expiré. Veuillez réessayer.' }, { status: 400, headers: CORS });
      }

      // OTP valide → connexion ou création
      const base44 = createClientFromRequest(req);
      const result = await loginOrCreateByPhone(base44, phone);

      return Response.json({
        success: true,
        access_token: result.access_token,
        is_new_user: result.is_new_user,
        phone,
      }, { headers: CORS });
    }

    return Response.json({ error: 'Action inconnue. Utilisez "send" ou "verify".' }, { status: 400, headers: CORS });

  } catch (err) {
    console.error('[phoneOtp] Exception:', err.message, err.stack);
    return Response.json({ error: err.message || 'Erreur serveur' }, { status: 500, headers: CORS });
  }
});