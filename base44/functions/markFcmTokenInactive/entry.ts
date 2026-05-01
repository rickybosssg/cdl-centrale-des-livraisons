import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * markFcmTokenInactive — Mark a token as inactive (Firebase error / not registered)
 * Called when Firebase returns "invalid token" or "not registered" error
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { token } = payload;

    if (!token) {
      return Response.json({ error: 'token required' }, { status: 400 });
    }

    // Find and mark as inactive
    const existing = await base44.entities.FcmToken.filter({
      token: token,
      user_email: user.email
    });

    if (existing && existing.length > 0) {
      await base44.entities.FcmToken.update(existing[0].id, {
        is_active: false
      });
      console.log(`[FCM] Token marked inactive: ${token.slice(0, 20)}...`);
      return Response.json({
        success: true,
        message: 'Token marked as inactive'
      });
    }

    return Response.json({
      success: false,
      error: 'Token not found'
    });
  } catch (error) {
    console.error('[FCM] Error:', error?.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});