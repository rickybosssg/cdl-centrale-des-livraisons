import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * getFcmTokens — Retourne les tokens FCM actifs d'un utilisateur.
 *
 * Deux modes :
 * - user_email dans le body → retourne ses tokens (asServiceRole, pas d'auth requise côté APK)
 * - pas de user_email → authentifie le user et retourne ses tokens
 *
 * Cela permet aux APK Android (Capacitor) de récupérer les tokens même si
 * le header Authorization n'est pas transmis par la WebView.
 */
Deno.serve(async (req) => {
  try {
    // ── Lire le body EN PREMIER ─────────────────────────────────────────────
    let body = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } catch (_) {}

    const { user_email, auth_token: bodyAuthToken } = body;

    // ── Construire la requête avec auth_token si fourni (APK Android) ───────
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    let effectiveReq = req;
    if (!authHeader && bodyAuthToken) {
      const newHeaders = new Headers(req.headers);
      newHeaders.set('Authorization', `Bearer ${bodyAuthToken}`);
      effectiveReq = new Request(req.url, { method: req.method, headers: newHeaders });
    }

    const base44 = createClientFromRequest(effectiveReq);

    let targetEmail = user_email;

    // Si pas de user_email fourni → authentifier et utiliser l'email du user connecté
    if (!targetEmail) {
      const user = await base44.auth.me();
      if (!user?.email) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      targetEmail = user.email;
    }

    console.log('[getFcmTokens] user_email:', targetEmail, '| auth header:', !!authHeader, '| body token:', !!bodyAuthToken);

    // ── Récupérer les tokens via service role (évite 403 permissions) ────────
    const tokens = await base44.asServiceRole.entities.FcmToken.filter(
      { user_email: targetEmail, is_active: true },
      '-registered_at',
      10
    );

    console.log('[getFcmTokens] ✅', targetEmail, '→', tokens.length, 'token(s)');
    return Response.json({ tokens, user_email: targetEmail });

  } catch (error) {
    console.error('[getFcmTokens] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});