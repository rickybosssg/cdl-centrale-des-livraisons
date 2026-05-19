/**
 * fcmLiveTest — Test live complet FCM
 * Permet de :
 *  1. Vérifier les tokens en BDD pour un email
 *  2. Forcer l'enregistrement d'un token fourni manuellement
 *  3. Envoyer un push de test immédiatement
 *  4. Retourner les logs détaillés
 *
 * Actions :
 *  - "check" : lister les tokens de l'email
 *  - "register" : sauvegarder un token manuellement
 *  - "send" : envoyer push test (appelle sendCdlNotification directement)
 *  - "full" : check + send (workflow complet)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SA_JSON = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || '';
const CDL_CHANNEL = 'cdl_critical_alerts_v3';

function isTestToken(token) {
  if (!token || token.length < 50) return true;
  const t = String(token).toLowerCase();
  return t.startsWith('test_') || t.startsWith('synth_') || t.startsWith('audit_') || t.includes('_test_');
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const header = enc({ alg: 'RS256', typ: 'JWT' });
  const pl = enc({
    iss: sa.client_email, sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  });
  const input = `${header}.${pl}`;
  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\r\n|\n|\r/g, '');
  const key = await crypto.subtle.importKey(
    'pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${input}.${sigB64}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const d = await res.json();
  if (!d.access_token) throw new Error('OAuth failed: ' + JSON.stringify(d));
  return d.access_token;
}

Deno.serve(async (req) => {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  const t0 = Date.now();
  const logs = [];
  const log = (msg) => { console.log(msg); logs.push(msg); };
  const err = (msg) => { console.error(msg); logs.push(`❌ ${msg}`); };

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Non authentifié' }, { status: 401, headers: corsHeaders });
    log(`[fcmLiveTest] user=${user.email} role=${user.role}`);

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'full';
    const targetEmail = (body.target_email || user.email).toLowerCase().trim();
    const providedToken = body.fcm_token || null;

    log(`[fcmLiveTest] action=${action} | target=${targetEmail}`);

    // ── CHECK : lister les tokens ─────────────────────────────────────────
    const allTokens = await base44.asServiceRole.entities.FcmToken.filter({ user_email: targetEmail }, '-updated_date', 20);
    const activeTokens = allTokens.filter(t => t.is_active && !isTestToken(t.token));
    const inactiveTokens = allTokens.filter(t => !t.is_active && !isTestToken(t.token));

    log(`[fcmLiveTest] tokens_total=${allTokens.length} | actifs=${activeTokens.length} | inactifs_valides=${inactiveTokens.length}`);

    if (allTokens.length > 0) {
      const best = activeTokens[0] || inactiveTokens[0];
      if (best) {
        log(`[fcmLiveTest] best_token=${best.token.slice(0, 40)}... | is_active=${best.is_active} | device=${best.device_type} | profile=${best.active_profile_type || 'N/A'} | last_used=${best.last_used || 'N/A'}`);
      }
    }

    if (action === 'check') {
      return Response.json({
        action: 'check',
        target_email: targetEmail,
        tokens_total: allTokens.length,
        active_count: activeTokens.length,
        inactive_count: inactiveTokens.length,
        tokens: allTokens.map(t => ({
          id: t.id,
          token_preview: t.token?.slice(0, 40) + '...',
          is_active: t.is_active,
          device_type: t.device_type,
          active_profile_type: t.active_profile_type,
          last_used: t.last_used,
          last_seen: t.last_seen,
          registered_at: t.registered_at,
          is_test: isTestToken(t.token),
        })),
        logs,
        elapsed_ms: Date.now() - t0,
      }, { headers: corsHeaders });
    }

    // ── REGISTER : sauvegarder un token fourni ────────────────────────────
    if (action === 'register') {
      if (!providedToken || providedToken.length < 50) {
        return Response.json({ error: 'fcm_token requis et doit faire >50 chars', logs }, { status: 400, headers: corsHeaders });
      }
      const now = new Date().toISOString();
      // Vérifier si déjà en BDD
      const existing = allTokens.find(t => t.token === providedToken);
      if (existing) {
        await base44.asServiceRole.entities.FcmToken.update(existing.id, { is_active: true, last_used: now, last_seen: now, active_profile_type: body.profile_type || existing.active_profile_type });
        log(`[fcmLiveTest] register: token EXISTANT réactivé | id=${existing.id}`);
        return Response.json({ action: 'register', result: 'reactivated', token_id: existing.id, logs, elapsed_ms: Date.now() - t0 }, { headers: corsHeaders });
      }
      const created = await base44.asServiceRole.entities.FcmToken.create({
        user_email: targetEmail,
        token: providedToken,
        device_type: body.device_type || 'android_native',
        platform: body.platform || 'android',
        device_id: body.device_id || null,
        active_profile_type: body.profile_type || null,
        registered_at: now,
        last_used: now,
        last_seen: now,
        is_active: true,
      });
      // Désactiver les anciens
      for (const t of allTokens) {
        if (t.is_active) await base44.asServiceRole.entities.FcmToken.update(t.id, { is_active: false }).catch(() => {});
      }
      log(`[fcmLiveTest] register: nouveau token créé | id=${created.id}`);
      return Response.json({ action: 'register', result: 'created', token_id: created.id, logs, elapsed_ms: Date.now() - t0 }, { headers: corsHeaders });
    }

    // ── SEND / FULL : envoyer push ────────────────────────────────────────
    if (action === 'send' || action === 'full') {
      // Re-résoudre les tokens après un éventuel register
      const freshTokens = await base44.asServiceRole.entities.FcmToken.filter({ user_email: targetEmail }, '-updated_date', 20);
      const validActive = freshTokens.filter(t => t.is_active && !isTestToken(t.token));
      const validInactive = freshTokens.filter(t => !t.is_active && !isTestToken(t.token));
      const targets = validActive.length > 0 ? validActive : validInactive.slice(0, 1);

      if (targets.length === 0) {
        err(`[fcmLiveTest] SEND ABORT — aucun token FCM valide pour ${targetEmail}`);
        return Response.json({
          action,
          fcm_sent: 0,
          reason: 'NO_TOKEN',
          target_email: targetEmail,
          tokens_total: freshTokens.length,
          logs,
          elapsed_ms: Date.now() - t0,
          fix: "1. Ouvre l'APK CDL → 2. Autorise notifications → 3. action='register' avec ton token natif, OU 4. Rebuild l'APK avec les nouvelles corrections FCM",
        }, { headers: corsHeaders });
      }

      log(`[fcmLiveTest] SEND: tokens_count=${targets.length} | best=${targets[0].token.slice(0, 40)}...`);

      if (!SA_JSON) {
        err('[fcmLiveTest] FIREBASE_SERVICE_ACCOUNT_JSON manquant');
        return Response.json({ error: 'SA_JSON missing', logs }, { status: 500, headers: corsHeaders });
      }

      const sa = JSON.parse(SA_JSON);
      const accessToken = await getAccessToken(sa);
      log(`[fcmLiveTest] Firebase OAuth OK | project=${sa.project_id}`);

      const now = new Date().toISOString();
      const title = '🔔 CDL Push Test Live';
      const bodyTxt = `Test réel → ${targetEmail} · ${new Date().toLocaleTimeString('fr')}`;
      const dataPayload = {
        type: 'test_push_live',
        notif_route: '/mes-notifications',
        entity_id: `live_${Date.now()}`,
        entity_type: 'test',
        screen: '/mes-notifications',
        deep_link: '/mes-notifications',
        title,
        body: bodyTxt,
        notification_sent_at: now,
      };

      let sent = 0, failed = 0;
      const fcmResults = [];
      for (const tokenRecord of targets) {
        try {
          const fcmRes = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: {
                token: tokenRecord.token,
                notification: { title, body: bodyTxt },
                data: Object.fromEntries(Object.entries(dataPayload).map(([k, v]) => [k, String(v ?? '')])),
                android: {
                  priority: 'HIGH',
                  ttl: '86400s',
                  notification: {
                    channel_id: CDL_CHANNEL,
                    sound: 'default',
                    visibility: 'PUBLIC',
                    notification_priority: 'PRIORITY_MAX',
                    default_sound: true,
                    default_vibrate_timings: true,
                    notification_count: 1,
                    tag: `cdl_live_test_${Date.now()}`,
                  },
                },
              },
            }),
          });
          const fcmJson = await fcmRes.json().catch(() => ({}));
          if (fcmRes.ok) {
            sent++;
            log(`[fcmLiveTest] ✅ FCM OK | token=${tokenRecord.token.slice(0, 30)}... | msgId=${fcmJson.name || 'N/A'} | device=${tokenRecord.device_type} | profile=${tokenRecord.active_profile_type || 'N/A'}`);
            fcmResults.push({ ok: true, token_preview: tokenRecord.token.slice(0, 35) + '...', msgId: fcmJson.name, device_type: tokenRecord.device_type, profile: tokenRecord.active_profile_type });
            await base44.asServiceRole.entities.FcmToken.update(tokenRecord.id, { last_used: now, is_active: true }).catch(() => {});
          } else {
            failed++;
            const errCode = fcmJson?.error?.details?.[0]?.errorCode || fcmJson?.error?.status || 'FCM_ERROR';
            err(`[fcmLiveTest] ❌ FCM FAIL | token=${tokenRecord.token.slice(0, 30)}... | errCode=${errCode} | HTTP=${fcmRes.status} | msg=${fcmJson?.error?.message || '?'}`);
            fcmResults.push({ ok: false, token_preview: tokenRecord.token.slice(0, 35) + '...', errCode, http: fcmRes.status, error: fcmJson?.error?.message });
            if (['UNREGISTERED', 'INVALID_ARGUMENT'].includes(errCode)) {
              await base44.asServiceRole.entities.FcmToken.update(tokenRecord.id, { is_active: false }).catch(() => {});
              log(`[fcmLiveTest] token désactivé (FATAL_ERROR=${errCode})`);
            }
          }
        } catch (e) {
          failed++;
          err(`[fcmLiveTest] ❌ EXCEPTION | ${e.message}`);
          fcmResults.push({ ok: false, error: e.message });
        }
      }

      log(`[fcmLiveTest] DONE | fcm_sent=${sent} | fcm_failed=${failed} | elapsed=${Date.now() - t0}ms`);

      return Response.json({
        action,
        fcm_sent: sent,
        fcm_failed: failed,
        target_email: targetEmail,
        tokens_used: targets.length,
        used_fallback: validActive.length === 0,
        fcm_results: fcmResults,
        logs,
        elapsed_ms: Date.now() - t0,
      }, { headers: corsHeaders });
    }

    return Response.json({ error: `action inconnue: ${action}. Valeurs: check | register | send | full` }, { status: 400, headers: corsHeaders });

  } catch (e) {
    err(`[fcmLiveTest] EXCEPTION GLOBALE: ${e.message}`);
    return Response.json({ error: e.message, logs, elapsed_ms: Date.now() - t0 }, { status: 500, headers: corsHeaders });
  }
});