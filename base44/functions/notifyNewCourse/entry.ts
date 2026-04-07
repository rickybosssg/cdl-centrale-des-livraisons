import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * notifyNewCourse — Automation entity Course (create)
 * Notifie tous les livreurs disponibles + validés via DB ET FCM push
 */

const PROJECT_ID = "cdl-app-4743c";
const FCM_URL = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

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
  const header = { alg: "RS256", typ: "JWT" };
  const enc = (obj) => btoa(JSON.stringify(obj)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  const signingInput = `${enc(header)}.${enc(payload)}`;
  const pemContents = serviceAccount.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g,"");
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", binaryKey, { name:"RSASSA-PKCS1-v1_5", hash:"SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  const jwt = `${signingInput}.${sigB64}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("Token OAuth manquant");
  return tokenData.access_token;
}

async function sendFcmPush(accessToken, fcmToken, title, body, route) {
  const res = await fetch(FCM_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        notification: { title, body },
        data: { route, notif_route: route },
        android: {
          priority: 'HIGH',
          notification: {
            channel_id: 'cdl_courses',
            color: '#1a73e8',
            notification_priority: 'PRIORITY_HIGH',
            visibility: 'PUBLIC',
          },
        },
        webpush: {
          notification: {
            icon: "https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg",
            vibrate: [300, 100, 300, 100, 300],
            requireInteraction: true,
          },
          fcm_options: { link: route },
        },
      },
    }),
  });
  const result = await res.json();
  const invalidToken = !res.ok && (result?.error?.code === 404 || result?.error?.details?.[0]?.errorCode === 'UNREGISTERED');
  return { ok: res.ok, invalidToken };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const course = body.data;

    if (!course || course.statut !== 'en_attente') {
      return Response.json({ skipped: true });
    }

    // Récupérer livreurs disponibles + validés non bloqués
    const livreurs = await base44.asServiceRole.entities.User.filter({
      disponible: true,
      statut_validation_livreur: 'valide',
    });
    const livreursActifs = livreurs.filter(l => !l.livreur_bloque);

    if (livreursActifs.length === 0) {
      return Response.json({ notified: 0, reason: 'no_available_driver' });
    }

    const titre = '🛵 Nouvelle course disponible !';
    const message = `${course.quartier_depart} → ${course.quartier_arrivee} · ${course.type_colis}${course.prix ? ` · ${course.prix} FCFA` : ''}`;
    const route = `/courses-disponibles`;

    // Obtenir access token FCM
    let accessToken = null;
    const rawJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") || '';
    if (rawJson) {
      const serviceAccount = JSON.parse(rawJson);
      accessToken = await getAccessToken(serviceAccount).catch(() => null);
    }

    // Pour chaque livreur : DB + FCM
    const tasks = livreursActifs.map(async (livreur) => {
      // 1. Notif DB
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: livreur.email,
        destinataire_role: 'livreur',
        titre,
        message,
        type: 'success',
        lue: false,
        course_id: course.id,
        target_entity_id: course.id,
        target_entity_type: 'course',
        target_screen: route,
      });

      // 2. FCM push
      if (!accessToken) return;
      const tokenRecords = await base44.asServiceRole.entities.FcmToken.filter({ user_email: livreur.email });
      const tokens = tokenRecords.map(r => r.token).filter(Boolean);

      const results = await Promise.allSettled(
        tokens.map(t => sendFcmPush(accessToken, t, titre, message, route))
      );

      // Nettoyer tokens invalides
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status === 'fulfilled' && r.value?.invalidToken && tokenRecords[i]?.id) {
          await base44.asServiceRole.entities.FcmToken.delete(tokenRecords[i].id).catch(() => {});
        }
      }
    });

    await Promise.allSettled(tasks);
    console.log(`[notifyNewCourse] ${livreursActifs.length} livreurs notifiés (DB+FCM)`);
    return Response.json({ notified: livreursActifs.length });

  } catch (error) {
    console.error('[notifyNewCourse] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});