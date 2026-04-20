/**
 * sendOTP — Envoyer un code OTP via Twilio Verify (PUBLIC)
 * RETOURNE L'ERREUR TWILIO COMPLÈTE pour diagnostic
 */
Deno.serve(async (req) => {
  try {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const verifyServiceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

    console.log('[sendOTP] 🔍 CONFIG CHECK:');
    console.log('  - ACCOUNT_SID exists:', !!accountSid);
    console.log('  - AUTH_TOKEN exists:', !!authToken);
    console.log('  - VERIFY_SERVICE_SID exists:', !!verifyServiceSid);

    if (!accountSid || !authToken || !verifyServiceSid) {
      return Response.json(
        {
          success: false,
          step: 'sendOTP',
          error: 'Configuration Twilio manquante',
          missing: {
            accountSid: !accountSid,
            authToken: !authToken,
            verifyServiceSid: !verifyServiceSid,
          },
        },
        { status: 500 }
      );
    }

    const body = await req.json();
    let phone = body.phone || '';

    // Normaliser
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

    // Valider format
    if (!/^\+226\d{8}$/.test(phone)) {
      return Response.json(
        {
          success: false,
          step: 'sendOTP',
          error: 'Numéro invalide',
          received: body.phone,
          normalized: phone,
          expected_format: '+226XXXXXXXX',
        },
        { status: 400 }
      );
    }

    console.log(`[sendOTP] 📞 Envoi OTP vers ${phone}`);
    console.log(`[sendOTP] Service SID: ${verifyServiceSid.substring(0, 5)}...`);

    // Appel Twilio
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

    console.log(`[sendOTP] Response status: ${response.status}`);
    console.log(`[sendOTP] Response body:`, JSON.stringify(data));

    if (!response.ok) {
      console.error('[sendOTP] ❌ Erreur Twilio API');
      return Response.json(
        {
          success: false,
          step: 'sendOTP',
          phone: phone,
          http_status: response.status,
          twilio_error_code: data.code,
          twilio_message: data.message,
          twilio_more_info: data.more_info,
          raw_error: JSON.stringify(data),
        },
        { status: response.status }
      );
    }

    console.log(`[sendOTP] ✅ OTP envoyé — SID: ${data.sid}`);

    return Response.json({
      success: true,
      step: 'sendOTP',
      phone: phone,
      message: 'Code OTP envoyé par SMS',
      verification_sid: data.sid,
    });
  } catch (error) {
    console.error('[sendOTP] ⚠️ Exception:', error.message);
    return Response.json(
      {
        success: false,
        step: 'sendOTP',
        error: error.message,
        raw_error: error.toString(),
      },
      { status: 500 }
    );
  }
});