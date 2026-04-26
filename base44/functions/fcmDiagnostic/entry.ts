/**
 * fcmDiagnostic — Vérifie la configuration Firebase FCM côté serveur
 * Teste : service account, project ID, accès FCM API, token valide
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    let bodyData = {};
    try {
      const text = await req.text();
      if (text) bodyData = JSON.parse(text);
    } catch (_) {}

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non authentifié' }, { status: 401 });

    const report = {
      timestamp: new Date().toISOString(),
      checks: {},
      summary: '',
      errors: [],
    };

    // ── 1. Vérifier FIREBASE_SERVICE_ACCOUNT_JSON ────────────────────────────
    const rawJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || '';
    if (!rawJson) {
      report.checks.service_account = { status: 'ERROR', detail: 'FIREBASE_SERVICE_ACCOUNT_JSON non défini' };
      report.errors.push('Secret FIREBASE_SERVICE_ACCOUNT_JSON manquant');
    } else {
      let sa;
      try {
        sa = JSON.parse(rawJson);
        report.checks.service_account = {
          status: 'OK',
          detail: `project_id=${sa.project_id} | client_email=${sa.client_email?.split('@')[0]}@...`,
        };
        report.projectId = sa.project_id;
        report.clientEmail = sa.client_email;
      } catch (e) {
        report.checks.service_account = { status: 'ERROR', detail: 'JSON invalide: ' + e.message };
        report.errors.push('Service account JSON malformé');
      }
    }

    // ── 2. Générer un access token OAuth2 ───────────────────────────────────
    let accessToken = null;
    if (report.checks.service_account?.status === 'OK') {
      try {
        const sa = JSON.parse(rawJson);
        accessToken = await getAccessToken(sa);
        report.checks.oauth_token = { status: 'OK', detail: 'Access token généré avec succès' };
      } catch (e) {
        report.checks.oauth_token = { status: 'ERROR', detail: e.message };
        report.errors.push('Impossible de générer le token OAuth: ' + e.message);
      }
    }

    // ── 3. Vérifier l'accès à l'API FCM (sans envoyer) ──────────────────────
    if (accessToken && report.projectId) {
      try {
        // Test léger : appel à l'API FCM avec un token fictif
        // On s'attend à une erreur 400/404 (pas 401/403) ce qui prouve que l'auth fonctionne
        const testRes = await fetch(
          `https://fcm.googleapis.com/v1/projects/${report.projectId}/messages:send`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: { token: 'DIAGNOSTIC_TEST_TOKEN' } }),
          }
        );
        const testData = await testRes.json();
        console.log('[fcmDiagnostic] FCM API test response:', testRes.status, JSON.stringify(testData));

        if (testRes.status === 401 || testRes.status === 403) {
          report.checks.fcm_api_access = {
            status: 'ERROR',
            detail: `Auth refusée (${testRes.status}): ${JSON.stringify(testData)}`,
          };
          report.errors.push('Accès API FCM refusé — vérifiez les permissions du service account');
        } else if (testRes.status === 400) {
          // 400 = token fictif rejeté MAIS l'auth a réussi → Firebase fonctionne côté serveur
          const fcmError = testData?.error?.details?.[0]?.errorCode || testData?.error?.message || '';
          report.checks.fcm_api_access = {
            status: 'OK',
            detail: `API FCM accessible ✅ (token test rejeté comme attendu: ${fcmError})`,
          };
        } else {
          report.checks.fcm_api_access = {
            status: 'WARN',
            detail: `Réponse inattendue ${testRes.status}: ${JSON.stringify(testData).slice(0, 100)}`,
          };
        }
      } catch (e) {
        report.checks.fcm_api_access = { status: 'ERROR', detail: 'Erreur réseau: ' + e.message };
        report.errors.push('Erreur accès API FCM: ' + e.message);
      }
    }

    // ── 4. Vérifier les tokens FCM en BDD pour cet utilisateur ──────────────
    try {
      const tokens = await base44.asServiceRole.entities.FcmToken.filter({
        user_email: user.email,
        is_active: true,
      });
      report.checks.tokens_in_db = {
        status: tokens.length > 0 ? 'OK' : 'ERROR',
        detail: tokens.length > 0
          ? `${tokens.length} token(s) trouvé(s) — types: ${tokens.map(t => t.device_type).join(', ')}`
          : `Aucun token FCM pour ${user.email} — l'APK doit s'enregistrer`,
      };
      report.tokensCount = tokens.length;
      report.tokens = tokens.map(t => ({
        type: t.device_type,
        preview: t.token?.slice(0, 20) + '...',
        registered_at: t.registered_at,
      }));
      if (tokens.length === 0) report.errors.push('Aucun token FCM en base — le device Android ne s\'est pas enregistré');
    } catch (e) {
      report.checks.tokens_in_db = { status: 'ERROR', detail: e.message };
    }

    // ── 5. Test envoi réel si token disponible ───────────────────────────────
    const test_send = bodyData.test_send === true || bodyData.test_send === '1' || bodyData.test_send === 1 ? '1' : null;
    if (test_send === '1' && accessToken && report.tokensCount > 0) {
      try {
        const tokens = await base44.asServiceRole.entities.FcmToken.filter({
          user_email: user.email,
          is_active: true,
        });
        const firstToken = tokens[0]?.token;
        const sa = JSON.parse(rawJson);
        const sendRes = await fetch(
          `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: {
                token: firstToken,
                notification: { title: '🔧 Test Diagnostic CDL', body: 'Firebase fonctionne !' },
                android: { priority: 'high', notification: { channel_id: 'default' } },
              },
            }),
          }
        );
        const sendData = await sendRes.json();
        report.checks.test_send = {
          status: sendRes.ok ? 'OK' : 'ERROR',
          detail: sendRes.ok
            ? `Envoyé ✅ — message_id: ${sendData.name}`
            : `Erreur ${sendRes.status}: ${JSON.stringify(sendData).slice(0, 200)}`,
        };
      } catch (e) {
        report.checks.test_send = { status: 'ERROR', detail: e.message };
      }
    }

    // ── Résumé ───────────────────────────────────────────────────────────────
    const hasErrors = report.errors.length > 0;
    report.summary = hasErrors
      ? `⚠️ ${report.errors.length} problème(s) détecté(s)`
      : '✅ Configuration Firebase côté serveur OK';

    // Instructions natives si tokens manquants
    if (report.tokensCount === 0) {
      report.native_checklist = [
        'Vérifier que android/app/google-services.json existe',
        'Le package_name dans google-services.json doit être "com.cdl.app" (package réel de l\'APK)',
        'Si google-services.json contient "com.cdl.ouaga" → re-télécharger depuis Firebase Console avec le bon package',
        'Vérifier apply plugin: com.google.gms.google-services dans android/app/build.gradle',
        'Exécuter: npx cap sync android',
        'Rebuild APK dans Android Studio (Build → Clean → Rebuild)',
        'Logcat: adb logcat -s FirebaseMessaging:* AndroidRuntime:E',
      ];
    }

    console.log('[fcmDiagnostic] Rapport:', JSON.stringify(report, null, 2));
    return Response.json(report);

  } catch (error) {
    console.error('[fcmDiagnostic] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  };
  const encodeB64Url = (obj) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const headerB64 = encodeB64Url({ alg: 'RS256', typ: 'JWT' });
  const payloadB64 = encodeB64Url(payload);
  const signingInput = `${headerB64}.${payloadB64}`;
  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '');
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${signingInput}.${sigB64}`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('OAuth échoué: ' + JSON.stringify(tokenData));
  return tokenData.access_token;
}