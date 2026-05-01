/**
 * testOAuth2 — Debug OAuth2 JWT generation and token exchange
 * Call this to diagnose 403 errors
 */

function base64url(data) {
  let base64;
  if (typeof data === 'string') {
    base64 = btoa(unescape(encodeURIComponent(data)));
  } else {
    base64 = btoa(String.fromCharCode(...data));
  }
  return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

Deno.serve(async (req) => {
  try {
    console.log('[testOAuth2] START — Diagnostic OAuth2');

    const rawJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || '';
    if (!rawJson) {
      return Response.json({ error: 'FIREBASE_SERVICE_ACCOUNT_JSON not set' }, { status: 500 });
    }

    let sa;
    try {
      sa = JSON.parse(rawJson);
    } catch (e) {
      return Response.json({ error: 'JSON parse error: ' + e.message }, { status: 500 });
    }

    console.log('[testOAuth2] Service Account loaded');
    console.log('[testOAuth2] project_id:', sa.project_id);
    console.log('[testOAuth2] client_email:', sa.client_email);
    console.log('[testOAuth2] client_id:', sa.client_id);
    console.log('[testOAuth2] private_key_id:', sa.private_key_id);
    console.log('[testOAuth2] private_key length:', sa.private_key?.length);
    console.log('[testOAuth2] private_key starts with:', sa.private_key?.substring(0, 50));

    // ── Build JWT header ───────────────────────────────────────────────────────
    const header = { alg: 'RS256', typ: 'JWT', kid: sa.private_key_id };
    const headerB64 = base64url(JSON.stringify(header));
    console.log('[testOAuth2] Header:', header);
    console.log('[testOAuth2] Header B64:', headerB64);

    // ── Build JWT payload ──────────────────────────────────────────────────────
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: sa.client_email,
      sub: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    };
    const payloadB64 = base64url(JSON.stringify(payload));
    console.log('[testOAuth2] Payload:', payload);
    console.log('[testOAuth2] Payload B64:', payloadB64);

    const signingInput = `${headerB64}.${payloadB64}`;

    // ── Parse private key ──────────────────────────────────────────────────────
    const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\r\n|\n|\r/g, '');
    console.log('[testOAuth2] PEM length after cleanup:', pem.length);
    console.log('[testOAuth2] PEM first 50 chars:', pem.substring(0, 50));

    let binaryKey;
    try {
      binaryKey = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
      console.log('[testOAuth2] Binary key decoded, length:', binaryKey.length);
    } catch (e) {
      console.error('[testOAuth2] Failed to decode PEM:', e.message);
      return Response.json({ error: 'PEM decode failed: ' + e.message }, { status: 500 });
    }

    // ── Import crypto key ──────────────────────────────────────────────────────
    let cryptoKey;
    try {
      cryptoKey = await crypto.subtle.importKey(
        'pkcs8',
        binaryKey.buffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
      );
      console.log('[testOAuth2] ✅ Crypto key imported successfully (RS256)');
    } catch (e) {
      console.error('[testOAuth2] Failed to import key:', e.message);
      return Response.json({ error: 'Key import failed: ' + e.message }, { status: 500 });
    }

    // ── Sign JWT ───────────────────────────────────────────────────────────────
    let signatureBuffer;
    try {
      signatureBuffer = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        new TextEncoder().encode(signingInput)
      );
      console.log('[testOAuth2] ✅ JWT signed successfully');
    } catch (e) {
      console.error('[testOAuth2] Failed to sign:', e.message);
      return Response.json({ error: 'Signing failed: ' + e.message }, { status: 500 });
    }

    const sigB64 = base64url(new Uint8Array(signatureBuffer));
    const jwt = `${signingInput}.${sigB64}`;
    console.log('[testOAuth2] JWT length:', jwt.length);
    console.log('[testOAuth2] JWT preview:', jwt.substring(0, 100) + '...');

    // ── Exchange JWT for access token ──────────────────────────────────────────
    console.log('[testOAuth2] Sending to: https://oauth2.googleapis.com/token');
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    const tokenData = await tokenRes.json();

    console.log('[testOAuth2] Response status:', tokenRes.status);
    console.log('[testOAuth2] Response body:', JSON.stringify(tokenData, null, 2));

    if (tokenRes.ok && tokenData.access_token) {
      console.log('[testOAuth2] ✅ SUCCESS — access token obtained');
      return Response.json({
        success: true,
        access_token: tokenData.access_token.substring(0, 50) + '...',
        expires_in: tokenData.expires_in,
        token_type: tokenData.token_type,
      });
    } else {
      console.error('[testOAuth2] ❌ FAILED');
      return Response.json({
        success: false,
        status: tokenRes.status,
        error: tokenData.error,
        error_description: tokenData.error_description,
        error_uri: tokenData.error_uri,
        raw_response: tokenData,
      }, { status: tokenRes.status || 500 });
    }

  } catch (error) {
    console.error('[testOAuth2] EXCEPTION:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});