/**
 * notifyCourseStatus — Automation entity Course (update)
 *
 * Envoie notifications DB + FCM push lors des changements de statut.
 * Deep links :
 *   - livreur ciblé → /course-livreur/{id}  (page acceptation avec timer 60s)
 *   - client        → /course/{id}/track     (suivi en temps réel)
 *   - client info   → /course/{id}           (détail course)
 *   - admin         → /dispatch-monitor      (tableau de bord dispatch)
 *
 * Critères livreur dispatchable (vérifiés avant envoi) :
 *   driver_online + current_role=livreur + profil_valide + !livreur_bloque
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

async function sendFcmPush(accessToken, fcmToken, title, body, route, isHigh = false, extraData = {}) {
  const res = await fetch(FCM_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        notification: { title, body },
        data: {
          route,
          notif_route: route,
          ...Object.fromEntries(Object.entries(extraData).map(([k, v]) => [k, String(v || '')])),
        },
        android: {
          priority: isHigh ? 'HIGH' : 'NORMAL',
          notification: {
            channel_id: isHigh ? 'cdl_courses_urgent' : 'cdl_courses',
            color: '#1a73e8',
            notification_priority: isHigh ? 'PRIORITY_MAX' : 'PRIORITY_DEFAULT',
            visibility: 'PUBLIC',
            vibrate_timings_millis: isHigh ? [0, 400, 100, 400, 100, 400] : [0, 200, 100, 200],
          },
        },
        webpush: {
          headers: { Urgency: isHigh ? 'high' : 'normal' },
          notification: {
            icon: "https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg",
            badge: "https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg",
            vibrate: isHigh ? [400, 100, 400, 100, 400] : [200, 100, 200],
            requireInteraction: isHigh,
            renotify: true,
            tag: `cdl-course-${extraData.courseId || Date.now()}`,
          },
          fcm_options: { link: route },
        },
      },
    }),
  });
  const result = await res.json();
  const invalidToken = !res.ok && (result?.error?.code === 404 || result?.error?.details?.[0]?.errorCode === 'UNREGISTERED');
  if (!res.ok && !invalidToken) console.error('[notifyCourseStatus] FCM error:', JSON.stringify(result));
  return { ok: res.ok, invalidToken };
}

async function notifyAndPush(base44, accessToken, { email, role, titre, message, type, route, courseId, isHigh = false, extraData = {} }) {
  // 1. Notification DB (in-app + fallback)
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
    tokens.map(t => sendFcmPush(accessToken, t, titre, message, route, isHigh, { courseId, ...extraData }))
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
    const oldCourse = body.old_data;

    if (!course || !oldCourse) return Response.json({ skipped: true });

    const oldStatut = oldCourse.statut;
    const newStatut = course.statut;
    if (oldStatut === newStatut) return Response.json({ skipped: true, reason: 'no_status_change' });

    console.log(`[notifyCourseStatus] ${course.id}: ${oldStatut} → ${newStatut}`);

    let accessToken = null;
    const rawJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") || '';
    if (rawJson) {
      const serviceAccount = JSON.parse(rawJson);
      accessToken = await getAccessToken(serviceAccount).catch(() => null);
    }

    const tasks = [];
    const courseRoute = `/course/${course.id}`;
    const trackRoute = `/course/${course.id}/track`;
    // Deep link livreur : page d'acceptation avec timer 60s
    const livreurRoute = `/course-livreur/${course.id}`;

    // ══════════════════════════════════════════════════════════════
    // NOTIFICATIONS CLIENT
    // ══════════════════════════════════════════════════════════════
    if (course.client_email) {
      const clientBase = { email: course.client_email, role: 'client', courseId: course.id };

      if (newStatut === 'assignee_attente') {
        // Dispatch en cours — livreur contacté
        tasks.push(notifyAndPush(base44, accessToken, { ...clientBase,
          titre: '🔍 Livreur en cours de recherche...',
          message: `Nous recherchons le livreur le plus proche pour ${course.quartier_depart} → ${course.quartier_arrivee}.`,
          type: 'info', route: courseRoute,
        }));

      } else if (newStatut === 'acceptee') {
        // Livreur a accepté
        tasks.push(notifyAndPush(base44, accessToken, { ...clientBase,
          titre: '✅ Un livreur a accepté votre course !',
          message: `${course.livreur_name || 'Votre livreur'} est en route pour récupérer le colis.`,
          type: 'success', route: trackRoute, isHigh: true,
        }));

      } else if (newStatut === 'en_cours') {
        // Course démarrée
        tasks.push(notifyAndPush(base44, accessToken, { ...clientBase,
          titre: '🚀 Votre course a commencé !',
          message: `Votre colis est en route vers ${course.quartier_arrivee}. Suivez le trajet en direct.`,
          type: 'info', route: trackRoute, isHigh: true,
        }));

      } else if (newStatut === 'livree') {
        // Course terminée
        tasks.push(notifyAndPush(base44, accessToken, { ...clientBase,
          titre: '📦 Votre course a été livrée avec succès !',
          message: `Touchez pour noter votre livreur ⭐`,
          type: 'success', route: courseRoute, isHigh: true,
        }));

      } else if (newStatut === 'aucun_livreur') {
        // Aucun livreur
        tasks.push(notifyAndPush(base44, accessToken, { ...clientBase,
          titre: '😔 Aucun livreur disponible',
          message: `Aucun livreur disponible pour le moment. Réessayez dans quelques instants ou augmentez le prix proposé.`,
          type: 'warning', route: courseRoute,
        }));

      } else if (newStatut === 'annulee') {
        tasks.push(notifyAndPush(base44, accessToken, { ...clientBase,
          titre: '❌ Course annulée',
          message: `Votre course ${course.quartier_depart} → ${course.quartier_arrivee} a été annulée.`,
          type: 'danger', route: '/mes-courses', isHigh: true,
        }));
      }
    }

    // ══════════════════════════════════════════════════════════════
    // NOTIFICATIONS LIVREUR
    // Uniquement au livreur ciblé, après vérification des critères métier
    // ══════════════════════════════════════════════════════════════
    if (course.livreur_email) {
      // Vérifier que le livreur est toujours valide avant de notifier
      const drivers = await base44.asServiceRole.entities.User.filter({ email: course.livreur_email }).catch(() => []);
      const driver = drivers[0];

      // Vérification SANS current_role — basée sur profil_valide + driver_online
      const livreurValide = driver &&
        driver.driver_online === true &&
        driver.profil_valide === true &&
        !driver.livreur_bloque &&
        !driver.livreur_suspendu;

      if (newStatut === 'assignee_attente' && livreurValide) {
        // ⚠️ Notification haute priorité — livreur ciblé par dispatch
        // Deep link direct sur la page d'acceptation avec timer 60s
        tasks.push(notifyAndPush(base44, accessToken, {
          email: course.livreur_email,
          role: 'livreur',
          courseId: course.id,
          titre: '🛵 Nouvelle course disponible !',
          message: `${course.quartier_depart} → ${course.quartier_arrivee} | ${course.prix} FCFA | Vous avez 60 secondes`,
          type: 'success',
          route: livreurRoute,
          isHigh: true,
          extraData: { type: 'new_delivery_request', target_role: 'livreur' },
        }));

      } else if (newStatut === 'annulee' && oldStatut !== 'annulee') {
        // Course annulée alors que le livreur était assigné
        tasks.push(notifyAndPush(base44, accessToken, {
          email: course.livreur_email,
          role: 'livreur',
          courseId: course.id,
          titre: '❌ Course annulée',
          message: `La course ${course.quartier_depart} → ${course.quartier_arrivee} a été annulée.`,
          type: 'danger',
          route: '/mes-livraisons',
          isHigh: true,
        }));

      } else if (newStatut === 'livree') {
        tasks.push(notifyAndPush(base44, accessToken, {
          email: course.livreur_email,
          role: 'livreur',
          courseId: course.id,
          titre: '✅ Livraison confirmée !',
          message: `Course ${course.quartier_depart} → ${course.quartier_arrivee} terminée. Gain : ${course.gain_livreur || 0} FCFA`,
          type: 'success',
          route: livreurRoute,
        }));
      }
    }

    // ══════════════════════════════════════════════════════════════
    // NOTIFICATIONS ADMIN
    // ══════════════════════════════════════════════════════════════
    const adminStatuts = ['aucun_livreur', 'annulee'];
    const adminRoutes = {
      aucun_livreur: '/dispatch-monitor',
      annulee: '/gerer-courses',
    };

    if (adminStatuts.includes(newStatut)) {
      const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' }).catch(() => []);
      for (const admin of admins.slice(0, 3)) {
        const isUrgent = newStatut === 'aucun_livreur';
        tasks.push(notifyAndPush(base44, accessToken, {
          email: admin.email,
          role: 'admin',
          courseId: course.id,
          titre: isUrgent ? '⚠️ Course sans livreur' : '❌ Course annulée',
          message: `${course.quartier_depart} → ${course.quartier_arrivee} · ${course.type_colis} · ${course.nombre_tentatives || 0} tentatives`,
          type: isUrgent ? 'warning' : 'danger',
          route: adminRoutes[newStatut],
        }));
      }
    }

    if (tasks.length === 0) return Response.json({ skipped: true, reason: 'no_notif_for_status' });

    await Promise.allSettled(tasks);
    console.log(`[notifyCourseStatus] ${tasks.length} notifications (DB+FCM) | ${oldStatut} → ${newStatut}`);
    return Response.json({ success: true, sent: tasks.length });

  } catch (error) {
    console.error('[notifyCourseStatus] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});