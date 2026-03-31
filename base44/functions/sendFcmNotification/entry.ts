/**
 * Fonction backend - Envoi de notifications FCM v1
 * Utilise le service account pour générer un access token OAuth2
 * et envoie via l'API FCM HTTP v1
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const PROJECT_ID = "cdl-app-4743c";
const FCM_URL = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

/**
 * Génère un access token OAuth2 via le service account (JWT)
 */
async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  };

  // Encode JWT header + payload
  const header = { alg: "RS256", typ: "JWT" };
  const encodeBase64Url = (obj) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const headerB64 = encodeBase64Url(header);
  const payloadB64 = encodeBase64Url(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  // Import private key RSA
  const pemKey = serviceAccount.private_key;
  const pemContents = pemKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `${signingInput}.${sigB64}`;

  // Échange JWT → access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("Impossible d'obtenir l'access token: " + JSON.stringify(tokenData));
  return tokenData.access_token;
}

/**
 * Envoie une notification FCM à un token spécifique
 */
async function sendToToken(accessToken, fcmToken, title, body, data = {}) {
  const res = await fetch(FCM_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        notification: { title, body },
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
        webpush: {
          notification: {
            icon: "https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg",
            badge: "https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg",
            vibrate: [200, 100, 200],
          },
        },
      },
    }),
  });

  const result = await res.json();
  return { ok: res.ok, result };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Payload : { user_email, title, body, data? }
    // OU      : { tokens: [...], title, body, data? }
    const { user_email, tokens: directTokens, title, body, data = {} } = await req.json();

    if (!title || !body) {
      return Response.json({ error: "title et body sont requis" }, { status: 400 });
    }

    const serviceAccount = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON"));
    const accessToken = await getAccessToken(serviceAccount);

    // Récupérer les tokens FCM
    let fcmTokens = directTokens || [];

    if (user_email && fcmTokens.length === 0) {
      const profiles = await base44.asServiceRole.entities.FcmToken.filter({ user_email });
      fcmTokens = profiles.map(p => p.token).filter(Boolean);
    }

    if (fcmTokens.length === 0) {
      return Response.json({ sent: 0, message: "Aucun token FCM trouvé" });
    }

    // Envoyer à tous les tokens
    const results = await Promise.allSettled(
      fcmTokens.map(token => sendToToken(accessToken, token, title, body, data))
    );

    const sent = results.filter(r => r.status === "fulfilled" && r.value.ok).length;
    const failed = results.length - sent;

    return Response.json({ sent, failed, total: fcmTokens.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});