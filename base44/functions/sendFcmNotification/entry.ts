import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// PROJECT_ID est lu depuis le Service Account JSON pour éviter tout mismatch
// Ne pas hardcoder ici — le SA JSON contient toujours le bon project_id

async function getAccessToken(serviceAccount) {
  console.log('[getAccessToken] START — Generating JWT for:', serviceAccount.client_email);
  
  // Validate service account
  if (!serviceAccount.private_key || !serviceAccount.client_email || !serviceAccount.project_id) {
    throw new Error('Service Account JSON invalid: missing private_key, client_email, or project_id');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  };

  const header = { alg: "RS256", typ: "JWT" };
  const encodeB64Url = (obj) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const headerB64 = encodeB64Url(header);
  const payloadB64 = encodeB64Url(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  console.log('[getAccessToken] JWT payload:', JSON.stringify(payload));

  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `${signingInput}.${sigB64}`;
  console.log('[getAccessToken] JWT generated (length:', jwt.length, ')');

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  
  if (!tokenRes.ok) {
    console.error('[getAccessToken] OAuth ERROR:', {
      status: tokenRes.status,
      statusText: tokenRes.statusText,
      full_response: tokenData,
      error_code: tokenData?.error,
      error_description: tokenData?.error_description
    });
    throw new Error(`OAuth 403 Error: ${tokenData?.error || tokenRes.statusText} — ${tokenData?.error_description || 'Check Service Account JSON permissions in Google Cloud Console'}`);
  }

  if (!tokenData.access_token) {
    throw new Error("Impossible d'obtenir l'access token: " + JSON.stringify(tokenData));
  }
  
  console.log('[getAccessToken] ✅ Access token obtained');
  return tokenData.access_token;
}

async function sendToToken(accessToken, projectId, fcmToken, title, body, data = {}) {
  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  console.log(`[sendFcmNotification] sendToToken → projectId: ${projectId} | token: ${fcmToken.slice(0, 20)}...`);

  // ── ARCHITECTURE DATA-ONLY (meilleure formule pour APK fermé) ────────────────
  // On n'envoie PAS de bloc "notification" → c'est un Data Message pur.
  // Android FCM le délivre même app fermée avec priority HIGH.
  // Le plugin Capacitor PushNotifications construit et affiche la notif système
  // via le handler natif (FCMMessagingService) en lisant les champs du data.
  // Avantage : notif_route est préservé dans le data même à froid.
  const dataPayload = {
    title,
    body,
    ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
  };

  const res = await fetch(fcmUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        // PAS de bloc "notification" → Data-Only message
        data: dataPayload,
        android: {
          priority: "high",
          ttl: "86400s", // 24h de TTL si le téléphone est éteint
          direct_boot_ok: true, // livraison même avant déverrouillage
          data: {
            channel_id: "default",
          },
        },
      },
    }),
  });

  let result;
  try {
    result = await res.json();
  } catch (e) {
    console.error(`[sendFcmNotification] JSON parse error:`, e.message);
    return { ok: false, result: { error: `Invalid response: ${res.statusText}` } };
  }

  if (!res.ok) {
    // FULL error response logging
    console.error(`[sendFcmNotification] FCM HTTP ${res.status} ERROR:`, {
      status: res.status,
      statusText: res.statusText,
      full_response: result,
      error_code: result?.error?.code,
      error_message: result?.error?.message,
      error_details: result?.error?.details,
    });
  } else {
    console.log(`[sendFcmNotification] FCM OK (200) → messageId: ${result?.name}`);
  }
  return { ok: res.ok, status: res.status, result };
}

Deno.serve(async (req) => {
  try {
    // ── Lire le body AVANT tout (stream ne peut être consommé qu'une fois) ──
    let parsedBody = {};
    let bodyAuthToken = '';
    try {
      const bodyText = await req.text();
      if (bodyText) parsedBody = JSON.parse(bodyText);
      bodyAuthToken = parsedBody.auth_token || '';
    } catch(_) {}

    // ── Injecter auth_token dans le header si besoin (APK Android) ──────────
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    let effectiveReq = req;
    if (!authHeader && bodyAuthToken) {
      const newHeaders = new Headers(req.headers);
      newHeaders.set('Authorization', `Bearer ${bodyAuthToken}`);
      effectiveReq = new Request(req.url, { method: req.method, headers: newHeaders });
    }

    const base44 = createClientFromRequest(effectiveReq);
    const { user_email, tokens: directTokens, title, body, data = {} } = parsedBody;

    if (!title || !body) {
      return Response.json({ error: "title et body sont requis" }, { status: 400 });
    }

    const rawJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") || '';
    if (!rawJson) {
      return Response.json({ error: 'FIREBASE_SERVICE_ACCOUNT_JSON manquant' }, { status: 500 });
    }
    const serviceAccount = JSON.parse(rawJson);
    const projectId = serviceAccount.project_id;
    console.log(`[sendFcmNotification] project_id from SA: ${projectId} | client_email: ${serviceAccount.client_email}`);
    const accessToken = await getAccessToken(serviceAccount);

    let fcmTokens = directTokens || [];
    if (user_email && fcmTokens.length === 0) {
      const profiles = await base44.asServiceRole.entities.FcmToken.filter({
        user_email,
        is_active: true,
      });
      fcmTokens = profiles.map(p => p.token).filter(Boolean);
      console.log(`[sendFcmNotification] Tokens trouvés pour ${user_email}:`, fcmTokens.length);
    }

    if (fcmTokens.length === 0) {
      console.warn(`[sendFcmNotification] ⚠️ Aucun token FCM pour ${user_email}`);
      return Response.json({
        sent: 0,
        message: `Aucun token FCM trouvé pour ${user_email}`,
        note: 'L\'utilisateur doit être connecté et avoir autorisé les notifications',
      });
    }

    const results = await Promise.allSettled(
      fcmTokens.map(token => sendToToken(accessToken, projectId, token, title, body, data))
    );

    const sent = results.filter(r => r.status === "fulfilled" && r.value.ok).length;
    const failed = results.length - sent;

    // Nettoyer les tokens invalides (UNREGISTERED / NOT_FOUND) côté Firebase
    const tokensToDisable = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled' && !r.value.ok) {
        const errCode = r.value.result?.error?.details?.[0]?.errorCode || '';
        if (errCode === 'UNREGISTERED' || errCode === 'INVALID_ARGUMENT') {
          tokensToDisable.push(fcmTokens[i]);
        }
      }
    }
    if (tokensToDisable.length > 0) {
      console.log(`[sendFcmNotification] Désactivation de ${tokensToDisable.length} token(s) invalide(s)`);
      for (const t of tokensToDisable) {
        const records = await base44.asServiceRole.entities.FcmToken.filter({ token: t });
        if (records?.[0]) {
          await base44.asServiceRole.entities.FcmToken.update(records[0].id, { is_active: false });
        }
      }
    }

    return Response.json({ sent, failed, total: fcmTokens.length });
  } catch (error) {
    console.error('sendFcmNotification error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});