/**
 * adminPushNotify — Envoie une push notification FCM à tous les admins CDL
 * Appelé par les automations entity (UserProfile, DemandeRecharge, DemandeRetrait, CourseIssue)
 * Peut aussi être appelé directement : POST { title, body, route, targetId, targetType }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Config FCM via Firebase Admin SDK
async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  };

  const encode = (obj) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const header64 = encode(header);
  const payload64 = encode(payload);
  const unsigned = `${header64}.${payload64}`;

  // Import the private key
  const pemKey = serviceAccount.private_key;
  const pemBody = pemKey.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s/g, '');
  const binaryKey = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, encoder.encode(unsigned));
  const sig64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const jwt = `${unsigned}.${sig64}`;

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenResp.json();
  return tokenData.access_token;
}

// Détermine le contenu de la notification selon l'entité
function buildNotificationContent(entityName, data, eventType) {
  switch (entityName) {
    case 'UserProfile': {
      const role = data?.profile_type || 'utilisateur';
      const roleLabel = { livreur: 'livreur', partenaire: 'partenaire', commercial: 'commercial', client: 'client' }[role] || role;
      const route = role === 'livreur' ? '/validation-livreurs' : role === 'partenaire' ? '/gerer-partenaires' : '/gestion-profils';
      return {
        title: `Nouvelle demande de profil ${roleLabel}`,
        body: `${data?.user_email || 'Un utilisateur'} attend validation`,
        route,
        targetId: data?.id || data?.user_email,
        type: 'profile_request',
      };
    }
    case 'DemandeRecharge':
      return {
        title: '💰 Nouvelle demande de recharge Bedou',
        body: `${data?.user_nom || data?.user_email || 'Un utilisateur'} • ${(data?.montant || 0).toLocaleString()} F CFA`,
        route: '/gestion-bedou',
        targetId: data?.id,
        type: 'bedou_recharge',
      };
    case 'DemandeRetrait':
      return {
        title: '💸 Demande de retrait Bedou',
        body: `${data?.user_nom || data?.user_email || 'Un utilisateur'} • ${(data?.montant || 0).toLocaleString()} F CFA`,
        route: '/gestion-bedou',
        targetId: data?.id,
        type: 'bedou_retrait',
      };
    case 'CourseIssue':
      return {
        title: '⚠️ Problème signalé sur une course',
        body: `${data?.client_name || data?.client_email || 'Un client'} – ${data?.issue_type || 'incident'}`,
        route: '/gestion-signalements',
        targetId: data?.course_id || data?.id,
        type: 'course_issue',
      };
    default:
      return null;
  }
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const body = await req.json().catch(() => ({}));

  // Mode direct (appelé manuellement) vs mode automation (payload entity)
  let notif = null;
  if (body.title && body.body) {
    // Appel direct avec titre/body/route fournis
    notif = { title: body.title, body: body.body, route: body.route || '/', targetId: body.targetId || '', type: body.type || 'manual' };
  } else if (body.event?.entity_name && body.data) {
    // Appelé par une automation
    notif = buildNotificationContent(body.event.entity_name, body.data, body.event.type);
  }

  if (!notif) {
    return Response.json({ success: false, reason: 'no_notification_content' });
  }

  // Charger le service account Firebase
  const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (!serviceAccountJson) {
    return Response.json({ success: false, error: 'FIREBASE_SERVICE_ACCOUNT_JSON missing' }, { status: 500 });
  }
  const serviceAccount = JSON.parse(serviceAccountJson);
  const projectId = serviceAccount.project_id;

  // Récupérer tous les tokens FCM des admins
  const allTokens = await base44.asServiceRole.entities.FcmToken.list('-last_seen', 200);
  const adminUsers = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
  const adminEmails = new Set(adminUsers.map(u => u.email));
  
  // Inclure aussi les tokens rôle admin
  const adminTokens = allTokens.filter(t => 
    adminEmails.has(t.user_email) || t.user_role === 'admin'
  );

  if (adminTokens.length === 0) {
    console.log('[adminPushNotify] No admin FCM tokens found');
    return Response.json({ success: true, sent: 0, reason: 'no_admin_tokens' });
  }

  // Obtenir le token OAuth2
  const accessToken = await getAccessToken(serviceAccount);

  // Route deep link : encode dans ?notif_route= pour compatibilité app fermée
  const deepLinkRoute = notif.route + (notif.targetId ? `?targetId=${notif.targetId}` : '');

  let sent = 0;
  let failed = 0;
  const errors = [];

  // Envoyer à chaque token (dédupliqué)
  const uniqueTokens = [...new Map(adminTokens.map(t => [t.token, t])).values()];
  
  for (const tokenRecord of uniqueTokens) {
    const message = {
      message: {
        token: tokenRecord.token,
        notification: {
          title: notif.title,
          body: notif.body,
        },
        data: {
          type: notif.type,
          route: notif.route,
          targetId: String(notif.targetId || ''),
          notif_route: deepLinkRoute,
        },
        android: {
          priority: 'HIGH',
          notification: {
            channel_id: 'cdl_admin',
            priority: 'HIGH',
            default_sound: true,
            default_vibrate_timings: true,
            visibility: 'PUBLIC',
          },
        },
      },
    };

    const resp = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      }
    );

    if (resp.ok) {
      sent++;
    } else {
      const err = await resp.text();
      failed++;
      errors.push({ token: tokenRecord.token.slice(-8), error: err });
      console.error('[adminPushNotify] FCM error:', err);
    }
  }

  console.log(`[adminPushNotify] sent=${sent} failed=${failed} type=${notif.type}`);
  return Response.json({ success: true, sent, failed, errors });
});