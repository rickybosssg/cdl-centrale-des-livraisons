/**
 * facebookAuth — Custom Facebook OAuth flow
 * 
 * Step 1 (GET /): Generate Facebook OAuth URL → redirect user to Facebook
 * Step 2 (POST /): Exchange code for token → log user in via Base44
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const FB_APP_ID = Deno.env.get("FACEBOOK_APP_ID");
const FB_APP_SECRET = Deno.env.get("FACEBOOK_APP_SECRET");
const BASE_APP_URL = "https://cdl.base44.app";
const REDIRECT_URI = `${BASE_APP_URL}/connexion`;

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ── CORS ────────────────────────────────────────────────────────────────────
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // ── POST: Exchange FB code → Base44 session ────────────────────────────
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { code } = body;

      // Si pas de code → c'est une demande de génération d'URL OAuth (GET simulé)
      if (!code) {
        const state = crypto.randomUUID();
        const fbOAuthUrl =
          `https://www.facebook.com/v19.0/dialog/oauth?` +
          `client_id=${FB_APP_ID}` +
          `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
          `&scope=email,public_profile` +
          `&state=${state}` +
          `&response_type=code`;
        return Response.json({ oauth_url: fbOAuthUrl, state }, { headers: corsHeaders });
      }

      // 1. Exchange code for Facebook access token
      const tokenRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?` +
        `client_id=${FB_APP_ID}&client_secret=${FB_APP_SECRET}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code=${code}`
      );
      const tokenData = await tokenRes.json();

      if (tokenData.error || !tokenData.access_token) {
        console.error("[facebookAuth] Token exchange error:", tokenData.error);
        return Response.json(
          { error: tokenData.error?.message || "Failed to get Facebook access token" },
          { status: 400, headers: corsHeaders }
        );
      }

      const fbAccessToken = tokenData.access_token;

      // 2. Fetch user info from Facebook
      const userRes = await fetch(
        `https://graph.facebook.com/me?fields=id,name,email&access_token=${fbAccessToken}`
      );
      const fbUser = await userRes.json();

      if (!fbUser.email) {
        return Response.json(
          { error: "Votre compte Facebook n'a pas d'email vérifié. Ajoutez un email à votre profil Facebook." },
          { status: 400, headers: corsHeaders }
        );
      }

      // 3. Create Base44 client and find or create user
      const base44 = createClientFromRequest(req);

      // Try to find existing user by email
      let users = [];
      try {
        users = await base44.asServiceRole.entities.User.filter({ email: fbUser.email });
      } catch (_) {}

      let targetUser = users?.[0];

      // If user doesn't exist, we can't auto-create (Base44 handles registration)
      // Instead, use Base44's social login endpoint directly
      const appId = Deno.env.get("BASE44_APP_ID");

      // Use Base44 internal social login API to create session
      const loginRes = await fetch(`https://api.base44.app/api/apps/${appId}/auth/social/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "facebook",
          access_token: fbAccessToken,
          email: fbUser.email,
          name: fbUser.name,
          provider_id: fbUser.id,
        }),
      });

      if (!loginRes.ok) {
        const err = await loginRes.text();
        console.error("[facebookAuth] Base44 social login error:", err);
        return Response.json(
          { error: "Connexion échouée. Assurez-vous d'être invité dans l'application." },
          { status: 401, headers: corsHeaders }
        );
      }

      const loginData = await loginRes.json();
      const sessionToken = loginData.access_token || loginData.token;

      if (!sessionToken) {
        return Response.json(
          { error: "Pas de token de session reçu" },
          { status: 500, headers: corsHeaders }
        );
      }

      return Response.json(
        { success: true, access_token: sessionToken, user: { email: fbUser.email, name: fbUser.name } },
        { headers: corsHeaders }
      );
    }

    // ── GET: Generate Facebook OAuth URL ──────────────────────────────────
    if (req.method === "GET") {
      const state = crypto.randomUUID();
      const fbOAuthUrl =
        `https://www.facebook.com/v19.0/dialog/oauth?` +
        `client_id=${FB_APP_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&scope=email,public_profile` +
        `&state=${state}` +
        `&response_type=code`;

      return Response.json({ oauth_url: fbOAuthUrl, state }, { headers: corsHeaders });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });

  } catch (error) {
    console.error("[facebookAuth] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});