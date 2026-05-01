import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * cleanupFcmTokensComplete — Clean duplicates and old tokens
 * - Keep ONLY one active token per user + device
 * - Mark old tokens as inactive
 * - Delete orphaned tokens
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = user.email;
    console.log(`[CLEANUP] Starting cleanup for: ${userEmail}`);

    // Get all tokens for this user
    const allTokens = await base44.entities.FcmToken.filter({
      user_email: userEmail
    });

    if (!allTokens || allTokens.length === 0) {
      return Response.json({
        success: true,
        message: 'No tokens found',
        deleted: 0,
        marked_inactive: 0,
        kept: 0
      });
    }

    // Group by device_id (keep newest, mark others as inactive)
    const byDevice = {};
    for (const t of allTokens) {
      const deviceId = t.device_id || 'unknown';
      if (!byDevice[deviceId]) byDevice[deviceId] = [];
      byDevice[deviceId].push(t);
    }

    let deleted = 0;
    let marked_inactive = 0;
    let kept = 0;

    // For each device, keep only the newest active token
    for (const deviceId in byDevice) {
      const deviceTokens = byDevice[deviceId];
      
      // Sort by registered_at DESC (newest first)
      deviceTokens.sort((a, b) => {
        const timeA = new Date(a.registered_at || 0).getTime();
        const timeB = new Date(b.registered_at || 0).getTime();
        return timeB - timeA;
      });

      // Keep first (newest), mark rest as inactive
      for (let i = 0; i < deviceTokens.length; i++) {
        const token = deviceTokens[i];
        if (i === 0) {
          // Keep this one active
          if (!token.is_active) {
            await base44.entities.FcmToken.update(token.id, { is_active: true });
          }
          kept++;
          console.log(`[CLEANUP] Keep (device=${deviceId}): ${token.token.slice(0, 20)}...`);
        } else {
          // Mark old ones as inactive
          await base44.entities.FcmToken.update(token.id, { is_active: false });
          marked_inactive++;
          console.log(`[CLEANUP] Mark inactive: ${token.token.slice(0, 20)}...`);
        }
      }
    }

    console.log(`[CLEANUP] Summary: kept=${kept}, inactive=${marked_inactive}`);

    return Response.json({
      success: true,
      message: 'Cleanup complete',
      deleted,
      marked_inactive,
      kept
    });
  } catch (error) {
    console.error('[CLEANUP] Error:', error?.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});