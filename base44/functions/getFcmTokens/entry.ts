import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * getFcmTokens — Retourne les tokens FCM actifs de l'utilisateur courant
 * Utilise le service role pour éviter les 403 côté APK natif
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let body = {};
    try { const t = await req.text(); if (t) body = JSON.parse(t); } catch (_) {}

    // Auth : header ou body.auth_token
    let authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    let effectiveReq = req;
    if (!authHeader && body.auth_token) {
      const newHeaders = new Headers(req.headers);
      newHeaders.set('Authorization', `Bearer ${body.auth_token}`);
      effectiveReq = new Request(req.url, { method: req.method, headers: newHeaders, body: JSON.stringify(body) });
    }

    const base44Auth = createClientFromRequest(effectiveReq);
    const user = await base44Auth.auth.me();
    if (!user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const tokens = await base44.asServiceRole.entities.FcmToken.filter(
      { user_email: user.email, is_active: true },
      '-registered_at',
      10
    );

    return Response.json({ tokens });
  } catch (error) {
    console.error('[getFcmTokens] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});