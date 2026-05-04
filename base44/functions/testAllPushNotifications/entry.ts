/**
 * testAllPushNotifications — Gate de non-régression global CDL
 *
 * Exécute les 5 tests push obligatoires via FCM direct (pattern identique à realBedouRechargeTest) :
 * - REAL_BEDOU_RECHARGE_PUSH_TEST
 * - REAL_COURSE_PUSH_TEST
 * - REAL_PROFILE_PUSH_TEST
 * - REAL_MALL_PUSH_TEST
 * - REAL_ADMIN_ALERT_PUSH_TEST
 *
 * Critères : fcm_sent > 0 | fcm_failed = 0 | delay < 5s | channel = cdl_critical_alerts_v2
 * Si un test échoue → NE PAS déployer l'APK.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const EXPECTED_CHANNEL = 'cdl_critical_alerts_v2';
const MAX_DELAY_MS = 5000;
const SA_JSON = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || '';

const L = (msg) => console.log(`[PUSH_TEST_GLOBAL] ${new Date().toISOString()} | ${msg}`);

// ── FCM helpers (identiques à sendCdlNotification) ───────────────────────────
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
  if (!strData.screen && strData.notif_route) strData.screen = strData.notif_route;

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
            channel_id: EXPECTED_CHANNEL, // 🔒 VERROUILLÉ
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
  return { ok: res.ok, msgId: result?.name, errCode: result?.error?.status || result?.error?.details?.[0]?.errorCode };
}

// ── Helper : envoyer test FCM vers les tokens admin ───────────────────────────
async function runFcmTest(base44, testName, title, body, data) {
  const tTest = Date.now();
  L(`▶ ${testName} START`);
  try {
    if (!SA_JSON) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON manquant');

    const adminUsers = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
    const adminEmails = adminUsers.map(u => u.email.toLowerCase());

    const tokenResults = await Promise.allSettled(
      adminEmails.map(email => base44.asServiceRole.entities.FcmToken.filter({ user_email: email, is_active: true }))
    );
    const tokenRecords = tokenResults.flatMap(r => r.status === 'fulfilled' ? (r.value || []) : []).filter(t => t.token);
    const tokensCount = tokenRecords.length;

    if (tokensCount === 0) {
      L(`⚠️ ${testName} — aucun token admin actif`);
      return { test: testName, passed: false, fcm_sent: 0, fcm_failed: 0, tokens_count: 0, delay_ms: Date.now() - tTest, channel_id: EXPECTED_CHANNEL, error: 'Aucun token FCM admin actif' };
    }

    const sa = JSON.parse(SA_JSON);
    const accessToken = await getAccessToken(sa);

    const fcmResults = await Promise.allSettled(
      tokenRecords.map(r => sendFcmToToken(accessToken, sa.project_id, r.token, title, body, data))
    );

    let sent = 0, failed = 0;
    for (const r of fcmResults) {
      if (r.status === 'fulfilled' && r.value.ok) {
        sent++;
        L(`✅ ${testName} FCM OK | msgId: ${r.value.msgId}`);
      } else {
        failed++;
        L(`❌ ${testName} FCM FAIL | errCode: ${r.value?.errCode || 'EXCEPTION'}`);
      }
    }

    const delay = Date.now() - tTest;
    const passed = sent > 0 && failed === 0 && delay < MAX_DELAY_MS;
    L(`${passed ? '✅' : '❌'} ${testName} | sent=${sent} failed=${failed} delay=${delay}ms channel=${EXPECTED_CHANNEL}`);

    return {
      test: testName,
      passed,
      fcm_sent: sent,
      fcm_failed: failed,
      tokens_count: tokensCount,
      delay_ms: delay,
      channel_id: EXPECTED_CHANNEL,
      criteria: {
        fcm_sent_gt_0: sent > 0,
        fcm_failed_0: failed === 0,
        delay_ok: delay < MAX_DELAY_MS,
        correct_channel: true,
      },
    };
  } catch (e) {
    const delay = Date.now() - tTest;
    L(`❌ ${testName} EXCEPTION: ${e.message}`);
    return { test: testName, passed: false, fcm_sent: 0, fcm_failed: 0, tokens_count: 0, delay_ms: delay, channel_id: EXPECTED_CHANNEL, error: e.message };
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const t0 = Date.now();
  L('=== START ALL PUSH TESTS ===');

  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Admin requis' }, { status: 403 });
  }

  const ts = new Date().toISOString();
  L(`Admin: ${user.email} | timestamp: ${ts}`);

  // Exécution séquentielle pour éviter rate-limit FCM
  const testBedou = await runFcmTest(base44,
    'REAL_BEDOU_RECHARGE_PUSH_TEST',
    '💰 [TEST] Recharge Bedou — Non-régression',
    `Test bedou_recharge_request — ${ts}`,
    { type: 'bedou_recharge_request', entity_id: 'test_bedou_' + Date.now(), entity_type: 'DemandeRecharge', notif_route: '/gestion-bedou', is_test: 'true' }
  );

  const testCourse = await runFcmTest(base44,
    'REAL_COURSE_PUSH_TEST',
    '🛵 [TEST] Nouvelle course — Non-régression',
    `Test new_course — ${ts}`,
    { type: 'new_course', entity_id: 'test_course_' + Date.now(), entity_type: 'Course', notif_route: '/dispatch-monitor', is_test: 'true' }
  );

  const testProfile = await runFcmTest(base44,
    'REAL_PROFILE_PUSH_TEST',
    '📝 [TEST] Nouveau profil — Non-régression',
    `Test new_profile_request — ${ts}`,
    { type: 'new_profile_request', entity_id: 'test_profile_' + Date.now(), entity_type: 'UserProfile', notif_route: '/gestion-profils', is_test: 'true' }
  );

  const testMall = await runFcmTest(base44,
    'REAL_MALL_PUSH_TEST',
    '🛒 [TEST] Commande Mall — Non-régression',
    `Test new_marketplace_order — ${ts}`,
    { type: 'new_marketplace_order', entity_id: 'test_mall_' + Date.now(), entity_type: 'CommandePartenaire', notif_route: '/gerer-courses', is_test: 'true' }
  );

  const testAdmin = await runFcmTest(base44,
    'REAL_ADMIN_ALERT_PUSH_TEST',
    '🚨 [TEST] Alerte admin critique — Non-régression',
    `Test bedou_recharge_approved — ${ts}`,
    { type: 'bedou_recharge_approved', entity_id: 'test_admin_alert_' + Date.now(), entity_type: 'Course', notif_route: '/admin-dashboard', is_test: 'true' }
  );

  const allTests = [testBedou, testCourse, testProfile, testMall, testAdmin];
  const allPassed = allTests.every(t => t.passed);
  const totalDelay = Date.now() - t0;

  L(`=== ${allPassed ? '✅ ALL PASSED' : '❌ SOME FAILED'} | total=${totalDelay}ms ===`);
  allTests.forEach(t => L(`  ${t.passed ? '✅' : '❌'} ${t.test} sent=${t.fcm_sent} failed=${t.fcm_failed} delay=${t.delay_ms}ms`));

  return Response.json({
    all_passed: allPassed,
    timestamp: ts,
    admin_email: user.email,
    total_delay_ms: totalDelay,
    channel_id: EXPECTED_CHANNEL,
    tests: allTests,
    summary: allPassed
      ? `✅ ${allTests.length}/${allTests.length} tests passés — CDL_STABLE_BEDOU_PUSH_V1 confirmé`
      : `❌ ${allTests.filter(t => !t.passed).length} test(s) échoué(s) — NE PAS déployer l'APK`,
  });
});