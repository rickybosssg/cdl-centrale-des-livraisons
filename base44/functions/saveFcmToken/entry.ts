import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * saveFcmToken — Enregistrer/mettre à jour le token FCM natif en BDD (APK Android)
 *
 * Stratégie auth robuste pour APK natif :
 * Le body est lu en premier, puis le token d'auth peut venir :
 *   1. Du header Authorization (chemin normal web/SDK)
 *   2. Du champ "auth_token" dans le body (fallback APK natif si header absent)
 */
Deno.serve(async (req) => {
  try {
    // ── Lire le body EN PREMIER (avant createClientFromRequest) ─────────────
    let body = {};
    let rawBody = '';
    try {
      rawBody = await req.text();
      if (rawBody) body = JSON.parse(rawBody);
    } catch (_) {}

    const { token, deviceType, auth_token: bodyAuthToken } = body;

    // ── Auth : header en priorité, sinon body.auth_token ────────────────────
    // Si l'APK n'envoie pas le header Authorization, on reconstruit la requête
    // avec le token du body pour que createClientFromRequest l'utilise.
    let authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    
    console.log('[saveFcmToken] auth header présent:', !!authHeader, '| body auth_token présent:', !!bodyAuthToken);

    // Recréer une requête avec le bon header si nécessaire
    let effectiveReq = req;
    if (!authHeader && bodyAuthToken) {
      const newHeaders = new Headers(req.headers);
      newHeaders.set('Authorization', `Bearer ${bodyAuthToken}`);
      effectiveReq = new Request(req.url, {
        method: req.method,
        headers: newHeaders,
        body: rawBody,
      });
      console.log('[saveFcmToken] Token auth injecté depuis le body');
    }

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

    // ── 1. Ce token existe déjà en BDD ? ────────────────────────────────────
    const existing = await base44.asServiceRole.entities.FcmToken.filter({ token: cleanToken });

    if (existing.length > 0) {
      const record = existing[0];
      if (record.user_email === user.email) {
        await base44.asServiceRole.entities.FcmToken.update(record.id, {
          is_active: true,
          last_used: new Date().toISOString(),
          device_type: resolvedDeviceType,
        });
        console.log('[saveFcmToken] ✅ Token existant mis à jour pour', user.email);
        return Response.json({ success: true, token_id: record.id, action: 'updated' });
      } else {
        // Appareil réassigné — désactiver l'ancien
        await base44.asServiceRole.entities.FcmToken.update(record.id, { is_active: false });
        console.log('[saveFcmToken] ⚠️ Token réassigné de', record.user_email, '→', user.email);
      }
    }

    // ── 2. Créer un nouveau record ───────────────────────────────────────────
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