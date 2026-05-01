/**
 * cleanupAndRegisterFcmToken — Smart token deduplication
 * - Keep ONLY one active token per user + device_id
 * - Mark old tokens as inactive (not delete, for audit trail)
 * - Update last_used on existing token or create new one
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { token, device_type = 'android_native', device_id = 'unknown' } = body;

    if (!token) {
      return Response.json({ error: 'Token required' }, { status: 400 });
    }

    const user_email = user.email;
    console.log(`[cleanup] user: ${user_email} | device_id: ${device_id}`);

    // ── 1. Check if exact token already exists ────────────────────────────
    const exactToken = await base44.entities.FcmToken.filter({
      user_email: user_email,
      token: token,
    });

    if (exactToken && exactToken.length > 0) {
      // Same token — just update last_used
      console.log(`[cleanup] Token already exists, updating last_used`);
      await base44.entities.FcmToken.update(exactToken[0].id, {
        last_used: new Date().toISOString(),
        is_active: true,
      });

      return Response.json({
        success: true,
        action: 'updated',
        token_id: exactToken[0].id,
        old_token_removed: false,
        message: 'Token already registered',
      });
    }

    // ── 2. Get all tokens for this device (same user_email + device_id) ────
    const oldTokens = await base44.entities.FcmToken.filter({
      user_email: user_email,
      device_id: device_id,
    });

    let old_token_removed = false;
    let old_token_id = null;

    // Mark old tokens as inactive (instead of deleting)
    if (oldTokens && oldTokens.length > 0) {
      for (const oldToken of oldTokens) {
        if (oldToken.is_active) {
          await base44.entities.FcmToken.update(oldToken.id, {
            is_active: false,
          });
          console.log(`[cleanup] Marked old token inactive: ${oldToken.token.slice(0, 20)}...`);
          old_token_removed = true;
          old_token_id = oldToken.id;
        }
      }
    }

    // ── 3. Create new token ────────────────────────────────────────────────
    const now = new Date().toISOString();
    const newToken = await base44.entities.FcmToken.create({
      user_id: user.id,
      user_email: user_email,
      token: token,
      device_id: device_id,
      device_type: device_type,
      platform: 'android',
      registered_at: now,
      last_used: now,
      is_active: true,
    });

    console.log(`[cleanup] New token created: ${newToken.id}`);

    return Response.json({
      success: true,
      action: 'created',
      token_id: newToken.id,
      old_token_removed: old_token_removed,
      old_token_id: old_token_id,
      message: 'Token registered successfully',
    });
  } catch (error) {
    console.error('[cleanup] Error:', error?.message);
    return Response.json(
      { error: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
});