/**
 * saveFcmTokenPublic — Enregistrement FCM stable et sans doublon
 *
 * LOGIQUE :
 * 1. Si token exact déjà en BDD → réactiver + mettre à jour last_used
 * 2. Si même device_id en BDD (token différent) → mettre à jour le token existant (upsert device)
 * 3. Sinon → créer un nouveau token
 * Dans tous les cas → désactiver les autres tokens actifs du même user
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const BLACKLISTED_PREFIXES = ['test_', 'diag_', 'check_'];
function isTestToken(token) {
  if (!token || token.length < 20) return true;
  const t = String(token).toLowerCase();
  return BLACKLISTED_PREFIXES.some(p => t.startsWith(p)) || t.includes('_test_') || t.includes('test_token');
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { user_email, token, device_type = 'android_native', device_id = null, platform = 'android', active_profile_type = null } = body;

    console.log(`[FCM_SAVE] user=${user_email || 'VIDE'} | token_len=${token?.length || 0} | device_id=${device_id || 'null'} | platform=${platform} | profile=${active_profile_type || 'null'}`);
    console.log('[FCM_TOKEN_RECEIVED]', token ? `len=${token.length} preview=${token.slice(0, 30)}...` : 'MISSING');

    if (!user_email || !token) {
      return Response.json({ success: false, error: `Paramètre manquant: ${!user_email ? 'user_email' : 'token'}` }, { status: 400, headers: corsHeaders });
    }

    const cleanToken = String(token).trim();
    const cleanEmail = String(user_email).toLowerCase().trim();

    if (cleanToken.length < 20) {
      return Response.json({ success: false, error: 'Token trop court' }, { status: 400, headers: corsHeaders });
    }
    if (isTestToken(cleanToken)) {
      return Response.json({ success: true, action: 'ignored_test_token' }, { headers: corsHeaders });
    }

    const base44 = createClientFromRequest(req);
    const now = new Date().toISOString();
    const extraFields = {
      last_seen: now,
      ...(active_profile_type ? { active_profile_type } : {}),
    };

    // Charger tous les tokens existants de cet utilisateur
    const allTokens = await base44.asServiceRole.entities.FcmToken.filter({ user_email: cleanEmail }, null, 50);

    // CAS 1 : token exact déjà en BDD
    const exactMatch = allTokens.find(t => t.token === cleanToken);
    if (exactMatch) {
      await base44.asServiceRole.entities.FcmToken.update(exactMatch.id, {
        is_active: true,
        last_used: now,
        device_type,
        platform,
        ...(device_id ? { device_id } : {}),
        ...extraFields,
      });
      // Désactiver les autres tokens actifs
      for (const t of allTokens) {
        if (t.id !== exactMatch.id && t.is_active) {
          await base44.asServiceRole.entities.FcmToken.update(t.id, { is_active: false }).catch(() => {});
        }
      }
      console.log(`[FCM_SAVE] action=reactivated | id=${exactMatch.id} | delay=${Date.now() - t0}ms`);
      return Response.json({ success: true, action: 'reactivated', token_id: exactMatch.id, user_email: cleanEmail }, { headers: corsHeaders });
    }

    // CAS 2 : même device_id → upsert (mettre à jour le token de cet appareil)
    const deviceMatch = device_id ? allTokens.find(t => t.device_id === device_id) : null;
    if (deviceMatch) {
      await base44.asServiceRole.entities.FcmToken.update(deviceMatch.id, {
        token: cleanToken,
        is_active: true,
        last_used: now,
        registered_at: now,
        device_type,
        platform,
        device_id,
        ...extraFields,
      });
      // Désactiver les autres tokens actifs
      for (const t of allTokens) {
        if (t.id !== deviceMatch.id && t.is_active) {
          await base44.asServiceRole.entities.FcmToken.update(t.id, { is_active: false }).catch(() => {});
        }
      }
      console.log(`[FCM_SAVE] action=upsert_device | id=${deviceMatch.id} | delay=${Date.now() - t0}ms`);
      return Response.json({ success: true, action: 'upsert_device', token_id: deviceMatch.id, user_email: cleanEmail }, { headers: corsHeaders });
    }

    // CAS 3 : nouveau token — créer d'abord, désactiver ensuite (jamais de fenêtre sans token actif)
    const created = await base44.asServiceRole.entities.FcmToken.create({
      user_email: cleanEmail,
      token: cleanToken,
      device_type,
      platform,
      device_id: device_id || null,
      registered_at: now,
      last_used: now,
      is_active: true,
      ...extraFields,
    });

    // Désactiver les anciens tokens APRÈS création du nouveau
    for (const t of allTokens) {
      if (t.is_active) {
        await base44.asServiceRole.entities.FcmToken.update(t.id, { is_active: false }).catch(() => {});
      }
    }

    console.log(`[FCM_SAVE] action=created | id=${created.id} | delay=${Date.now() - t0}ms`);
    console.log('[FCM_TOKEN_SAVED]', `id=${created.id} | user=${cleanEmail} | token_preview=${cleanToken.slice(0, 30)}...`);
    return Response.json({ success: true, action: 'created', token_id: created.id, user_email: cleanEmail }, { headers: corsHeaders });

  } catch (err) {
    console.error(`[FCM_SAVE_ERROR] ${err.message} | delay=${Date.now() - t0}ms`);
    return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
  }
});