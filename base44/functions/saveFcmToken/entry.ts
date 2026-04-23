import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * saveFcmToken — Enregistrer/mettre à jour le token FCM en BDD
 *
 * Auth robuste APK Android :
 * - Lit le body EN PREMIER (avant createClientFromRequest qui consomme le stream)
 * - auth_token peut venir du header Authorization OU du champ body.auth_token
 * - Utilise asServiceRole pour les opérations BDD (pas de 403 sur entités)
 */
Deno.serve(async (req) => {
  try {
    // ── ÉTAPE 1 : Lire le body AVANT tout ──────────────────────────────────
    let body = {};
    let rawBody = '';
    try {
      rawBody = await req.text();
      if (rawBody) body = JSON.parse(rawBody);
    } catch (_) {}

    const { token, deviceType, auth_token: bodyAuthToken } = body;

    // ── ÉTAPE 2 : Construire la requête avec le bon header Authorization ───
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    console.log('[saveFcmToken] auth header:', !!authHeader, '| body auth_token:', !!bodyAuthToken, '| deviceType:', deviceType);

    let effectiveReq = req;
    if (!authHeader && bodyAuthToken) {
      const newHeaders = new Headers(req.headers);
      newHeaders.set('Authorization', `Bearer ${bodyAuthToken}`);
      // body déjà consommé — on reconstruit sans body (auth_token déjà extrait)
      effectiveReq = new Request(req.url, {
        method: req.method,
        headers: newHeaders,
      });
      console.log('[saveFcmToken] Token auth injecté depuis le body');
    }

    // ── ÉTAPE 3 : Authentifier l'utilisateur ──────────────────────────────
    const base44 = createClientFromRequest(effectiveReq);
    let user;
    try {
      user = await base44.auth.me();
    } catch (authErr) {
      console.error('[saveFcmToken] auth.me() failed:', authErr.message);
      return Response.json({ error: 'Unauthorized', details: authErr.message }, { status: 401 });
    }

    if (!user?.email) {
      return Response.json({ error: 'User email required' }, { status: 401 });
    }

    if (!token || String(token).trim().length === 0) {
      return Response.json({ error: 'Token FCM is required' }, { status: 400 });
    }

    const cleanToken = String(token).trim();
    const resolvedDeviceType = deviceType || 'android_native';
    console.log('[saveFcmToken] user:', user.email, '| deviceType:', resolvedDeviceType, '| token:', cleanToken.substring(0, 25) + '...');

    // ── ÉTAPE 4 : Vérifier si ce token existe déjà ────────────────────────
    const existing = await base44.asServiceRole.entities.FcmToken.filter({ token: cleanToken });

    if (existing.length > 0) {
      const record = existing[0];
      if (record.user_email === user.email) {
        // Même user — juste mettre à jour last_used + is_active
        await base44.asServiceRole.entities.FcmToken.update(record.id, {
          is_active: true,
          last_used: new Date().toISOString(),
          device_type: resolvedDeviceType,
        });
        console.log('[saveFcmToken] ✅ Token existant mis à jour pour', user.email);
        return Response.json({ success: true, token_id: record.id, action: 'updated', user_email: user.email });
      } else {
        // Appareil réassigné — désactiver l'ancien enregistrement
        await base44.asServiceRole.entities.FcmToken.update(record.id, { is_active: false });
        console.log('[saveFcmToken] ⚠️ Token réassigné de', record.user_email, '→', user.email);
      }
    }

    // ── ÉTAPE 5 : Désactiver les anciens tokens du même user/device ────────
    // Pour éviter l'accumulation de tokens obsolètes
    try {
      const userTokens = await base44.asServiceRole.entities.FcmToken.filter({
        user_email: user.email,
        device_type: resolvedDeviceType,
        is_active: true,
      });
      for (const old of userTokens) {
        if (old.token !== cleanToken) {
          await base44.asServiceRole.entities.FcmToken.update(old.id, { is_active: false });
          console.log('[saveFcmToken] Ancien token désactivé:', old.token.substring(0, 20) + '...');
        }
      }
    } catch (_) {}

    // ── ÉTAPE 6 : Créer le nouveau record ─────────────────────────────────
    const result = await base44.asServiceRole.entities.FcmToken.create({
      user_email: user.email,
      token: cleanToken,
      device_type: resolvedDeviceType,
      registered_at: new Date().toISOString(),
      last_used: new Date().toISOString(),
      is_active: true,
    });

    console.log('[saveFcmToken] ✅ Nouveau token créé — id:', result.id, '| user:', user.email);
    return Response.json({ success: true, token_id: result.id, user_email: user.email, action: 'created' });

  } catch (error) {
    console.error('[saveFcmToken] ❌ ERROR:', error?.message);
    return Response.json({ success: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
});