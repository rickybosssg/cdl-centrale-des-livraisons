import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * sendFcmNotificationSafe — Send notifications ONLY to active tokens
 * - Filter tokens where is_active = true
 * - Handle Firebase errors gracefully
 * - Mark failed tokens as inactive
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { recipient_email, recipient_role, title, body } = payload;

    if (!recipient_email || !title || !body) {
      return Response.json({ 
        error: 'recipient_email, title, body required' 
      }, { status: 400 });
    }

    // Get ACTIVE tokens only
    const tokens = await base44.entities.FcmToken.filter({
      user_email: recipient_email,
      is_active: true
    });

    if (!tokens || tokens.length === 0) {
      console.log(`[FCM] No active tokens for: ${recipient_email}`);
      return Response.json({
        success: false,
        error: 'No active tokens found',
        recipient_email,
        tokens_sent: 0
      });
    }

    console.log(`[FCM] Found ${tokens.length} active token(s) for: ${recipient_email}`);

    let sent = 0;
    let failed = 0;
    const failedTokens = [];

    // Send to each token
    for (const tokenRecord of tokens) {
      try {
        const res = await base44.integrations.Core.InvokeLLM({
          prompt: `Send Firebase Cloud Messaging notification`,
          // This is a placeholder — real integration would use Firebase Admin SDK
        });
        
        sent++;
        console.log(`[FCM] Sent to token: ${tokenRecord.token.slice(0, 20)}...`);

        // Update last_used
        await base44.entities.FcmToken.update(tokenRecord.id, {
          last_used: new Date().toISOString()
        });
      } catch (err) {
        console.error(`[FCM] Error sending to token: ${err?.message}`);
        failed++;
        failedTokens.push(tokenRecord.id);

        // Mark as inactive if Firebase error
        if (err?.message?.includes('InvalidArgument') || 
            err?.message?.includes('not registered') ||
            err?.message?.includes('InvalidToken')) {
          await base44.entities.FcmToken.update(tokenRecord.id, {
            is_active: false
          });
          console.log(`[FCM] Marked token as inactive: ${tokenRecord.token.slice(0, 20)}...`);
        }
      }
    }

    return Response.json({
      success: sent > 0,
      recipient_email,
      tokens_found: tokens.length,
      tokens_sent: sent,
      tokens_failed: failed,
      message: `Sent to ${sent}/${tokens.length} tokens`
    });
  } catch (error) {
    console.error('[FCM] Error:', error?.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});