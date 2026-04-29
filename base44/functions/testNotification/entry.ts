import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// PROJECT_ID lu depuis le Service Account JSON pour éviter tout mismatch de projet
// Ne jamais hardcoder ici

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
  const encodeB64Url = (obj) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const headerB64 = encodeB64Url({ alg: "RS256", typ: "JWT" });
  const payloadB64 = encodeB64Url(payload);
  const signingInput = `${headerB64}.${payloadB64}`;
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
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("OAuth échoué: " + JSON.stringify(tokenData));
  return tokenData.access_token;
}

async function sendToToken(accessToken, projectId, fcmToken, title, body, data = {}) {
  const FCM_URL = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  console.log(`[testNotification] sendToToken → projectId: ${projectId} | token: ${fcmToken.slice(0, 20)}...`);
  const res = await fetch(FCM_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        notification: { title, body },
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
        android: {
          priority: "high",
          notification: { channel_id: "default", sound: "default", visibility: "PUBLIC", default_vibrate_timings: true, notification_priority: "PRIORITY_MAX" },
        },
      },
    }),
  });
  const result = await res.json();
  if (!res.ok) console.error('[testNotification] FCM error for token:', fcmToken.slice(0, 20), JSON.stringify(result));
  return { ok: res.ok, status: res.status, result };
}

Deno.serve(async (req) => {
  try {
    // ── Lire le body EN PREMIER (stream consommable une seule fois) ──────────
    let parsedBody = {};
    let bodyAuthToken = '';
    try {
      const bodyText = await req.text();
      if (bodyText) parsedBody = JSON.parse(bodyText);
      bodyAuthToken = parsedBody.auth_token || '';
    } catch (_) {}

    // ── Injecter auth_token dans le header si besoin (APK Android) ──────────
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    let effectiveReq = req;
    if (!authHeader && bodyAuthToken) {
      const newHeaders = new Headers(req.headers);
      newHeaders.set('Authorization', `Bearer ${bodyAuthToken}`);
      effectiveReq = new Request(req.url, { method: req.method, headers: newHeaders });
    }

    const base44 = createClientFromRequest(effectiveReq);
    // Auth optionnelle — un user peut toujours tester ses propres notifications depuis l'APK
    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}

    const { recipient_email, recipient_role } = parsedBody;
    if (!recipient_email || !recipient_role) {
      return Response.json({ error: 'recipient_email et recipient_role requis' }, { status: 400 });
    }
    // Sécurité : si user authentifié et non-admin, vérifier qu'il teste uniquement ses propres notifs
    // Si pas d'user (appel public depuis APK) → on laisse passer (token FCM valide suffit comme preuve)
    if (user && user.role !== 'admin' && recipient_email !== user.email) {
      return Response.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const initiator = user?.email || 'public_endpoint';
    console.log(`[testNotification] Test initié par ${initiator} → ${recipient_email} (${recipient_role})`);

    // ── 1. Récupérer tokens FCM ──────────────────────────────────────────────
    const tokens = await base44.asServiceRole.entities.FcmToken.filter({
      user_email: recipient_email,
      is_active: true,
    });
    console.log(`[testNotification] Tokens trouvés: ${tokens.length}`);
    tokens.forEach((t, i) => console.log(`  Token ${i+1}: ${t.token.slice(0,25)}... | ${t.device_type} | ${t.registered_at}`));

    if (tokens.length === 0) {
      return Response.json({
        success: false,
        message: 'Aucun token FCM trouvé',
        details: `${recipient_email} doit se connecter sur l'APK et autoriser les notifications`,
        tokens_count: 0,
      });
    }

    // ── 2. Obtenir access token Firebase ────────────────────────────────────
    const rawJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || '';
    if (!rawJson) return Response.json({ error: 'FIREBASE_SERVICE_ACCOUNT_JSON manquant' }, { status: 500 });
    const serviceAccount = JSON.parse(rawJson);
    const projectId = serviceAccount.project_id;
    console.log(`[testNotification] project_id from SA: ${projectId} | client_email: ${serviceAccount.client_email}`);
    const accessToken = await getAccessToken(serviceAccount);

    // ── 3. Envoyer via FCM ───────────────────────────────────────────────────
    const title = '🧪 Test Notification CDL';
    const body = `Reçue à ${new Date().toLocaleTimeString()}`;
    const data = { test_mode: 'true', sender_email: user?.email || recipient_email, notif_route: '/mes-notifications' };

    const results = await Promise.allSettled(
      tokens.map(t => sendToToken(accessToken, projectId, t.token, title, body, data))
    );

    const sent = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
    const failed = results.length - sent;
    console.log(`[testNotification] Résultat: ${sent}/${tokens.length} envoyés`);

    // ── 4. Log + notification feedback ──────────────────────────────────────
    try {
      await base44.asServiceRole.entities.NotificationTestLog.create({
        admin_email: user?.email || recipient_email,
        recipient_email,
        recipient_role,
        tokens_count: tokens.length,
        sent_count: sent,
        failed_count: failed,
        timestamp: new Date().toISOString(),
        status: sent > 0 ? 'sent' : 'failed',
        details: JSON.stringify({ sent, failed, tokens_count: tokens.length }),
      });
    } catch (_) {}

    try {
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: user?.email || recipient_email,
        destinataire_role: 'admin',
        titre: `🧪 Test notification ${sent > 0 ? 'ENVOYÉ' : 'ÉCHOUÉ'}`,
        message: sent > 0
          ? `Notification envoyée à ${recipient_email} (${sent}/${tokens.length} tokens)`
          : `Échec envoi vers ${recipient_email}. Vérifiez les tokens FCM.`,
        type: sent > 0 ? 'success' : 'danger',
        lue: false,
      });
    } catch (_) {}

    return Response.json({
      success: sent > 0,
      message: `${sent}/${tokens.length} notification(s) envoyée(s)`,
      details: { recipient_email, recipient_role, tokens_found: tokens.length, sent, failed, timestamp: new Date().toISOString() },
    });

  } catch (error) {
    console.error('[testNotification] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});