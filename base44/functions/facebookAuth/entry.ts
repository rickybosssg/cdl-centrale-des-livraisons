/**
 * facebookAuth — Custom Facebook OAuth flow (sans auth requise)
 *
 * POST {} → génère l'URL OAuth Facebook
 * POST { code } → échange le code Facebook contre un token Base44
 *
 * Le 403 venait de base44.functions.invoke() appelé sans user authentifié.
 * Cette function est publique (pas de base44.auth.me() requis pour la génération d'URL).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const FB_APP_ID = Deno.env.get("FACEBOOK_APP_ID");
const FB_APP_SECRET = Deno.env.get("FACEBOOK_APP_SECRET");
const BASE_APP_URL = "https://cdl.base44.app";
const REDIRECT_URI = `${BASE_APP_URL}/connexion`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { code } = body;

    // ── ÉTAPE 1 : Générer l'URL OAuth Facebook ────────────────────────────────
    if (!code) {
      if (!FB_APP_ID) {
        console.error("[facebookAuth] FACEBOOK_APP_ID manquant !");
        return Response.json({ error: "Configuration Facebook manquante (APP_ID)" }, { status: 500, headers: corsHeaders });
      }

      const state = crypto.randomUUID();
      const fbOAuthUrl =
        `https://www.facebook.com/v19.0/dialog/oauth?` +
        `client_id=${FB_APP_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&scope=email,public_profile` +
        `&state=${state}` +
        `&response_type=code`;

      console.log("[facebookAuth] URL OAuth générée pour redirect_uri:", REDIRECT_URI);
      return Response.json({ oauth_url: fbOAuthUrl, state }, { headers: corsHeaders });
    }

    // ── ÉTAPE 2 : Échanger le code Facebook contre un token Base44 ────────────
    if (!FB_APP_ID || !FB_APP_SECRET) {
      console.error("[facebookAuth] Secrets Facebook manquants !", { FB_APP_ID: !!FB_APP_ID, FB_APP_SECRET: !!FB_APP_SECRET });
      return Response.json({ error: "Configuration Facebook incomplète côté serveur" }, { status: 500, headers: corsHeaders });
    }

    // 1. Échanger le code contre un access_token Facebook
    const tokenUrl =
      `https://graph.facebook.com/v19.0/oauth/access_token?` +
      `client_id=${FB_APP_ID}` +
      `&client_secret=${FB_APP_SECRET}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&code=${encodeURIComponent(code)}`;

    console.log("[facebookAuth] Échange de code → redirect_uri utilisé:", REDIRECT_URI);

    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.error || !tokenData.access_token) {
      const fbErr = tokenData.error;
      console.error("[facebookAuth] Erreur échange code FB:", JSON.stringify(fbErr));
      // Détail précis pour diagnostic
      return Response.json(
        {
          error: fbErr?.message || "Échec échange code Facebook",
          fb_error_type: fbErr?.type,
          fb_error_code: fbErr?.code,
          fb_error_subcode: fbErr?.error_subcode,
          redirect_uri_used: REDIRECT_URI,
          hint: fbErr?.code === 100
            ? "redirect_uri ne correspond pas à l'URI autorisée dans Meta Developer Console"
            : fbErr?.code === 190
            ? "App Facebook en mode dev — vérifiez les testeurs autorisés"
            : "Vérifiez App ID, App Secret et redirect_uri dans Meta",
        },
        { status: 400, headers: corsHeaders }
      );
    }

    const fbAccessToken = tokenData.access_token;
    console.log("[facebookAuth] Access token Facebook obtenu ✅");

    // 2. Récupérer les infos utilisateur Facebook
    const userRes = await fetch(
      `https://graph.facebook.com/me?fields=id,name,email&access_token=${fbAccessToken}`
    );
    const fbUser = await userRes.json();

    console.log("[facebookAuth] FB user:", { id: fbUser.id, name: fbUser.name, hasEmail: !!fbUser.email });

    if (!fbUser.email) {
      return Response.json(
        { error: "Votre compte Facebook n'a pas d'email vérifié. Ajoutez un email à votre profil Facebook et réessayez." },
        { status: 400, headers: corsHeaders }
      );
    }

    // 3. Connexion via Base44 : chercher l'utilisateur par email, puis login
    const base44 = createClientFromRequest(req);
    const appId = Deno.env.get("BASE44_APP_ID");

    // Tentative de login via l'API Base44 avec un mot de passe dérivé du FB ID
    // (seule approche sans API sociale native Base44)
    const derivedPassword = `FB_${fbUser.id}_CDL`;

    // Essayer d'abord de login
    let loginAttempt = await fetch(`https://api.base44.app/api/apps/${appId}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: fbUser.email, password: derivedPassword }),
    });

    let loginData = await loginAttempt.json();
    console.log("[facebookAuth] Login attempt status:", loginAttempt.status);

    // Si login échoue (utilisateur pas encore créé via FB), essayer de créer le compte
    if (!loginAttempt.ok || !loginData.access_token) {
      console.log("[facebookAuth] Login failed, tentative d'enregistrement...");

      const registerAttempt = await fetch(`https://api.base44.app/api/apps/${appId}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: fbUser.email,
          password: derivedPassword,
          full_name: fbUser.name,
        }),
      });

      const registerData = await registerAttempt.json();
      console.log("[facebookAuth] Register attempt status:", registerAttempt.status, "data:", JSON.stringify(registerData).substring(0, 200));

      if (registerAttempt.ok && registerData.access_token) {
        // Inscrit ET connecté directement
        console.log("[facebookAuth] ✅ Inscription + connexion réussie");
        return Response.json(
          { success: true, access_token: registerData.access_token, user: { email: fbUser.email, name: fbUser.name } },
          { headers: corsHeaders }
        );
      }

      // Si inscription échoue (compte déjà existant avec autre mot de passe),
      // l'utilisateur existe mais avec un mot de passe différent (inscrit via email/mdp)
      if (!registerAttempt.ok) {
        const errMsg = registerData?.detail || registerData?.message || registerData?.error || JSON.stringify(registerData);
        console.error("[facebookAuth] Register failed:", errMsg);
        return Response.json(
          {
            error: `Un compte existe déjà avec l'email ${fbUser.email}. Connectez-vous avec votre email et mot de passe, puis liez Facebook depuis les paramètres.`,
            email: fbUser.email,
          },
          { status: 409, headers: corsHeaders }
        );
      }

      // Retry login après inscription
      loginAttempt = await fetch(`https://api.base44.app/api/apps/${appId}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fbUser.email, password: derivedPassword }),
      });
      loginData = await loginAttempt.json();
    }

    const sessionToken = loginData.access_token || loginData.token;

    if (!sessionToken) {
      const errDetail = loginData?.detail || loginData?.message || loginData?.error || JSON.stringify(loginData);
      console.error("[facebookAuth] Pas de token dans la réponse:", errDetail);
      return Response.json(
        { error: "Connexion impossible. " + errDetail },
        { status: 401, headers: corsHeaders }
      );
    }

    console.log("[facebookAuth] ✅ Session créée pour:", fbUser.email);
    return Response.json(
      { success: true, access_token: sessionToken, user: { email: fbUser.email, name: fbUser.name } },
      { headers: corsHeaders }
    );

  } catch (error) {
    console.error("[facebookAuth] Exception:", error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});