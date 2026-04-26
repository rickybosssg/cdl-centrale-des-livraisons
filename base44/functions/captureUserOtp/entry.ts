/**
 * captureUserOtp — Automation déclenchée à la CRÉATION d'un User
 *
 * But : capturer l'otp_code généré par Base44 lors du register
 * et le stocker dans PhoneOtpTemp (entité accessible depuis Deno)
 * AVANT qu'il expire (10 minutes).
 *
 * Cette fonction est déclenchée automatiquement par une automation
 * entity sur l'événement "create" du User.
 *
 * Elle n'agit que sur les users phone (email = phone_XXX@cdl.phone).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const BASE44_APP_ID = Deno.env.get('BASE44_APP_ID');
const BASE_ENTITIES = `https://api.base44.app/api/apps/${BASE44_APP_ID}/entities`;

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { event, data, payload_too_large } = body;

    // Ignoré si pas un user phone CDL
    const email = data?.email || '';
    if (!email.startsWith('phone_') || !email.endsWith('@cdl.phone')) {
      return Response.json({ ok: true, skipped: true });
    }

    const userId = event?.entity_id || data?.id;
    if (!userId) return Response.json({ ok: true, skipped: true, reason: 'no userId' });

    console.log('[captureUserOtp] Capture OTP pour:', email, '| userId:', userId);

    const base44 = createClientFromRequest(req);

    // Extraire le service token (injecté par Base44 en contexte automation)
    const authHeader = req.headers.get('authorization') || '';
    const serviceToken = authHeader.replace(/^Bearer\s+/i, '').trim();

    // Lire le user via REST (service token) pour obtenir otp_code
    let otpCode = null;
    if (serviceToken) {
      const r = await fetch(`${BASE_ENTITIES}/User/${userId}`, {
        headers: { 'Authorization': `Bearer ${serviceToken}` },
      });
      if (r.ok) {
        const userData = await r.json().catch(() => null);
        otpCode = userData?.otp_code || null;
        console.log('[captureUserOtp] REST read fields:', Object.keys(userData || {}));
        console.log('[captureUserOtp] otp_code via REST:', otpCode);
      }
    }

    // Si REST ne donne pas l'OTP, essayer via SDK asServiceRole
    if (!otpCode) {
      // Note: le SDK filtre otp_code, mais on tente quand même
      const users = await base44.asServiceRole.entities.User.filter({ email }).catch(() => []);
      if (users.length > 0) {
        otpCode = users[0]?.otp_code || null;
        console.log('[captureUserOtp] SDK otp_code:', otpCode, '| champs:', Object.keys(users[0] || {}));
      }
    }

    if (!otpCode) {
      console.warn('[captureUserOtp] otp_code introuvable pour', email);
      return Response.json({ ok: true, captured: false, reason: 'otp_code_not_found' });
    }

    // Expiration : 9 minutes (OTP Base44 expire à 10 min)
    const expiresAt = new Date(Date.now() + 9 * 60 * 1000).toISOString();

    // Supprimer les anciens enregistrements pour cet email
    try {
      const old = await base44.asServiceRole.entities.PhoneOtpTemp.filter({ email });
      for (const o of old) {
        await base44.asServiceRole.entities.PhoneOtpTemp.delete(o.id);
      }
    } catch (_) {}

    // Stocker dans PhoneOtpTemp
    await base44.asServiceRole.entities.PhoneOtpTemp.create({
      email,
      otp_code: otpCode,
      expires_at: expiresAt,
      used: false,
    });

    console.log('[captureUserOtp] ✅ OTP capturé et stocké pour:', email);
    return Response.json({ ok: true, captured: true });

  } catch (err) {
    console.error('[captureUserOtp] ERROR:', err.message);
    return Response.json({ ok: true, error: err.message });
  }
});