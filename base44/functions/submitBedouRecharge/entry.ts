/**
 * submitBedouRecharge — VERSION PROPRE + FCM ADMIN IMMÉDIAT
 * Auth via header Authorization uniquement.
 * Notifications internes + FCM push admin envoyées en parallèle immédiatement après création BDD.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const L = (msg) => console.log(`[RECHARGE] ${new Date().toISOString()} | ${msg}`);

// ── FCM helpers (même logique que testFcmSend qui fonctionne) ──────────────

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
        android: { priority: 'HIGH', notification: { channel_id: 'default' } },
      },
    }),
  });

  const result = await res.json().catch(() => ({}));
  const ok = res.ok;
  L(`FCM token=${token.slice(0, 20)}... status=${res.status} ok=${ok} msgId=${result?.name || result?.error?.status || 'N/A'}`);
  return { ok, status: res.status, result, token };
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
  L(`Authorization header: ${authHeader ? 'OUI (len=' + authHeader.length + ')' : 'NON — sera 401'}`);

  let body = {};
  try {
    const raw = await req.text();
    if (raw.length > 0) body = JSON.parse(raw);
  } catch (e) {
    return Response.json({ success: false, error: 'Corps invalide', step: 'parse' }, { status: 400 });
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

  if (!user?.id) return Response.json({ success: false, error: 'Non authentifié', step: 'auth' }, { status: 401 });

  const montantInt = parseInt(montant) || 0;
  const bonusInt   = parseInt(bonus)   || 0;

  if (montantInt < 100)     return Response.json({ success: false, error: 'Montant minimum 100 F CFA' }, { status: 400 });
  if (!methode_paiement)    return Response.json({ success: false, error: 'Méthode requise' }, { status: 400 });
  if (!preuve_paiement_url) return Response.json({ success: false, error: 'Preuve requise' }, { status: 400 });

  // 1. Créer la demande en BDD
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
    return Response.json({ success: false, error: `Erreur BDD: ${e.message}`, step: 'db' }, { status: 500 });
  }

  const recharge_created_at = Date.now();
  const clientName = user.full_name || user.email;
  const notifTitle = '💰 Nouvelle demande de recharge Bedou';
  const notifBody  = `${clientName} demande ${montantInt.toLocaleString()} F CFA${bonusInt > 0 ? ` + ${bonusInt.toLocaleString()} F bonus` : ''}. Validation requise.`;

  // 2. Notifications admin en PARALLÈLE et immédiatement (fire-and-forget mais await pour avoir les logs)
  (async () => {
    try {
      // Charger admins et service account en parallèle
      const [admins, rawJson] = await Promise.all([
        base44.asServiceRole.entities.User.filter({ role: 'admin' }, null, 50),
        Promise.resolve(Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || ''),
      ]);

      L(`admins trouvés: ${admins.length}`);

      // a) Notifications internes BDD
      const tInternal = Date.now();
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
        }).catch(e => L(`notif interne error ${admin.email}: ${e.message}`))
      ));
      L(`internal_notifications_sent | +${Date.now() - recharge_created_at}ms`);

      // b) FCM push — récupérer tous les tokens actifs des admins
      if (!rawJson) { L('FIREBASE_SERVICE_ACCOUNT_JSON manquant — skip FCM'); return; }

      let sa;
      try { sa = JSON.parse(rawJson); } catch (e) { L(`SA parse error: ${e.message}`); return; }

      const adminEmails = admins.map(a => a.email);
      L(`emails admin: ${adminEmails.join(', ')}`);

      const tokenRecords = await base44.asServiceRole.entities.FcmToken.filter({ is_active: true }, null, 200);
      const adminTokens = tokenRecords.filter(r => adminEmails.includes(r.user_email) && r.token);
      L(`tokens FCM admin trouvés: ${adminTokens.length} (sur ${tokenRecords.length} actifs total)`);

      if (adminTokens.length === 0) { L('Aucun token admin actif — skip FCM'); return; }

      const tFcm = Date.now();
      const accessToken = await getOAuthToken(sa);

      const fcmResults = await Promise.allSettled(
        adminTokens.map(r => sendFcmToToken(accessToken, sa.project_id, r.token, notifTitle, notifBody, {
          type:        'bedou_recharge',
          recharge_id: demande.id,
          screen:      'admin_bedou_recharges',
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
          // Désactiver token invalide
          const errStatus = r.status === 'fulfilled' ? r.value?.result?.error?.status : null;
          if (errStatus === 'NOT_FOUND' || errStatus === 'INVALID_ARGUMENT') {
            try {
              await base44.asServiceRole.entities.FcmToken.update(adminTokens[i].id, { is_active: false });
              L(`token désactivé (${errStatus}): ${adminTokens[i].token.slice(0, 20)}...`);
            } catch (_) {}
          }
        }
      }

      L(`FCM done: sent=${sent} failed=${failed} | fcm_delay=+${Date.now() - tFcm}ms | total_delay=+${Date.now() - t0}ms`);
    } catch (e) {
      L(`notifications error (non-bloquant): ${e.message}`);
    }
  })();

  L(`RESPONSE sent | +${Date.now() - t0}ms`);
  return Response.json({
    success:       true,
    message:       'Demande de recharge envoyée avec succès',
    recharge_id:   demande.id,
    montant:       montantInt,
    bonus:         bonusInt,
    montant_total: montantInt + bonusInt,
  });
});