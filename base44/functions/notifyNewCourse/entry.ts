/**
 * notifyNewCourse — Automation entity Course (create)
 *
 * RÔLE : Notifier le client que sa demande est reçue + notifier les admins.
 * 
 * ⚠️ Ce handler NE notifie PAS les livreurs directement.
 * La notification au livreur ciblé est gérée par autoDispatch (dispatch ciblé).
 * 
 * Aligné sur l'architecture multi-profils CDL :
 *   - driver_online + current_role + profil_valide (jamais disponible/user_type)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

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

async function sendFcmPush(accessToken, fcmToken, title, body, route, isHigh = false) {
  const res = await fetch(FCM_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        notification: { title, body },
        data: { route, notif_route: route },
        android: {
          priority: isHigh ? 'HIGH' : 'NORMAL',
          notification: {
            channel_id: 'cdl_courses',
            color: '#1a73e8',
            notification_priority: isHigh ? 'PRIORITY_HIGH' : 'PRIORITY_DEFAULT',
            visibility: 'PUBLIC',
          },
        },
        webpush: {
          notification: {
            icon: "https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg",
            badge: "https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg",
            vibrate: isHigh ? [300, 100, 300, 100, 300] : [200, 100, 200],
            requireInteraction: isHigh,
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

async function notifyAndPush(base44, accessToken, { email, role, titre, message, type, route, courseId, isHigh = false }) {
  // 1. Notification DB (in-app fallback)
  await base44.asServiceRole.entities.Notification.create({
    destinataire_email: email,
    destinataire_role: role,
    titre,
    message,
    type,
    lue: false,
    ...(courseId ? { course_id: courseId, target_entity_id: courseId, target_entity_type: 'course' } : {}),
    ...(route ? { target_screen: route } : {}),
  }).catch(() => {});

  // 2. FCM push
  if (!accessToken) return;
  const tokenRecords = await base44.asServiceRole.entities.FcmToken.filter({ user_email: email });
  const tokens = tokenRecords.map(r => r.token).filter(Boolean);
  if (tokens.length === 0) return;

  const results = await Promise.allSettled(
    tokens.map(t => sendFcmPush(accessToken, t, titre, message, route, isHigh))
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value?.invalidToken && tokenRecords[i]?.id) {
      await base44.asServiceRole.entities.FcmToken.delete(tokenRecords[i].id).catch(() => {});
    }
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const course = body.data;

    if (!course) return Response.json({ skipped: true, reason: 'no_data' });
    // Ne traiter que les nouvelles courses en attente
    if (!['en_attente', 'en_attente_dispatch'].includes(course.statut)) {
      return Response.json({ skipped: true, reason: 'not_en_attente' });
    }

    let accessToken = null;
    const rawJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") || '';
    if (rawJson) {
      const serviceAccount = JSON.parse(rawJson);
      accessToken = await getAccessToken(serviceAccount).catch(() => null);
    }

    const courseRoute = `/course/${course.id}`;
    const tasks = [];

    // ── 1. Notifier le CLIENT : confirmation de réception ────────────────────
    if (course.client_email) {
      tasks.push(notifyAndPush(base44, accessToken, {
        email: course.client_email,
        role: 'client',
        titre: '📦 Demande reçue !',
        message: `Votre demande a été envoyée. Recherche d'un livreur en cours pour ${course.quartier_depart} → ${course.quartier_arrivee}.`,
        type: 'info',
        route: courseRoute,
        courseId: course.id,
        isHigh: false,
      }));
    }

    // ── 2. Notifier les ADMINS : nouvelle course à dispatcher ────────────────
    const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' }).catch(() => []);
    for (const admin of admins.slice(0, 3)) {
      tasks.push(notifyAndPush(base44, accessToken, {
        email: admin.email,
        role: 'admin',
        titre: '📋 Nouvelle course en attente',
        message: `${course.quartier_depart} → ${course.quartier_arrivee} · ${course.type_colis} · ${course.prix} FCFA`,
        type: 'info',
        route: '/dispatch-monitor',
        courseId: course.id,
        isHigh: false,
      }));
    }

    await Promise.allSettled(tasks);
    console.log(`[notifyNewCourse] Course ${course.id} — client + ${admins.length} admins notifiés`);
    return Response.json({ success: true, sent: tasks.length });

  } catch (error) {
    console.error('[notifyNewCourse] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});