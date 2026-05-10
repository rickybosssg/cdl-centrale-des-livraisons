/**
 * sendTestPush — Envoyer un push test à soi-même ou à un email cible
 * Usage : admin ou client connecté, sans toucher au Bedou.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CDL_NOTIF_URL = `https://cdl.base44.app/functions/sendCdlNotification`;
const APP_BASE_URL  = `https://cdl.base44.app/functions`;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    // target_email : optionnel, si admin veut tester un autre email
    const targetEmail = (body?.target_email || user.email || '').toLowerCase().trim();
    if (!targetEmail) return Response.json({ error: 'email cible requis' }, { status: 400 });

    const rawAuth = req.headers.get('Authorization') || req.headers.get('authorization') || '';

    // 1. Vérifier token en BDD
    const tokens = await base44.asServiceRole.entities.FcmToken.filter({ user_email: targetEmail, is_active: true });
    const tokenInfo = {
      token_count: tokens.length,
      token_found: tokens.length > 0,
      token_preview: tokens.length > 0 ? tokens[0].token.slice(0, 35) + '...' : 'AUCUN',
      device_type: tokens.length > 0 ? (tokens[0].device_type || 'unknown') : 'N/A',
      last_used: tokens.length > 0 ? (tokens[0].last_used || tokens[0].registered_at || 'N/A') : 'N/A',
    };

    console.log(`[sendTestPush] START | sender=${user.email} | target=${targetEmail} | token_found=${tokenInfo.token_found} | token_count=${tokenInfo.token_count}`);

    // 2. Envoyer push via sendCdlNotification
    let pushResult = {};
    try {
      const res = await fetch(CDL_NOTIF_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(rawAuth ? { 'Authorization': rawAuth } : {}),
        },
        body: JSON.stringify({
          user_email: targetEmail,
          title: '🔔 Push test CDL',
          body: `Test push envoyé à ${targetEmail} à ${new Date().toLocaleTimeString('fr')}`,
          data: {
            type: 'test_push',
            notif_route: '/mes-notifications',
            entity_id: `test_${Date.now()}`,
            entity_type: 'test',
          },
        }),
      });
      pushResult = await res.json().catch(() => ({}));
      console.log(`[sendTestPush] result=${JSON.stringify(pushResult)}`);
    } catch (e) {
      pushResult = { error: e.message, sent: 0, failed: 1 };
    }

    return Response.json({
      success: (pushResult.sent || 0) > 0,
      target_email: targetEmail,
      sender_email: user.email,
      token_info: tokenInfo,
      fcm_sent: pushResult.sent || 0,
      fcm_failed: pushResult.failed || 0,
      bdd_created: pushResult.bdd || 0,
      firebase_message_id: pushResult.firebase_message_id || null,
      note: pushResult.note || null,
      error: pushResult.error || null,
    });

  } catch (err) {
    console.error(`[sendTestPush] ❌ ${err.message}`);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
});