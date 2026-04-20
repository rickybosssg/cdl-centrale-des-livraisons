/**
 * sendOTP — Envoyer un code OTP via Twilio Verify
 * 
 * Input: { phone: "+226XXXXXXXX" }
 * Output: { success: true, message: "Code envoyé" }
 */
Deno.serve(async (req) => {
  try {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const verifyServiceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

    if (!accountSid || !authToken || !verifyServiceSid) {
      console.error('[sendOTP] Configuration Twilio manquante');
      return Response.json(
        { error: 'Configuration Twilio manquante' },
        { status: 500 }
      );
    }

    const body = await req.json();
    let phone = body.phone || '';

    // Normaliser le numéro
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

    console.log('[sendOTP] Envoi OTP vers', phone);

    // Appel API REST Twilio Verify
    const url = `https://verify.twilio.com/v2/Services/${verifyServiceSid}/Verifications`;
    const auth = btoa(`${accountSid}:${authToken}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: phone,
        Channel: 'sms',
      }).toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[sendOTP] Erreur Twilio:', data);
      return Response.json(
        { error: data.message || 'Erreur Twilio' },
        { status: response.status }
      );
    }

    console.log('[sendOTP] Code envoyé avec succès - SID:', data.sid);

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