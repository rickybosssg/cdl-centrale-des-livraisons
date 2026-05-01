/**
 * fcmDiagnostic — Diagnostic complet FCM
 * Vérifie :
 * 1. Service Account valide (format JSON)
 * 2. Project ID extrait
 * 3. Access token généré (vérifie JWT signing)
 * 4. Appel FCM dummy (vérifie permissions "Firebase Admin")
 * 5. Tokens en BDD (nombre + derniers)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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
  const encodeB64Url = (obj) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const headerB64 = encodeB64Url(header);
  const payloadB64 = encodeB64Url(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `${signingInput}.${sigB64}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error("Impossible d'obtenir l'access token: " + JSON.stringify(tokenData));
  }
  return tokenData.access_token;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Admin only" }, { status: 403 });
  }

  const checks = {};
  const errors = [];

  try {
    // ── 1. Service Account JSON ────────────────────────────────────────────────
    const rawJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") || '';
    if (!rawJson) {
      errors.push("❌ FIREBASE_SERVICE_ACCOUNT_JSON non défini dans les secrets");
      checks.sa_json = { status: "FAIL", detail: "Secret manquant" };
      return Response.json({ checks, errors, summary: errors.join("\n") }, { status: 400 });
    }

    let serviceAccount;
    try {
      serviceAccount = JSON.parse(rawJson);
      checks.sa_json = { status: "OK", detail: `Valide (${Object.keys(serviceAccount).length} champs)` };
    } catch (e) {
      errors.push(`❌ JSON parsing: ${e.message}`);
      checks.sa_json = { status: "FAIL", detail: e.message };
      return Response.json({ checks, errors, summary: errors.join("\n") }, { status: 400 });
    }

    // ── 2. Project ID ──────────────────────────────────────────────────────────
    const projectId = serviceAccount.project_id;
    if (!projectId) {
      errors.push("❌ project_id manquant dans le Service Account JSON");
      checks.project_id = { status: "FAIL", detail: "Manquant" };
    } else if (!projectId.includes("cdl") && projectId !== "com.cdl.app") {
      errors.push(`⚠️ project_id = "${projectId}" — vérifier si c'est correct (devrait contenir 'cdl')`);
      checks.project_id = { status: "WARN", detail: projectId };
    } else {
      checks.project_id = { status: "OK", detail: projectId };
    }

    // ── 3. Client Email ────────────────────────────────────────────────────────
    const clientEmail = serviceAccount.client_email;
    if (!clientEmail) {
      errors.push("❌ client_email manquant dans le Service Account JSON");
      checks.client_email = { status: "FAIL", detail: "Manquant" };
    } else {
      checks.client_email = { status: "OK", detail: clientEmail };
    }

    // ── 4. Private Key ─────────────────────────────────────────────────────────
    const privateKey = serviceAccount.private_key;
    if (!privateKey || !privateKey.includes("PRIVATE KEY")) {
      errors.push("❌ private_key invalide ou manquant dans le Service Account JSON");
      checks.private_key = { status: "FAIL", detail: "Invalide ou absent" };
    } else {
      checks.private_key = { status: "OK", detail: "Présente (RSA)" };
    }

    // ── 5. Access Token ────────────────────────────────────────────────────────
    let accessToken;
    try {
      accessToken = await getAccessToken(serviceAccount);
      checks.access_token = { status: "OK", detail: "JWT signé et accepted par Google OAuth" };
    } catch (e) {
      errors.push(`❌ JWT signing ou OAuth: ${e.message}`);
      checks.access_token = { status: "FAIL", detail: e.message };
      return Response.json({ checks, errors, summary: errors.join("\n") }, { status: 400 });
    }

    // ── 6. Test FCM API (dummy message pour vérifier permissions) ──────────────
    const testRes = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: "test_token_invalid_12345",
          data: { test: "diagnostic" },
        },
      }),
    });

    const testResult = await testRes.json();
    if (testRes.status === 403) {
      errors.push(`❌ FCM API HTTP 403 FORBIDDEN — Le Service Account n'a pas les permissions "Firebase Admin" sur ce projet Firebase`);
      errors.push(`   → Vérifier dans Google Cloud Console : le service account doit avoir le rôle "Firebase Service Agent" (rôles/servicemanagement.admin)`);
      checks.fcm_api = { status: "FAIL", detail: "403 Forbidden — permissions insuffisantes" };
    } else if (testRes.status === 401) {
      errors.push(`❌ FCM API HTTP 401 UNAUTHORIZED — Access token invalide ou expiré`);
      checks.fcm_api = { status: "FAIL", detail: "401 Unauthorized" };
    } else if (testRes.status === 400 && testResult?.error?.message?.includes("INVALID_ARGUMENT")) {
      checks.fcm_api = { status: "OK", detail: "API accessible (token invalide attendu pour test)" };
    } else if (!testRes.ok) {
      errors.push(`⚠️ FCM API HTTP ${testRes.status}: ${testResult?.error?.message || JSON.stringify(testResult)}`);
      checks.fcm_api = { status: "WARN", detail: `HTTP ${testRes.status}` };
    } else {
      checks.fcm_api = { status: "OK", detail: "API accessible et répond" };
    }

    // ── 7. Tokens en BDD ───────────────────────────────────────────────────────
    const allTokens = await base44.asServiceRole.entities.FcmToken.list("-registered_at", 100);
    const activeTokens = allTokens.filter(t => t.is_active === true);
    checks.tokens_db = {
      status: activeTokens.length > 0 ? "OK" : "WARN",
      detail: `${activeTokens.length}/${allTokens.length} tokens actifs en BDD`
    };

    if (activeTokens.length > 0) {
      checks.last_tokens = activeTokens.slice(0, 3).map(t => ({
        device_type: t.device_type,
        user: t.user_email,
        registered_at: t.registered_at,
        token: t.token.slice(0, 30) + "...",
      }));
    } else {
      errors.push("⚠️ Aucun token actif en BDD — les utilisateurs doivent enregistrer leurs tokens FCM");
    }

    // ── Résumé ─────────────────────────────────────────────────────────────────
    const summary = errors.length === 0
      ? "✅ Configuration FCM CORRECTE — l'API est prête"
      : `❌ ${errors.length} problème(s) détecté(s)`;

    const native_checklist = errors.filter(e => e.includes("Service Agent")).length > 0 ? [
      "1. Google Cloud Console → Sélectionner le projet CDL",
      "2. IAM & Admin → Service Accounts",
      "3. Cliquer sur le Service Account utilisé par Base44",
      "4. Onglet Rôles → Ajouter un rôle",
      "5. Chercher 'Firebase Service Agent' et l'assigner",
      "6. Sauvegarder",
      "7. Relancer le test",
    ] : [];

    return Response.json({
      checks,
      errors,
      summary,
      native_checklist: native_checklist.length > 0 ? native_checklist : null,
    });
  } catch (error) {
    console.error('[fcmDiagnostic] Error:', error.message);
    return Response.json({
      checks,
      errors: [...errors, error.message],
      summary: "❌ Erreur non gérée — voir serveur logs",
    }, { status: 500 });
  }
});