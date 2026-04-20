/**
 * checkTwilioSecrets — Vérifier que les secrets Twilio sont définis
 * PUBLIQUE — diagnostic seulement
 */
Deno.serve(async (req) => {
  try {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const verifySid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');
    const appId = Deno.env.get('BASE44_APP_ID');

    const result = {
      appId: appId || null,
      accountSid: !!accountSid,
      authToken: !!authToken,
      verifySid: !!verifySid,
      allDefined: !!accountSid && !!authToken && !!verifySid,
      timestamp: new Date().toISOString(),
    };

    console.log('[checkTwilioSecrets]', result);

    return Response.json(result);
  } catch (error) {
    console.error('[checkTwilioSecrets] Error:', error.message);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
});