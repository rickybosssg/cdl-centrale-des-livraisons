/**
 * notifyUser — Fonction centralisée pour envoyer une notification
 * 
 * 1. Crée toujours la notification en base (DB) pour fallback in-app
 * 2. Envoie FCM push si l'utilisateur a un token (app fermée / background)
 * 3. Si pas de token FCM, la notif DB sera affichée à la réouverture
 * 
 * Payload:
 * {
 *   user_email: string,           // Email du destinataire
 *   role: string,                 // Rôle du destinataire (client, livreur, etc.)
 *   titre: string,                // Titre de la notification
 *   message: string,              // Corps du message
 *   type: "success"|"info"|"warning"|"danger",
 *   priority: "normal"|"high",    // high = requireInteraction sur mobile
 *   course_id?: string,           // ID de la course liée (optionnel)
 *   route?: string,               // Route de navigation au clic
 *   data?: object,                // Données supplémentaires
 * }
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
  const encodeB64Url = (obj) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const headerB64 = encodeB64Url(header);
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
  if (!tokenData.access_token) throw new Error("Token OAuth manquant: " + JSON.stringify(tokenData));
  return tokenData.access_token;
}

// Canaux Android par type de notification
function getAndroidChannel(type) {
  if (['new_course', 'course_cancelled', 'course_issue', 'admin'].includes(type)) return 'cdl_courses';
  if (type === 'new_message') return 'cdl_messages';
  if (['bedou_recharge', 'bedou_retrait', 'bedou'].includes(type)) return 'cdl_bedou';
  if (['profile_validated', 'profile_rejected'].includes(type)) return 'cdl_admin';
  if (type === 'commande') return 'cdl_mall';
  return 'cdl_general';
}

// Résoudre la route deep link
function resolveRoute(data) {
  if (data.route && data.route.startsWith('/')) return data.route;
  switch (data.type) {
    case 'new_course': case 'course_accepted': case 'course_update': case 'course_cancelled':
      return data.courseId ? `/course/${data.courseId}` : '/mes-courses';
    case 'course_tracking': return data.courseId ? `/course/${data.courseId}/track` : '/mes-courses';
    case 'new_message': return '/mes-messages';
    case 'profile_validated': case 'profile_rejected': return '/settings';
    case 'bedou_recharge': case 'bedou_retrait': case 'bedou': return '/mon-bedou';
    case 'course_issue': return '/gestion-signalements';
    case 'admin': return '/admin-dashboard';
    case 'commande': return data.commandeId ? `/commande-marketplace/${data.commandeId}` : '/mes-commandes-marketplace';
    default: return '/';
  }
}

async function sendFcmPush(accessToken, fcmToken, title, body, data = {}) {
  const isHighPriority = data.priority === 'high' || ['new_course', 'course_cancelled', 'course_issue'].includes(data.type);
  const channelId = getAndroidChannel(data.type || '');
  const route = resolveRoute(data);
  
  // S'assurer que route est dans les data (pour le SW)
  const enrichedData = {
    ...data,
    route,
    channelId,
  };

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
        data: Object.fromEntries(Object.entries(enrichedData).map(([k, v]) => [k, String(v || '')])),
        // Config Android : vraie notification push système
        android: {
          priority: isHighPriority ? 'HIGH' : 'NORMAL',
          notification: {
            channel_id: channelId,
            icon: 'notification_icon',
            color: '#1a73e8',
            sound: isHighPriority ? 'cdl_alert' : 'default',
            vibrate_timings_millis: isHighPriority ? [0, 300, 100, 300, 100, 300] : [0, 200, 100, 200],
            notification_priority: isHighPriority ? 'PRIORITY_HIGH' : 'PRIORITY_DEFAULT',
            visibility: 'PUBLIC',
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
          },
        },
        // Config Web / PWA
        webpush: {
          headers: { Urgency: isHighPriority ? 'high' : 'normal' },
          notification: {
            icon: "https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg",
            badge: "https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg",
            vibrate: isHighPriority ? [300, 100, 300, 100, 300] : [200, 100, 200],
            requireInteraction: isHighPriority,
            renotify: true,
            tag: `cdl-${data.type || 'notif'}-${data.courseId || Date.now()}`,
          },
          fcm_options: { link: route },
        },
        // Config APNs (iOS) si nécessaire
        apns: {
          headers: { 'apns-priority': isHighPriority ? '10' : '5' },
          payload: {
            aps: {
              sound: isHighPriority ? 'default' : null,
              badge: 1,
              'content-available': 1,
            },
          },
        },
      },
    }),
  });
  const result = await res.json();
  if (!res.ok) {
    // Token invalide ou expiré → le supprimer
    if (result?.error?.code === 404 || result?.error?.details?.[0]?.errorCode === 'UNREGISTERED') {
      return { ok: false, invalidToken: true };
    }
    console.error('[notifyUser] FCM error:', JSON.stringify(result));
  }
  return { ok: res.ok, result };
}

Deno.serve(async (req) => {
  let body = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }

  const { user_email, role, titre, message, type = "info", priority = "normal", course_id, route,
          target_screen, target_entity_id, target_entity_type, target_section, data = {} } = body;

  if (!user_email || !titre || !message) {
    return Response.json({ error: "user_email, titre et message requis" }, { status: 400 });
  }

  try {
    const base44 = createClientFromRequest(req);

    // 1. TOUJOURS créer la notification en base (fallback in-app)
    const notifData = {
      destinataire_email: user_email,
      destinataire_role: role || "user",
      titre,
      message,
      type,
      lue: false,
      ...(course_id ? { course_id } : {}),
      // Deep-link fields
      ...(target_screen ? { target_screen } : route ? { target_screen: route } : {}),
      ...(target_entity_id ? { target_entity_id } : course_id ? { target_entity_id: course_id } : {}),
      ...(target_entity_type ? { target_entity_type } : course_id ? { target_entity_type: 'course' } : {}),
      ...(target_section ? { target_section } : {}),
    };
    await base44.asServiceRole.entities.Notification.create(notifData);

    // 2. Récupérer tokens FCM de l'utilisateur
    const fcmTokenRecords = await base44.asServiceRole.entities.FcmToken.filter({ user_email });
    const fcmTokens = fcmTokenRecords.map(r => r.token).filter(Boolean);

    if (fcmTokens.length === 0) {
      // Pas de token FCM, la notif DB sera affichée à la réouverture
      return Response.json({ success: true, db: true, push: false, reason: "no_fcm_token" });
    }

    // 3. Envoyer FCM push
    const rawJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") || '';
    if (!rawJson) {
      return Response.json({ success: true, db: true, push: false, reason: "no_service_account" });
    }
    const serviceAccount = JSON.parse(rawJson);
    const accessToken = await getAccessToken(serviceAccount);

    const pushData = {
      type: data.type || "notification",
      priority,
      ...(course_id ? { courseId: course_id } : {}),
      ...(route ? { route } : {}),
      ...data,
    };

    const results = await Promise.allSettled(
      fcmTokens.map(token => sendFcmPush(accessToken, token, titre, message, pushData))
    );

    // Nettoyer les tokens invalides
    const invalidTokens = results
      .map((r, i) => ({ result: r, token: fcmTokens[i], record: fcmTokenRecords[i] }))
      .filter(({ result }) => result.status === 'fulfilled' && result.value?.invalidToken);
    
    for (const { record } of invalidTokens) {
      if (record?.id) {
        await base44.asServiceRole.entities.FcmToken.delete(record.id).catch(() => {});
      }
    }

    const sent = results.filter(r => r.status === "fulfilled" && r.value?.ok).length;

    return Response.json({ success: true, db: true, push: true, sent, total: fcmTokens.length });
  } catch (error) {
    console.error('[notifyUser] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});