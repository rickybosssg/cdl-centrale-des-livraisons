/**
 * submitBedouRecharge — NOTIFICATIONS SYNCHRONES + FCM IMMÉDIAT
 * 1. Créer recharge BDD
 * 2. Notifications internes admin (SYNCHRONE — avant réponse HTTP)
 * 3. FCM push admin (SYNCHRONE — avant réponse HTTP)
 * Tout s'exécute en < 3 secondes avant de répondre au client.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const L = (msg) => console.log(`[RECHARGE] ${new Date().toISOString()} | ${msg}`);

// ── FCM helpers ──────────────────────────────────────────────────────────────

function base64url(data) {
  let base64;
  if (typeof data === 'string') {
    base64 = btoa(unescape(encodeURIComponent(data)));
  } else {
    base64 = btoa(String.fromCharCode(...data));
  }
  return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getOAuthToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const headerB64  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payloadB64 = base64url(JSON.stringify({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  }));

  const signingInput = `${headerB64}.${payloadB64}`;
  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\r\n|\n|\r/g, '');
  const binaryKey = Uint8Array.from(atob(pem), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${base64url(new Uint8Array(sig))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`OAuth2 failed: ${data.error}`);
  return data.access_token;
}

async function sendFcmToToken(accessToken, projectId, token, title, body, dataPayload) {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const strData = {};
  for (const [k, v] of Object.entries(dataPayload)) strData[k] = String(v);
  strData.title = title;
  strData.body  = body;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        data: strData,
        android: {
          priority: 'HIGH',
          ttl: '86400s',
          notification: {
            channel_id: 'default',
            sound: 'default',
            notification_priority: 'PRIORITY_MAX',
            visibility: 'PUBLIC',
            default_sound: true,
            default_vibrate_timings: true,
            default_light_settings: true,
          },
        },
      },
    }),
  });

  const result = await res.json().catch(() => ({}));
  L(`FCM token=${token.slice(0, 20)}... status=${res.status} ok=${res.ok} msgId=${result?.name || result?.error?.status || 'N/A'}`);
  return { ok: res.ok, status: res.status, result, token, id: null };
}

// ── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const t0 = Date.now();
  L('=== START ===');

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  L(`Authorization header: ${authHeader ? 'OUI (len=' + authHeader.length + ')' : 'NON'}`);

  let body = {};
  try {
    const raw = await req.text();
    if (raw.length > 0) body = JSON.parse(raw);
  } catch (e) {
    return Response.json({ success: false, error: 'Corps invalide' }, { status: 400 });
  }

  const { montant, methode_paiement, preuve_paiement_url, bonus } = body;
  L(`montant=${montant} methode=${methode_paiement} bonus=${bonus} preuve=${!!preuve_paiement_url}`);

  const base44 = createClientFromRequest(req);
  let user = null;
  try {
    user = await base44.auth.me();
    L(`auth OK: user=${user?.email}`);
  } catch (e) {
    L(`auth ERROR: ${e.message}`);
    return Response.json({ success: false, error: 'Session expirée — reconnectez-vous', step: 'auth' }, { status: 401 });
  }

  if (!user?.id) return Response.json({ success: false, error: 'Non authentifié' }, { status: 401 });

  const montantInt = parseInt(montant) || 0;
  const bonusInt   = parseInt(bonus)   || 0;

  if (montantInt < 100)     return Response.json({ success: false, error: 'Montant minimum 100 F CFA' }, { status: 400 });
  if (!methode_paiement)    return Response.json({ success: false, error: 'Méthode requise' }, { status: 400 });
  if (!preuve_paiement_url) return Response.json({ success: false, error: 'Preuve requise' }, { status: 400 });

  // ── ÉTAPE 1 : Créer la demande en BDD ────────────────────────────────────
  let demande = null;
  try {
    demande = await base44.asServiceRole.entities.DemandeRecharge.create({
      user_id:             user.id,
      user_email:          user.email,
      user_name:           user.full_name || user.email,
      montant:             montantInt,
      bonus:               bonusInt,
      montant_total:       montantInt + bonusInt,
      methode_paiement,
      preuve_paiement_url,
      statut:              'en_attente',
      type:                'recharge_bedou',
    });
    L(`BDD OK: id=${demande.id} | +${Date.now() - t0}ms`);
  } catch (e) {
    L(`BDD ERROR: ${e.message}`);
    return Response.json({ success: false, error: `Erreur BDD: ${e.message}` }, { status: 500 });
  }

  const clientName = user.full_name || user.email;
  const notifTitle = '💰 Nouvelle demande de recharge Bedou';
  const notifBody  = `${clientName} demande ${montantInt.toLocaleString()} F CFA${bonusInt > 0 ? ` + ${bonusInt.toLocaleString()} F bonus` : ''}. Validation requise.`;

  // ── ÉTAPE 2 : Charger admins + tokens FCM en PARALLÈLE (SYNCHRONE) ────────
  let admins = [];
  let allTokenRecords = [];
  let rawJson = '';

  try {
    const [allUsers, tokenRecords, serviceAccountJson] = await Promise.all([
      base44.asServiceRole.entities.User.list(null, 200),
      base44.asServiceRole.entities.FcmToken.filter({ is_active: true }, null, 200),
      Promise.resolve(Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || ''),
    ]);

    admins = allUsers.filter(u => {
      if (u.role === 'admin') return true;
      try {
        const roles = JSON.parse(u.data?.user_roles || u.user_roles || '[]');
        return roles.includes('admin') || roles.includes('dispatcher');
      } catch (_) { return false; }
    });

    allTokenRecords = tokenRecords || [];
    rawJson = serviceAccountJson;

    L(`admins: ${admins.length} (${admins.map(a => a.email).join(', ')}) | tokens actifs total: ${allTokenRecords.length}`);
  } catch (e) {
    L(`load error (non-bloquant): ${e.message}`);
  }

  // ── ÉTAPE 3 : Notifications internes BDD (SYNCHRONE) ────────────────────
  try {
    await Promise.allSettled(admins.map(admin =>
      base44.asServiceRole.entities.Notification.create({
        destinataire_email:  admin.email,
        destinataire_role:   'admin',
        titre:               notifTitle,
        message:             notifBody,
        type:                'warning',
        lue:                 false,
        target_screen:       '/gestion-bedou',
        target_entity_type:  'DemandeRecharge',
        target_entity_id:    demande.id,
      })
    ));
    L(`notifs internes envoyées: ${admins.length} | +${Date.now() - t0}ms`);
  } catch (e) {
    L(`notif interne error: ${e.message}`);
  }

  // ── ÉTAPE 4 : FCM Push (SYNCHRONE) ──────────────────────────────────────
  if (rawJson) {
    try {
      const sa = JSON.parse(rawJson);
      const adminEmails = admins.map(a => a.email.toLowerCase());

      // Tokens des admins connus
      let targetTokens = allTokenRecords.filter(r => adminEmails.includes((r.user_email || '').toLowerCase()) && r.token);

      // FALLBACK : si aucun token admin trouvé, envoyer à TOUS les tokens actifs
      // (utile quand l'admin ne s'est pas encore connecté sur l'APK)
      if (targetTokens.length === 0 && allTokenRecords.length > 0) {
        L(`FALLBACK: aucun token admin — envoi à tous les ${allTokenRecords.length} tokens actifs`);
        targetTokens = allTokenRecords.filter(r => r.token);
      }

      L(`FCM cibles: ${targetTokens.length} token(s) | emails: ${[...new Set(targetTokens.map(r => r.user_email))].join(', ')}`);

      if (targetTokens.length > 0) {
        const accessToken = await getOAuthToken(sa);
        const tFcm = Date.now();

        const fcmResults = await Promise.allSettled(
          targetTokens.map(r => sendFcmToToken(accessToken, sa.project_id, r.token, notifTitle, notifBody, {
            type:        'bedou_recharge',
            recharge_id: demande.id,
            notif_route: '/gestion-bedou',
          }))
        );

        let sent = 0, failed = 0;
        for (let i = 0; i < fcmResults.length; i++) {
          const r = fcmResults[i];
          if (r.status === 'fulfilled' && r.value.ok) {
            sent++;
          } else {
            failed++;
            const errStatus = r.status === 'fulfilled' ? r.value?.result?.error?.status : null;
            if (errStatus === 'NOT_FOUND' || errStatus === 'INVALID_ARGUMENT') {
              base44.asServiceRole.entities.FcmToken.update(targetTokens[i].id, { is_active: false }).catch(() => {});
              L(`token désactivé (${errStatus}): ${targetTokens[i].token.slice(0, 20)}...`);
            }
          }
        }

        L(`FCM done: sent=${sent} failed=${failed} | +${Date.now() - tFcm}ms | total=+${Date.now() - t0}ms`);
      } else {
        L('FCM skip: aucun token disponible');
      }
    } catch (e) {
      L(`FCM error: ${e.message}`);
    }
  } else {
    L('FCM skip: FIREBASE_SERVICE_ACCOUNT_JSON manquant');
  }

  L(`RESPONSE sent | total=+${Date.now() - t0}ms`);
  return Response.json({
    success:       true,
    message:       'Demande de recharge envoyée avec succès',
    recharge_id:   demande.id,
    montant:       montantInt,
    bonus:         bonusInt,
    montant_total: montantInt + bonusInt,
  });
});