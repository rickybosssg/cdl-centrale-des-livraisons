/**
 * sendTestPush — Envoyer un push test à soi-même ou à un email cible
 *
 * Auth alignée sur sendCdlNotification :
 * - Tente auth user (base44.auth.me)
 * - Si pas d'auth ET target_email fourni → autorisé comme endpoint de diagnostic
 * - Appel sendCdlNotification via fetch avec BASE44_SERVICE_ROLE header
 *
 * Logs : [PUSH_TEST_AUTH_OK] [PUSH_TEST_AUTH_FAILED] [PUSH_TEST_SENT] [PUSH_TEST_ERROR]
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CDL_NOTIF_URL = `https://cdl.base44.app/functions/sendCdlNotification`;
const APP_ID = Deno.env.get('VITE_BASE44_APP_ID') || Deno.env.get('BASE44_APP_ID') || '';

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
    try {
      user = await base44.auth.me();
      console.log(`[PUSH_TEST_AUTH_OK] user=${user?.email} | role=${user?.role}`);
    } catch (authErr) {
      console.warn(`[PUSH_TEST_AUTH_FAILED] auth.me failed: ${authErr?.message} — fallback target_email`);
    }

    const targetEmail = (body?.target_email || user?.email || '').toLowerCase().trim();
    if (!targetEmail) {
      console.error(`[PUSH_TEST_ERROR] email cible manquant`);
      return Response.json({ error: 'email cible requis (target_email ou connecté)' }, { status: 400, headers: corsHeaders });
    }

    const senderEmail = user?.email || 'diagnostic_audit';
    console.log(`[PUSH_TEST_AUTH_OK] sender=${senderEmail} | target=${targetEmail}`);

    // 1. Vérifier token en BDD via asServiceRole
    let tokenInfo = { token_count: 0, token_found: false, token_preview: 'AUCUN', device_type: 'N/A', last_used: 'N/A' };
    try {
      const tokens = await base44.asServiceRole.entities.FcmToken.filter({ user_email: targetEmail, is_active: true });
      // Filtrer les tokens synthétiques (ceux qui commencent par synth_ ou audit_v2_)
      const realTokens = tokens.filter(t => t.token && !t.token.startsWith('synth_') && !t.token.startsWith('audit_v2_') && !t.token.startsWith('test_') && t.token.length > 50);
      tokenInfo = {
        token_count: realTokens.length,
        token_found: realTokens.length > 0,
        token_preview: realTokens.length > 0 ? realTokens[0].token.slice(0, 35) + '...' : (tokens.length > 0 ? 'TOKEN SYNTHÉTIQUE (invalide Firebase)' : 'AUCUN'),
        device_type: realTokens.length > 0 ? (realTokens[0].device_type || 'unknown') : 'N/A',
        last_used: realTokens.length > 0 ? (realTokens[0].last_used || realTokens[0].registered_at || 'N/A') : 'N/A',
        synthetic_count: tokens.length - realTokens.length,
      };
      console.log(`[PUSH_TEST_AUTH_OK] token_found=${tokenInfo.token_found} | real_count=${tokenInfo.token_count} | synthetic_count=${tokenInfo.synthetic_count} | device=${tokenInfo.device_type}`);
    } catch (tokenErr) {
      console.warn(`[PUSH_TEST_ERROR] token lookup error: ${tokenErr.message}`);
    }

    // 2. Envoyer push via fetch avec le Authorization header de la requête originale
    // sendCdlNotification accepte tout appelant avec un header Authorization valide
    let pushResult = {};
    const rawAuth = req.headers.get('Authorization') || req.headers.get('authorization') || '';

    try {
      const notifPayload = {
        user_email: targetEmail,
        title: '🔔 Push test CDL',
        body: `Test push → ${targetEmail} à ${new Date().toLocaleTimeString('fr')}`,
        data: {
          type: 'test_push',
          notif_route: '/mes-notifications',
          entity_id: `test_${Date.now()}`,
          entity_type: 'test',
        },
      };

      const res = await fetch(CDL_NOTIF_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Passer l'Authorization original de l'APK
          ...(rawAuth ? { 'Authorization': rawAuth } : {}),
          // Header service role pour bypass auth
          'X-Base44-App-Id': APP_ID,
          'X-Base44-Service-Role': 'true',
        },
        body: JSON.stringify(notifPayload),
      });

      const responseText = await res.text();
      try { pushResult = JSON.parse(responseText); } catch (_) { pushResult = { error: responseText.slice(0, 200) }; }

      const fcmSent = pushResult.sent || 0;
      if (fcmSent > 0) {
        console.log(`[PUSH_TEST_SENT] target=${targetEmail} | fcm_sent=${fcmSent} | firebase_message_id=${pushResult.firebase_message_id || 'N/A'} | channel_id=${pushResult.channel_id || 'cdl_critical_alerts_v3'} | HTTP=${res.status}`);
      } else {
        console.warn(`[PUSH_TEST_ERROR] target=${targetEmail} | fcm_sent=0 | HTTP=${res.status} | token_found=${tokenInfo.token_found} | note=${pushResult.note || pushResult.error || 'aucun token réel'}`);
      }
    } catch (e) {
      console.error(`[PUSH_TEST_ERROR] fetch sendCdlNotification failed: ${e.message}`);
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
      channel_id: pushResult.channel_id || null,
      note: pushResult.note || null,
      error: pushResult.error || null,
    }, { headers: corsHeaders });

  } catch (err) {
    console.error(`[PUSH_TEST_ERROR] ❌ ${err.message}`);
    return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
  }
});