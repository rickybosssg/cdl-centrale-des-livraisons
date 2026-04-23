import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * getFcmTokens — Retourne les tokens FCM actifs de l'utilisateur courant
 *
 * Auth robuste APK : lit le body EN PREMIER pour extraire auth_token,
 * puis reconstruit la requête avec le bon header Authorization.
 */
Deno.serve(async (req) => {
  try {
    // ── ÉTAPE 1 : Lire le body AVANT tout (avant createClientFromRequest) ──
    let body = {};
    let rawBody = '';
    try {
      rawBody = await req.text();
      if (rawBody) body = JSON.parse(rawBody);
    } catch (_) {}

    // ── ÉTAPE 2 : Déterminer le token d'auth (header ou body) ──────────────
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const bodyAuthToken = body.auth_token || '';

    console.log('[getFcmTokens] auth header présent:', !!authHeader, '| body auth_token présent:', !!bodyAuthToken);

    // Construire la requête effective avec le bon header Authorization
    let effectiveReq = req;
    if (!authHeader && bodyAuthToken) {
      const newHeaders = new Headers(req.headers);
      newHeaders.set('Authorization', `Bearer ${bodyAuthToken}`);
      // body déjà consommé — passer un nouveau body vide (auth_token déjà extrait)
      effectiveReq = new Request(req.url, {
        method: req.method,
        headers: newHeaders,
      });
      console.log('[getFcmTokens] Token auth injecté depuis le body');
    }

    // ── ÉTAPE 3 : Authentifier l'utilisateur ──────────────────────────────
    const base44 = createClientFromRequest(effectiveReq);
    const user = await base44.auth.me();
    if (!user?.email) {
      console.error('[getFcmTokens] Unauthorized — pas de user');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── ÉTAPE 4 : Récupérer les tokens via service role ───────────────────
    const tokens = await base44.asServiceRole.entities.FcmToken.filter(
      { user_email: user.email, is_active: true },
      '-registered_at',
      10
    );

    console.log('[getFcmTokens] ✅', user.email, '→', tokens.length, 'token(s)');
    return Response.json({ tokens, user_email: user.email });

  } catch (error) {
    console.error('[getFcmTokens] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});