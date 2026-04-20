/**
 * sendOTP — Envoyer un code OTP via Twilio Verify
 * 
 * Input: { phone: "+226XXXXXXXX" }
 * Output: { success: true, message: "Code envoyé" }
 */
import { Twilio } from 'npm:twilio@4.27.0';

Deno.serve(async (req) => {
  try {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const verifyServiceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

    if (!accountSid || !authToken || !verifyServiceSid) {
      return Response.json(
        { error: 'Configuration Twilio manquante' },
        { status: 500 }
      );
    }

    const body = await req.json();
    let phone = body.phone || '';

    // Normaliser le numéro : ajouter +226 si nécessaire
    phone = phone.replace(/\s/g, '');
    if (!phone.startsWith('+')) {
      if (phone.startsWith('226')) {
        phone = '+' + phone;
      } else if (phone.startsWith('0')) {
        phone = '+226' + phone.substring(1);
      } else {
        phone = '+226' + phone;
      }
    }

    // Valider le format
    if (!/^\+226\d{8}$/.test(phone)) {
      return Response.json(
        { error: 'Numéro invalide. Format attendu: +226XXXXXXXX' },
        { status: 400 }
      );
    }

    // Initialiser Twilio
    const client = new Twilio(accountSid, authToken);

    // Envoyer le code OTP via Twilio Verify
    const verification = await client.verify.v2
      .services(verifyServiceSid)
      .verifications.create({
        to: phone,
        channel: 'sms',
      });

    console.log('[sendOTP] Code envoyé à', phone, '- SID:', verification.sid);

    return Response.json({
      success: true,
      message: 'Code OTP envoyé par SMS',
      phone: phone,
    });
  } catch (error) {
    console.error('[sendOTP] Erreur:', error.message);
    return Response.json(
      { error: error.message || 'Erreur lors de l\'envoi du code' },
      { status: 500 }
    );
  }
});