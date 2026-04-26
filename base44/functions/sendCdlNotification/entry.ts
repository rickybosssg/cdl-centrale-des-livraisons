/**
 * sendCdlNotification — Fonction centrale FCM CDL
 *
 * Cas 1 : notifier un utilisateur précis
 *   { user_email, title, body, data }
 *
 * Cas 2 : notifier un rôle entier (admin, livreur, client, etc.)
 *   { role, title, body, data }
 *
 * data doit contenir { screen, type, entity_id, ... }
 * pour la redirection au clic dans l'APK.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SA_JSON   = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || '';
const LOG_ENTITY = 'Notification'; // log dans l'entité Notification existante

// ── Firebase OAuth2 ───────────────────────────────────────────────────────────
async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email, sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  };
  const enc = (obj) => btoa(JSON.stringify(obj)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const header = enc({ alg: 'RS256', typ: 'JWT' });
  const pl     = enc(payload);
  const input  = `${header}.${pl}`;

  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '');
  const key = await crypto.subtle.importKey(
    'pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const jwt = `${input}.${sigB64}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const d = await res.json();
  if (!d.access_token) throw new Error('OAuth failed: ' + JSON.stringify(d));
  return d.access_token;
}

// ── Envoi FCM à un token ──────────────────────────────────────────────────────
async function sendToToken(accessToken, sa, fcmToken, title, body, data = {}) {
  const projectId = sa.project_id;
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  // Toutes les valeurs data doivent être des strings (contrainte FCM)
  const stringData = {};
  for (const [k, v] of Object.entries(data)) {
    stringData[k] = v == null ? '' : String(v);
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        notification: { title, body },
        data: stringData,
        android: {
          priority: 'high',
          notification: {
            channel_id: 'default',
            sound: 'default',
            visibility: 'PUBLIC',
            default_vibrate_timings: true,
            notification_priority: 'PRIORITY_MAX',
          },
        },
        webpush: {
          notification: {
            icon: 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg',
            badge: 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg',
            vibrate: [200, 100, 200],
          },
        },
      },
    }),
  });
  const result = await res.json();
  return { ok: res.ok, result, token: fcmToken };
}

// ── Désactiver un token invalide ──────────────────────────────────────────────
async function deactivateToken(base44, token) {
  try {
    const records = await base44.asServiceRole.entities.FcmToken.filter({ token });
    for (const r of records) {
      await base44.asServiceRole.entities.FcmToken.update(r.id, { is_active: false });
      console.log('[sendCdlNotification] Token désactivé (invalide):', token.slice(0, 20) + '...');
    }
  } catch (_) {}
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      user_email,
      role,
      title,
      body: msgBody,
      data = {},
    } = body;

    if (!title || !msgBody) {
      return Response.json({ error: 'title et body requis' }, { status: 400 });
    }
    if (!user_email && !role) {
      return Response.json({ error: 'user_email ou role requis' }, { status: 400 });
    }

    if (!SA_JSON) {
      return Response.json({ error: 'FIREBASE_SERVICE_ACCOUNT_JSON manquant' }, { status: 500 });
    }

    const base44 = createClientFromRequest(req);
    const sa = JSON.parse(SA_JSON);
    const accessToken = await getAccessToken(sa);

    // ── Récupérer les tokens cibles ───────────────────────────────────────────
    let targetTokenRecords = [];

    if (user_email) {
      // Notifier un utilisateur précis
      targetTokenRecords = await base44.asServiceRole.entities.FcmToken.filter({
        user_email: user_email.toLowerCase(),
        is_active: true,
      });
      console.log(`[sendCdlNotification] user=${user_email} → ${targetTokenRecords.length} token(s)`);
    } else if (role) {
      // Notifier tous les utilisateurs d'un rôle
      if (role === 'admin') {
        // Admins = users avec role=admin dans la plateforme
        const adminUsers = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
        const adminEmails = adminUsers.map(u => u.email.toLowerCase());
        console.log(`[sendCdlNotification] Admins trouvés: ${adminEmails.length}`);
        for (const email of adminEmails) {
          const tokens = await base44.asServiceRole.entities.FcmToken.filter({ user_email: email, is_active: true });
          targetTokenRecords.push(...tokens);
        }
      } else {
        // Autres rôles : chercher profils actifs
        const profiles = await base44.asServiceRole.entities.UserProfile.filter({
          profile_type: role,
          status: 'actif',
          deleted: false,
        });
        const emails = [...new Set(profiles.map(p => p.user_email.toLowerCase()))];
        console.log(`[sendCdlNotification] role=${role} → ${emails.length} profil(s) actif(s)`);
        for (const email of emails) {
          const tokens = await base44.asServiceRole.entities.FcmToken.filter({ user_email: email, is_active: true });
          targetTokenRecords.push(...tokens);
        }
      }
      console.log(`[sendCdlNotification] Total tokens pour role=${role}: ${targetTokenRecords.length}`);
    }

    if (targetTokenRecords.length === 0) {
      console.warn('[sendCdlNotification] Aucun token FCM actif trouvé');
      return Response.json({ sent: 0, failed: 0, total: 0, note: 'Aucun token FCM actif' });
    }

    // ── Envoi FCM à chaque token ──────────────────────────────────────────────
    let sent = 0;
    let failed = 0;
    const invalidTokens = [];

    for (const record of targetTokenRecords) {
      try {
        const { ok, result } = await sendToToken(accessToken, sa, record.token, title, msgBody, data);
        if (ok) {
          sent++;
        } else {
          failed++;
          // Détecter token invalide
          const errCode = result?.error?.details?.[0]?.errorCode || result?.error?.status || '';
          if (['UNREGISTERED', 'INVALID_ARGUMENT'].includes(errCode)) {
            invalidTokens.push(record.token);
          }
          console.warn('[sendCdlNotification] FCM error:', errCode, '| user:', record.user_email);
        }
      } catch (e) {
        failed++;
        console.error('[sendCdlNotification] send error:', e.message);
      }
    }

    // Désactiver les tokens invalides (best-effort)
    for (const t of invalidTokens) {
      await deactivateToken(base44, t);
    }

    // ── Log notification en BDD (best-effort) ────────────────────────────────
    try {
      const logEmail = user_email || `role:${role}`;
      const logRole  = data?.role || role || '';
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: logEmail,
        destinataire_role: logRole,
        titre: title,
        message: msgBody,
        type: sent > 0 ? 'success' : 'warning',
        lue: false,
        target_screen: data?.screen || '',
        target_entity_id: data?.entity_id || '',
        target_entity_type: data?.type || '',
        notification_key: `${logEmail}__${data?.type || ''}__${data?.entity_id || ''}__${Date.now()}`,
      });
    } catch (_) {}

    console.log(`[sendCdlNotification] ✅ sent=${sent} failed=${failed} total=${targetTokenRecords.length}`);
    return Response.json({ sent, failed, total: targetTokenRecords.length });

  } catch (err) {
    console.error('[sendCdlNotification] ERREUR:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});