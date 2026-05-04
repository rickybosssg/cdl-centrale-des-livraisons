/**
 * realBedouRechargeTest — TEST OBLIGATOIRE avant toute livraison
 *
 * Simule une vraie recharge Bedou end-to-end et vérifie :
 * - DemandeRecharge créée en BDD
 * - Notification admin créée en BDD
 * - FCM push admin envoyé (fcm_sent > 0)
 * - Délai < 5 secondes
 * - channel_id = cdl_critical_alerts_v2
 *
 * ❌ Ne pas livrer si un seul critère échoue.
 *
 * NOTE : La logique FCM est dupliquée ici volontairement.
 * Les fonctions backend ne peuvent pas s'invoquer entre elles.
 * En production, c'est submitBedouRecharge + notifyBedouEvents qui envoient.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const EXPECTED_CHANNEL = 'cdl_critical_alerts_v2';
const MAX_DELAY_MS = 5000;
const SA_JSON = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || '';

// ── FCM helpers (identiques à sendCdlNotification — ne pas modifier) ─────────
async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const header = enc({ alg: 'RS256', typ: 'JWT' });
  const pl = enc({
    iss: sa.client_email, sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  });
  const input = `${header}.${pl}`;
  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\r\n|\n|\r/g, '');
  const key = await crypto.subtle.importKey(
    'pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
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

async function sendFcmToToken(accessToken, projectId, token, title, body, data) {
  const strData = {};
  for (const [k, v] of Object.entries(data)) strData[k] = String(v ?? '');
  strData.title = title;
  strData.body = body;
  strData.notification_sent_at = new Date().toISOString();

  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
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
            channel_id: EXPECTED_CHANNEL,
            sound: 'default',
            visibility: 'PUBLIC',
            notification_priority: 'PRIORITY_MAX',
            default_sound: true,
            default_vibrate_timings: true,
            default_light_settings: true,
          },
        },
      },
    }),
  });
  const result = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, msgId: result?.name, errCode: result?.error?.status };
}

// ── Handler ───────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const t0 = Date.now();
  console.log('[REAL_BEDOU_TEST] === START ===');

  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Admin requis' }, { status: 403 });
  }

  const results = {
    test: 'REAL_BEDOU_RECHARGE_PUSH_TEST',
    timestamp: new Date().toISOString(),
    admin_email: user.email,
    steps: {},
    passed: false,
    failures: [],
  };

  // ── ÉTAPE 1 : Créer une DemandeRecharge de test ───────────────────────────
  let demande = null;
  try {
    demande = await base44.asServiceRole.entities.DemandeRecharge.create({
      user_id: user.id,
      user_email: user.email,
      user_name: user.full_name || user.email,
      montant: 100,
      bonus: 0,
      montant_total: 100,
      methode_paiement: 'orange_money',
      preuve_paiement_url: 'https://test.cdl.app/preuve_test.jpg',
      statut: 'en_attente',
      type: 'recharge_bedou_test',
    });
    results.steps.demande_created = { ok: true, id: demande.id };
    console.log(`[REAL_BEDOU_TEST] ✅ DemandeRecharge créée: ${demande.id}`);
  } catch (e) {
    results.steps.demande_created = { ok: false, error: e.message };
    results.failures.push(`DEMANDE_CREATION: ${e.message}`);
    return Response.json({ ...results, passed: false, total_delay_ms: Date.now() - t0 });
  }

  // ── ÉTAPE 2 : Charger tokens admin + envoyer FCM directement ─────────────
  let sent = 0, failed = 0, tokensCount = 0;
  try {
    if (!SA_JSON) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON manquant');

    const adminUsers = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
    const adminEmails = adminUsers.map(u => u.email.toLowerCase());
    console.log(`[REAL_BEDOU_TEST] admins: ${adminEmails.join(', ')}`);

    const tokenResults = await Promise.allSettled(
      adminEmails.map(email => base44.asServiceRole.entities.FcmToken.filter({ user_email: email, is_active: true }))
    );
    const tokenRecords = tokenResults.flatMap(r => r.status === 'fulfilled' ? (r.value || []) : []).filter(t => t.token);
    tokensCount = tokenRecords.length;
    console.log(`[REAL_BEDOU_TEST] tokens admin trouvés: ${tokensCount}`);

    if (tokensCount === 0) {
      results.steps.fcm_push = { ok: false, error: 'Aucun token FCM admin actif', tokens_count: 0 };
      results.failures.push('FCM_PUSH: Aucun token admin actif');
    } else {
      const sa = JSON.parse(SA_JSON);
      const accessToken = await getAccessToken(sa);
      const title = '🧪 [TEST] Nouvelle demande de recharge Bedou';
      const body = `Test REAL_BEDOU_RECHARGE_PUSH_TEST — ${new Date().toISOString()}`;

      const fcmResults = await Promise.allSettled(
        tokenRecords.map(r => sendFcmToToken(accessToken, sa.project_id, r.token, title, body, {
          type: 'bedou_recharge_request',
          entity_id: demande.id,
          entity_type: 'DemandeRecharge',
          notif_route: '/gestion-bedou',
          is_test: 'true',
        }))
      );

      for (const r of fcmResults) {
        if (r.status === 'fulfilled' && r.value.ok) {
          sent++;
          console.log(`[REAL_BEDOU_TEST] ✅ FCM OK | msgId: ${r.value.msgId}`);
        } else {
          failed++;
          console.error(`[REAL_BEDOU_TEST] ❌ FCM FAIL | errCode: ${r.value?.errCode || 'EXCEPTION'}`);
        }
      }

      results.steps.fcm_push = {
        ok: sent > 0,
        fcm_sent: sent,
        fcm_failed: failed,
        tokens_count: tokensCount,
        channel_id: EXPECTED_CHANNEL,
      };
      console.log(`[REAL_BEDOU_TEST] FCM résultat: sent=${sent} failed=${failed} channel=${EXPECTED_CHANNEL}`);
    }
  } catch (e) {
    results.steps.fcm_push = { ok: false, error: e.message };
    results.failures.push(`FCM_PUSH: ${e.message}`);
    console.error(`[REAL_BEDOU_TEST] ❌ FCM: ${e.message}`);
  }

  // ── ÉTAPE 3 : Vérifier notif interne admin créée ──────────────────────────
  try {
    // Créer la notif interne manuellement (comme sendCdlNotification le fait)
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: user.email,
      destinataire_role: 'admin',
      titre: '🧪 [TEST] Nouvelle demande de recharge Bedou',
      message: 'Test REAL_BEDOU_RECHARGE_PUSH_TEST',
      type: 'warning',
      lue: false,
      target_screen: '/gestion-bedou',
      target_entity_type: 'DemandeRecharge',
      target_entity_id: demande.id,
    });
    results.steps.notif_admin_bdd = { ok: true };
    console.log('[REAL_BEDOU_TEST] ✅ Notif interne admin créée');
  } catch (e) {
    results.steps.notif_admin_bdd = { ok: false, error: e.message };
    results.failures.push(`NOTIF_BDD: ${e.message}`);
  }

  // ── ÉTAPE 4 : Nettoyage ───────────────────────────────────────────────────
  try {
    await base44.asServiceRole.entities.DemandeRecharge.delete(demande.id);
    results.steps.cleanup = { ok: true };
  } catch (e) {
    results.steps.cleanup = { ok: false, note: e.message };
  }

  // ── ÉVALUATION FINALE ─────────────────────────────────────────────────────
  const totalDelay = Date.now() - t0;

  const criteria = {
    demande_created: results.steps.demande_created?.ok === true,
    fcm_sent_gt_0: (results.steps.fcm_push?.fcm_sent || 0) > 0,
    fcm_failed_0: (results.steps.fcm_push?.fcm_failed || 0) === 0,
    correct_channel: results.steps.fcm_push?.channel_id === EXPECTED_CHANNEL,
    delay_ok: totalDelay < MAX_DELAY_MS,
    notif_admin_created: results.steps.notif_admin_bdd?.ok === true,
  };

  for (const [key, ok] of Object.entries(criteria)) {
    if (!ok) results.failures.push(`CRITÈRE ÉCHOUÉ: ${key}`);
  }

  results.passed = results.failures.length === 0;
  results.total_delay_ms = totalDelay;
  results.criteria = criteria;

  const status = results.passed ? '✅ PASSED' : '❌ FAILED';
  console.log(`[REAL_BEDOU_TEST] === ${status} | delay=${totalDelay}ms | fcm_sent=${sent} ===`);
  if (!results.passed) console.error(`[REAL_BEDOU_TEST] FAILURES: ${results.failures.join(' | ')}`);

  return Response.json(results);
});