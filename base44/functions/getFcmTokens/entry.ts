import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * getFcmTokens — Retourne les tokens FCM actifs d'un utilisateur.
 */
Deno.serve(async (req) => {
  try {
    let body = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } catch (_) {}

    const { user_email } = body;
    const base44 = createClientFromRequest(req);

    let targetEmail = user_email;

    if (!targetEmail) {
      const user = await base44.auth.me();
      if (!user?.email) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      targetEmail = user.email;
    }

    console.log('[getFcmTokens] user_email:', targetEmail);

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