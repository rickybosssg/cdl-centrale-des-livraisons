import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * notifyCourseStatus — Automation entity Course (update)
 * Envoie notifications DB + FCM push au client/livreur/admin
 * selon le changement de statut de la course.
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
  if (!tokenData.access_token) throw new Error("Token OAuth manquant: " + JSON.stringify(tokenData));
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
        data: { route: route || '/', notif_route: route || '/' },
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
            vibrate: isHigh ? [300, 100, 300] : [200, 100, 200],
            requireInteraction: isHigh,
          },
          fcm_options: { link: route || '/' },
        },
      },
    }),
  });
  const result = await res.json();
  const invalidToken = !res.ok && (result?.error?.code === 404 || result?.error?.details?.[0]?.errorCode === 'UNREGISTERED');
  return { ok: res.ok, invalidToken };
}

async function notifyAndPush(base44, accessToken, { email, role, titre, message, type, route, courseId, isHigh }) {
  // 1. Notification DB (fallback in-app)
  await base44.asServiceRole.entities.Notification.create({
    destinataire_email: email,
    destinataire_role: role,
    titre,
    message,
    type,
    lue: false,
    ...(courseId ? { course_id: courseId, target_entity_id: courseId, target_entity_type: 'course' } : {}),
    ...(route ? { target_screen: route } : {}),
  });

  // 2. FCM push
  if (!accessToken) return;
  const tokenRecords = await base44.asServiceRole.entities.FcmToken.filter({ user_email: email });
  const tokens = tokenRecords.map(r => r.token).filter(Boolean);
  if (tokens.length === 0) return;

  const results = await Promise.allSettled(
    tokens.map(t => sendFcmPush(accessToken, t, titre, message, route, isHigh))
  );

  // Nettoyer tokens invalides
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
    const oldCourse = body.old_data;

    if (!course || !oldCourse) return Response.json({ skipped: true });

    const oldStatut = oldCourse.statut;
    const newStatut = course.statut;
    if (oldStatut === newStatut) return Response.json({ skipped: true, reason: 'no_status_change' });

    // Obtenir access token FCM
    let accessToken = null;
    const rawJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") || '';
    if (rawJson) {
      const serviceAccount = JSON.parse(rawJson);
      accessToken = await getAccessToken(serviceAccount).catch(() => null);
    }

    const tasks = [];
    const courseRoute = `/course/${course.id}`;
    const trackRoute = `/course/${course.id}/track`;

    // ── NOTIFICATIONS CLIENT ──────────────────────────────────────────────────
    if (course.client_email) {
      const base = { email: course.client_email, role: 'client', courseId: course.id };

      if (newStatut === 'assignee_attente') {
        tasks.push(notifyAndPush(base44, accessToken, { ...base,
          titre: '🔍 Livreur en cours de recherche...',
          message: `Nous recherchons un livreur pour ${course.quartier_depart} → ${course.quartier_arrivee}.`,
          type: 'info', route: courseRoute,
        }));
      } else if (newStatut === 'acceptee') {
        tasks.push(notifyAndPush(base44, accessToken, { ...base,
          titre: '✅ Livreur trouvé !',
          message: `${course.livreur_name || 'Votre livreur'} a accepté votre course et arrive pour récupérer le colis.`,
          type: 'success', route: trackRoute, isHigh: true,
        }));
      } else if (newStatut === 'en_cours') {
        tasks.push(notifyAndPush(base44, accessToken, { ...base,
          titre: '🚀 Colis en route !',
          message: `${course.livreur_name || 'Votre livreur'} est en route vers la destination.`,
          type: 'info', route: trackRoute, isHigh: true,
        }));
      } else if (newStatut === 'livree') {
        tasks.push(notifyAndPush(base44, accessToken, { ...base,
          titre: '📦 Course terminée ! Notez votre livreur',
          message: `Votre colis a été livré avec succès. Touchez pour noter votre livreur ⭐`,
          type: 'success', route: courseRoute, isHigh: true,
        }));
      } else if (newStatut === 'aucun_livreur') {
        tasks.push(notifyAndPush(base44, accessToken, { ...base,
          titre: '😔 Aucun livreur disponible',
          message: `Aucun livreur disponible pour le moment. Augmentez le prix ou réessayez plus tard.`,
          type: 'warning', route: courseRoute,
        }));
      } else if (newStatut === 'annulee') {
        tasks.push(notifyAndPush(base44, accessToken, { ...base,
          titre: '❌ Course annulée',
          message: `Votre course ${course.quartier_depart} → ${course.quartier_arrivee} a été annulée.`,
          type: 'danger', route: '/mes-courses',
        }));
      }
    }

    // ── NOTIFICATIONS LIVREUR ─────────────────────────────────────────────────
    if (course.livreur_email) {
      const base = { email: course.livreur_email, role: 'livreur', courseId: course.id };

      if (newStatut === 'annulee' && oldStatut !== 'annulee') {
        tasks.push(notifyAndPush(base44, accessToken, { ...base,
          titre: '❌ Course annulée',
          message: `La course ${course.quartier_depart} → ${course.quartier_arrivee} a été annulée par le client.`,
          type: 'danger', route: '/mes-livraisons', isHigh: true,
        }));
      }

      if (newStatut === 'livree') {
        tasks.push(notifyAndPush(base44, accessToken, { ...base,
          titre: '✅ Livraison confirmée !',
          message: `Course ${course.quartier_depart} → ${course.quartier_arrivee} terminée. Gain : ${course.gain_livreur || 0} FCFA`,
          type: 'success', route: `/course-livreur/${course.id}`,
        }));
      }
    }

    // ── NOTIFICATIONS ADMIN ───────────────────────────────────────────────────
    if (newStatut === 'aucun_livreur') {
      const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' }).catch(() => []);
      for (const admin of admins) {
        tasks.push(notifyAndPush(base44, accessToken, {
          email: admin.email, role: 'admin',
          titre: '⚠️ Course sans livreur',
          message: `${course.quartier_depart} → ${course.quartier_arrivee} (${course.type_colis}) · ${course.nombre_tentatives || 0} tentatives`,
          type: 'warning', route: '/gerer-courses', courseId: course.id,
        }));
      }
    }

    if (tasks.length === 0) return Response.json({ skipped: true, reason: 'no_notif_for_status' });

    await Promise.allSettled(tasks);
    console.log(`[notifyCourseStatus] ${tasks.length} notifications (DB+FCM) envoyées (${oldStatut} → ${newStatut})`);
    return Response.json({ success: true, sent: tasks.length });

  } catch (error) {
    console.error('[notifyCourseStatus] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});