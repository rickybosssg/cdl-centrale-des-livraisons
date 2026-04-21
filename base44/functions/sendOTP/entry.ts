/**
 * sendOTP — Envoyer un code OTP via Twilio Verify
 * Si le préfixe SMS est bloqué (60410), fallback automatique sur appel vocal
 */
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ success: false, error: 'Method must be POST' }, { status: 405 });
  }

  let body;
  try { body = await req.json(); }
  catch (e) { return Response.json({ success: false, error: 'Invalid JSON body' }, { status: 400 }); }

  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN');
  const verifySid  = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

  console.log('[sendOTP] CONFIG — accountSid:', !!accountSid, '| authToken:', !!authToken, '| verifySid:', !!verifySid);

  if (!accountSid || !authToken || !verifySid) {
    return Response.json({
      success: false,
      error: 'Configuration Twilio manquante',
      missing: { accountSid: !accountSid, authToken: !authToken, verifySid: !verifySid }
    }, { status: 500 });
  }

  let phone = (body?.phone || '').trim().replace(/\s/g, '');
  if (!phone) return Response.json({ success: false, error: 'phone requis' }, { status: 400 });

  // Normalisation
  if (/^\d{8}$/.test(phone))         phone = '+226' + phone;
  else if (/^226\d{8}$/.test(phone)) phone = '+' + phone;
  else if (/^0\d{7}$/.test(phone))   phone = '+226' + phone.substring(1);
  else if (!phone.startsWith('+'))   phone = '+226' + phone;

  if (!/^\+\d{7,15}$/.test(phone)) {
    return Response.json({
      success: false,
      error: 'Format numéro invalide (attendu: +226XXXXXXXX)',
      received: body.phone,
      normalized: phone
    }, { status: 400 });
  }

  console.log('[sendOTP] Envoi OTP vers:', phone);

  const url  = `https://verify.twilio.com/v2/Services/${verifySid}/Verifications`;
  const auth = btoa(`${accountSid}:${authToken}`);

  // Essayer d'abord SMS, puis call en fallback si préfixe bloqué
  const channels = ['sms', 'call'];

  for (const channel of channels) {
    console.log(`[sendOTP] Tentative canal: ${channel}`);

    let res;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: phone, Channel: channel }).toString(),
        signal: ctrl.signal,
      });
      clearTimeout(t);
    } catch (err) {
      if (err.name === 'AbortError') {
        return Response.json({ success: false, error: 'Timeout réseau Twilio (>12s)', phone }, { status: 504 });
      }
      throw err;
    }

    let data;
    try { data = await res.json(); }
    catch { return Response.json({ success: false, error: 'Réponse Twilio invalide', http_status: res.status }, { status: 502 }); }

    console.log(`[sendOTP] Twilio ${channel} → HTTP ${res.status} | code: ${data?.code} | status: ${data?.status} | SID: ${data?.sid || 'N/A'}`);

    if (res.ok && data?.sid) {
      // Succès
      return Response.json({
        success: true,
        phone,
        channel_used: channel,
        message: channel === 'call'
          ? 'Vous allez recevoir un appel vocal avec le code'
          : 'Code OTP envoyé par SMS',
        sid: data.sid,
      });
    }

    // Erreur 60410 = préfixe bloqué SMS → tenter call
    if (data?.code === 60410 && channel === 'sms') {
      console.warn(`[sendOTP] ⚠️ Préfixe SMS bloqué (60410) pour ${phone} — tentative appel vocal...`);
      continue;
    }

    // Toute autre erreur → retourner directement
    return Response.json({
      success: false,
      phone,
      channel_tried: channel,
      twilio_error_code: data?.code,
      twilio_message: data?.message || 'Erreur Twilio inconnue',
      twilio_more_info: data?.more_info,
      http_status: res.status,
    }, { status: res.status >= 400 ? res.status : 400 });
  }

  // Si on arrive ici, les 2 canaux ont échoué
  return Response.json({
    success: false,
    phone,
    error: 'Impossible d\'envoyer le code (SMS et appel vocal tous deux bloqués pour ce préfixe)',
    suggestion: 'Contactez l\'équipe CDL pour débloquer votre numéro'
  }, { status: 403 });
});