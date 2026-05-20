/**
 * testOAuth2Firebase — Diagnostic complet chaîne OAuth2 + FCM
 * Vérifie :
 * 1. Validité du service account JSON
 * 2. Génération du token OAuth2
 * 3. Appel API FCM v1 avec token
 * 4. Permissions du service account
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[OAUTH2_FIREBASE_DIAG] START | user:', user.email);

    const saJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (!saJson) {
      return Response.json({
        success: false,
        error: 'FIREBASE_SERVICE_ACCOUNT_JSON non configuré',
        step: 'ENV_CHECK',
      }, { status: 500 });
    }

    // ÉTAPE 1: Parser le JSON
    let sa;
    try {
      sa = JSON.parse(saJson);
      console.log('[OAUTH2_FIREBASE_DIAG] ✅ SA_JSON parsé');
    } catch (e) {
      return Response.json({
        success: false,
        error: 'JSON invalide: ' + e.message,
        step: 'JSON_PARSE',
      }, { status: 500 });
    }

    // ÉTAPE 2: Vérifier champs requis
    const requiredFields = ['project_id', 'private_key_id', 'private_key', 'client_email', 'client_id', 'auth_uri', 'token_uri'];
    const missingFields = requiredFields.filter(f => !sa[f]);
    
    if (missingFields.length > 0) {
      return Response.json({
        success: false,
        error: 'Champs manquants',
        missing_fields: missingFields,
        step: 'FIELD_CHECK',
      }, { status: 500 });
    }

    console.log('[OAUTH2_FIREBASE_DIAG] ✅ Champs requis présents');
    console.log('[FCM_PROJECT_ID]', sa.project_id);
    console.log('[FCM_CLIENT_EMAIL]', sa.client_email);
    console.log('[FCM_PRIVATE_KEY_ID]', sa.private_key_id);
    console.log('[FCM_PRIVATE_KEY_LENGTH]', sa.private_key?.length || 0);

    // ÉTAPE 3: Générer token OAuth2
    let accessToken;
    try {
      accessToken = await getAccessToken(sa);
      console.log('[FCM_ACCESS_TOKEN_CREATED]', `len=${accessToken.length} preview=${accessToken.slice(0, 40)}...`);
    } catch (e) {
      return Response.json({
        success: false,
        error: 'Échec génération token OAuth2: ' + e.message,
        step: 'OAUTH2_TOKEN_GENERATION',
        details: e.message,
      }, { status: 500 });
    }

    // ÉTAPE 4: Tester appel API FCM (sans envoyer de notif - juste HEADERS)
    const testToken = 'test_invalid_token_for_diagnostics';
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
    
    console.log('[FCM_HTTP_REQUEST]', fcmUrl);
    
    const testRes = await fetch(fcmUrl, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${accessToken}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        message: {
          token: testToken,
          notification: { title: 'Test', body: 'Diagnostic' },
        },
      }),
    });

    const testResult = await testRes.json().catch(() => ({}));
    
    console.log('[FCM_HTTP_RESPONSE]', {
      status: testRes.status,
      statusText: testRes.statusText,
      error: testResult?.error,
    });

    // Interpréter la réponse
    let apiStatus = 'UNKNOWN';
    let permissions = 'UNKNOWN';
    
    if (testRes.status === 404 || testResult?.error?.details?.[0]?.errorCode === 'NOT_FOUND') {
      // Token invalide attendu — API fonctionne
      apiStatus = '✅ API_FCM_ACCESSIBLE';
      permissions = '✅ SERVICE_ACCOUNT_AUTHORIZED';
      console.log('[FCM_API_STATUS]', apiStatus);
      console.log('[FCM_PERMISSIONS]', permissions);
    } else if (testRes.status === 403) {
      apiStatus = '❌ 403_FORBIDDEN';
      const errCode = testResult?.error?.details?.[0]?.errorCode || testResult?.error?.status;
      const errMsg = testResult?.error?.message || '';
      permissions = `❌ PERMISSION_DENIED | code=${errCode}`;
      console.error('[FCM_HTTP_403_REASON]', {
        errorCode: errCode,
        message: errMsg,
        suggestion: 'Vérifier que le service account a les rôles:\n- Firebase Admin SDK Administrator Service Agent\n- Firebase Cloud Messaging API Admin',
      });
    } else if (testRes.status === 401) {
      apiStatus = '❌ 401_UNAUTHORIZED';
      permissions = '❌ INVALID_CREDENTIALS';
      console.error('[FCM_401_REASON]', testResult?.error);
    } else if (testRes.status === 400) {
      // Invalid argument — API fonctionne mais token test invalide
      apiStatus = '✅ API_FCM_ACCESSIBLE';
      permissions = '✅ SERVICE_ACCOUNT_AUTHORIZED';
      console.log('[FCM_API_STATUS]', apiStatus);
      console.log('[FCM_PERMISSIONS]', permissions);
    } else if (testRes.ok) {
      // Inattendu avec un token test
      apiStatus = '✅ API_FCM_ACCESSIBLE';
      permissions = '✅ SERVICE_ACCOUNT_AUTHORIZED';
      console.log('[FCM_API_STATUS]', apiStatus);
      console.log('[FCM_PERMISSIONS]', permissions);
    }

    const elapsed = Date.now() - t0;

    return Response.json({
      success: true,
      elapsed_ms: elapsed,
      oauth2: {
        token_generated: !!accessToken,
        token_length: accessToken?.length || 0,
        token_preview: accessToken ? `${accessToken.slice(0, 40)}...` : null,
      },
      firebase: {
        project_id: sa.project_id,
        client_email: sa.client_email,
        private_key_id: sa.private_key_id,
        private_key_length: sa.private_key?.length || 0,
      },
      api_test: {
        url: fcmUrl,
        http_status: testRes.status,
        http_status_text: testRes.statusText,
        response: testResult,
        api_status: apiStatus,
        permissions: permissions,
      },
      diagnostics: {
        next_steps: [
          apiStatus.includes('✅') 
            ? '✅ API FCM opérationnelle — vérifier tokens en BDD' 
            : '❌ Vérifier permissions du service account dans Google Cloud Console',
          '1. Aller sur https://console.cloud.google.com/iam-admin/iam',
          `2. Sélectionner le projet: ${sa.project_id}`,
          '3. Trouver le service account: ' + sa.client_email,
          '4. Vérifier les rôles:',
          '   - Firebase Admin SDK Administrator Service Agent',
          '   - Firebase Cloud Messaging API Admin',
          '5. Si manquants → Ajouter les rôles → Sauvegarder',
          '6. Attendre 2-3 minutes → Retester',
        ],
      },
    });

  } catch (criticalErr) {
    console.error('[OAUTH2_FIREBASE_DIAG] CRITICAL_ERROR:', criticalErr.message);
    return Response.json({
      success: false,
      error: criticalErr.message,
      step: 'CRITICAL_ERROR',
    }, { status: 500 });
  }
});