/**
 * sendOTP — Envoyer un code OTP via Twilio Verify (PUBLIC)
 * RETOURNE L'ERREUR TWILIO COMPLÈTE pour diagnostic
 */
Deno.serve(async (req) => {
  try {
    // ✅ BLOCKER CHECK #1: Vérifier la méthode HTTP
    if (req.method !== 'POST') {
      return Response.json(
        { success: false, error: 'Method must be POST', received: req.method },
        { status: 405 }
      );
    }

    // ✅ BLOCKER CHECK #2: Vérifier que le body n'est pas vide
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return Response.json(
        { success: false, error: 'Invalid JSON body', detail: e.message },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'object') {
      return Response.json(
        { success: false, error: 'Body must be a JSON object' },
        { status: 400 }
      );
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const verifyServiceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

    console.log('[sendOTP] 🔍 CONFIG CHECK:');
    console.log('  - ACCOUNT_SID exists:', !!accountSid);
    console.log('  - AUTH_TOKEN exists:', !!authToken);
    console.log('  - VERIFY_SERVICE_SID exists:', !!verifyServiceSid);

    // ✅ BLOCKER CHECK #3: Secrets manquants
    if (!accountSid || !authToken || !verifyServiceSid) {
      console.error('[sendOTP] 🔴 TWILIO SECRETS MISSING');
      return Response.json(
        {
          success: false,
          step: 'sendOTP',
          error: 'Configuration Twilio manquante — contacter admin',
          missing: {
            accountSid: !accountSid,
            authToken: !authToken,
            verifyServiceSid: !verifyServiceSid,
          },
        },
        { status: 500 }
      );
    }

    let phone = body.phone || '';

    // ✅ BLOCKER CHECK #4: Téléphone vide
    if (!phone || typeof phone !== 'string') {
      return Response.json(
        {
          success: false,
          step: 'sendOTP',
          error: 'phone parameter required (string)',
          received: typeof phone,
        },
        { status: 400 }
      );
    }

    // Normaliser
    phone = phone.trim().replace(/\s/g, '');
    if (!phone.startsWith('+')) {
      if (phone.startsWith('226')) {
        phone = '+' + phone;
      } else if (phone.startsWith('0')) {
        phone = '+226' + phone.substring(1);
      } else if (/^\d{8}$/.test(phone)) {
        // Juste 8 chiffres = ajouter +226
        phone = '+226' + phone;
      } else {
        phone = '+226' + phone;
      }
    }

    // ✅ BLOCKER CHECK #5: Valider le format final
    if (!/^\+226\d{8}$/.test(phone)) {
      return Response.json(
        {
          success: false,
          step: 'sendOTP',
          error: 'Format invalide (attendu: +226XXXXXXXX)',
          received: body.phone,
          normalized: phone,
          expected_format: '+226XXXXXXXX',
        },
        { status: 400 }
      );
    }

    console.log(`[sendOTP] 📞 Envoi OTP vers ${phone}`);
    console.log(`[sendOTP] Service SID: ${verifyServiceSid.substring(0, 5)}...`);

    // Appel Twilio avec timeout
    const url = `https://verify.twilio.com/v2/Services/${verifyServiceSid}/Verifications`;
    const auth = btoa(`${accountSid}:${authToken}`);

    let response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: phone,
          Channel: 'sms',
        }).toString(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
    } catch (fetchErr) {
      // ✅ BLOCKER CHECK #6: Timeout ou erreur réseau
      if (fetchErr.name === 'AbortError') {
        console.error('[sendOTP] ❌ Timeout (>10s) calling Twilio API');
        return Response.json(
          {
            success: false,
            step: 'sendOTP',
            error: 'Timeout calling Twilio (network timeout)',
            phone: phone,
          },
          { status: 504 }
        );
      }
      throw fetchErr;
    }

    let data;
    try {
      data = await response.json();
    } catch (parseErr) {
      console.error('[sendOTP] ❌ Response not valid JSON:', parseErr);
      return Response.json(
        {
          success: false,
          step: 'sendOTP',
          error: 'Twilio returned invalid JSON',
          status: response.status,
        },
        { status: 502 }
      );
    }

    console.log(`[sendOTP] Response status: ${response.status}`);
    console.log(`[sendOTP] Response body:`, JSON.stringify(data));

    if (!response.ok) {
      console.error('[sendOTP] ❌ Erreur Twilio API:', response.status);
      return Response.json(
        {
          success: false,
          step: 'sendOTP',
          phone: phone,
          http_status: response.status,
          twilio_error_code: data?.code || 'unknown',
          twilio_message: data?.message || 'Unknown Twilio error',
          twilio_more_info: data?.more_info || null,
        },
        { status: response.status }
      );
    }

    // ✅ SUCCESS: Vérifier que SID existe
    if (!data?.sid) {
      console.error('[sendOTP] ❌ Pas de SID dans la réponse Twilio');
      return Response.json(
        {
          success: false,
          step: 'sendOTP',
          error: 'Invalid Twilio response (no SID)',
          phone: phone,
        },
        { status: 502 }
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
    console.error('[sendOTP] ⚠️ Exception:', error?.message || String(error));
    return Response.json(
      {
        success: false,
        step: 'sendOTP',
        error: error?.message || 'Unknown error',
        raw_error: String(error),
      },
      { status: 500 }
    );
  }
});