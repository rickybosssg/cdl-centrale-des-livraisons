/**
 * sendTestPush — Envoyer un push test à soi-même ou à un email cible
 *
 * Sécurité alignée sur sendCdlNotification :
 * - Tente auth user (base44.auth.me)
 * - Si pas d'auth ET target_email fourni → autorisé comme endpoint semi-public de diagnostic
 * - Jamais de vérification admin — outil de diagnostic ouvert
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CDL_NOTIF_URL = `https://cdl.base44.app/functions/sendCdlNotification`;

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // Auth souple : tenter de récupérer le user, sinon continuer avec target_email
    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}

    const targetEmail = (body?.target_email || user?.email || '').toLowerCase().trim();
    if (!targetEmail) {
      return Response.json({ error: 'email cible requis (target_email ou connecté)' }, { status: 400, headers: corsHeaders });
    }

    const senderEmail = user?.email || 'diagnostic_audit';
    const rawAuth = req.headers.get('Authorization') || req.headers.get('authorization') || '';

    console.log(`[sendTestPush] START | sender=${senderEmail} | target=${targetEmail} | auth=${!!user}`);

    // 1. Vérifier token en BDD
    let tokenInfo = { token_count: 0, token_found: false, token_preview: 'AUCUN', device_type: 'N/A', last_used: 'N/A' };
    try {
      const tokens = await base44.asServiceRole.entities.FcmToken.filter({ user_email: targetEmail, is_active: true });
      tokenInfo = {
        token_count: tokens.length,
        token_found: tokens.length > 0,
        token_preview: tokens.length > 0 ? tokens[0].token.slice(0, 35) + '...' : 'AUCUN',
        device_type: tokens.length > 0 ? (tokens[0].device_type || 'unknown') : 'N/A',
        last_used: tokens.length > 0 ? (tokens[0].last_used || tokens[0].registered_at || 'N/A') : 'N/A',
      };
    } catch (tokenErr) {
      console.warn(`[sendTestPush] token lookup error: ${tokenErr.message}`);
    }

    console.log(`[sendTestPush] token_found=${tokenInfo.token_found} | count=${tokenInfo.token_count} | device=${tokenInfo.device_type}`);

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
          body: `Test push → ${targetEmail} à ${new Date().toLocaleTimeString('fr')}`,
          data: {
            type: 'test_push',
            notif_route: '/mes-notifications',
            entity_id: `test_${Date.now()}`,
            entity_type: 'test',
          },
        }),
      });
      pushResult = await res.json().catch(() => ({}));
      console.log(`[sendTestPush] push result: sent=${pushResult.sent} failed=${pushResult.failed} note=${pushResult.note}`);
    } catch (e) {
      pushResult = { error: e.message, sent: 0, failed: 1 };
    }

    return Response.json({
      success: (pushResult.sent || 0) > 0,
      target_email: targetEmail,
      sender_email: senderEmail,
      token_info: tokenInfo,
      fcm_sent: pushResult.sent || 0,
      fcm_failed: pushResult.failed || 0,
      bdd_created: pushResult.bdd || 0,
      firebase_message_id: pushResult.firebase_message_id || null,
      note: pushResult.note || null,
      error: pushResult.error || null,
    }, { headers: corsHeaders });

  } catch (err) {
    console.error(`[sendTestPush] ❌ ${err.message}`);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
});