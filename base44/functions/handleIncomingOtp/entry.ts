/**
 * handleIncomingOtp — Webhook Mailgun
 *
 * Reçoit les emails de Base44 (OTP de vérification)
 * Extrait l'OTP et le stocke dans PhoneOtpTemp
 *
 * Setup Mailgun :
 * 1. Route email : ^phone_(.+)@yourdomain\\.com$ → https://your-app/functions/handleIncomingOtp
 * 2. Le webhook Mailgun sera appelé avec la structure "message-received" ou "storage"
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const MAILGUN_WEBHOOK_KEY = Deno.env.get('MAILGUN_WEBHOOK_SIGNING_KEY') || '';
const MAILGUN_API_KEY = Deno.env.get('MAILGUN_API_KEY') || '';

// Valide la signature du webhook Mailgun
async function validateMailgunWebhook(req, timestamp, token, signature) {
  const data = `${timestamp}${token}`;
  const keyData = new TextEncoder().encode(MAILGUN_WEBHOOK_KEY);
  const msgData = new TextEncoder().encode(data);
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, msgData);
  const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return computed === signature;
}

// Extrait le code OTP (cherche le pattern "code: XXXXXX" ou "Code: XXXXXX")
function extractOtpFromBody(body) {
  if (!body) return null;
  // Cherche "code: 123456" ou "code=123456" ou "123456" en contexte d'OTP
  const matches = [
    body.match(/[Cc]ode[:\s=]+(\d{6})/),
    body.match(/(\d{6})/),
  ];
  for (const m of matches) {
    if (m?.[1]) return m[1];
  }
  return null;
}

// Extrait l'email destinataire (phone_XXXX@domain)
function extractEmailFromRecipient(recipient) {
  if (!recipient) return null;
  const m = recipient.match(/^(phone_[^@]+@[^@]+)$/);
  return m?.[1] || null;
}

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    return Response.json({ status: 'webhook ready' });
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    let body;

    if (contentType.includes('application/json')) {
      body = await req.json().catch(() => ({}));
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await req.text();
      body = Object.fromEntries(new URLSearchParams(text));
    } else {
      body = {};
    }

    console.log('[handleIncomingOtp] Webhook reçu | type:', body['event-data']?.event || body.type || 'unknown');

    // ── Validation signature Mailgun ──────────────────────────────────────────
    if (MAILGUN_WEBHOOK_KEY && body.signature) {
      const valid = await validateMailgunWebhook(req, body.timestamp, body.token, body.signature.signature);
      if (!valid) {
        console.warn('[handleIncomingOtp] ❌ Signature invalide');
        return Response.json({ error: 'Invalid signature' }, { status: 401 });
      }
      console.log('[handleIncomingOtp] ✅ Signature valide');
    }

    // ── Extraire les données ──────────────────────────────────────────────────
    // Format Mailgun : soit "stored" (stocké), soit "message-received" (webhook)
    const eventData = body['event-data']?.['message-headers'] || body['message-headers'];
    const recipient = body['event-data']?.recipient || body.recipient || body.to;
    const messageBody = body['event-data']?.['stripped-text'] || body['stripped-text'] || body.body || body['text-part'] || '';

    const email = extractEmailFromRecipient(recipient);
    const otp = extractOtpFromBody(messageBody);

    if (!email || !otp) {
      console.warn('[handleIncomingOtp] Email ou OTP manquant | email:', email, '| otp:', otp);
      return Response.json({ status: 'skip', reason: 'no_phone_email_or_otp' });
    }

    console.log('[handleIncomingOtp] OTP extrait | email:', email, '| otp:', otp);

    // ── Stocker l'OTP en BDD ─────────────────────────────────────────────────
    const base44 = createClientFromRequest(req);

    // Supprimer les anciens OTP pour cet email (éviter les doublons)
    try {
      const old = await base44.asServiceRole.entities.PhoneOtpTemp.filter({ email });
      for (const o of old) {
        await base44.asServiceRole.entities.PhoneOtpTemp.delete(o.id);
      }
    } catch (_) {}

    // Stocker le nouvel OTP (expire dans 10 minutes, même que Base44)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    try {
      await base44.asServiceRole.entities.PhoneOtpTemp.create({
        email,
        otp_code: otp,
        expires_at: expiresAt,
        used: false,
      });
      console.log('[handleIncomingOtp] ✅ OTP stocké | email:', email, '| expires:', expiresAt);
      return Response.json({ status: 'ok', email, otp });
    } catch (e) {
      console.error('[handleIncomingOtp] Erreur sauvegarde OTP:', e.message);
      return Response.json({ status: 'error', error: e.message }, { status: 500 });
    }

  } catch (err) {
    console.error('[handleIncomingOtp] Exception:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});