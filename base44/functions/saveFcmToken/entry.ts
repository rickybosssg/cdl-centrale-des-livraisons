import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * saveFcmToken — Enregistrer/mettre à jour le token FCM natif en BDD (APK Android)
 * Déduplication : si le token existe déjà pour cet utilisateur, on met à jour last_used.
 * Si un autre utilisateur avait ce token, on le désactive (changement d'appareil).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let user;
    try {
      user = await base44.auth.me();
    } catch (authErr) {
      return Response.json({ error: 'Unauthorized', details: authErr.message }, { status: 401 });
    }

    if (!user?.email) {
      return Response.json({ error: 'User email required' }, { status: 401 });
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { token, deviceType } = body;

    if (!token || token.trim().length === 0) {
      return Response.json({ error: 'Token is required' }, { status: 400 });
    }

    const cleanToken = token.trim();
    const resolvedDeviceType = deviceType || 'web';
    console.log('[saveFcmToken] user:', user.email, '| deviceType:', resolvedDeviceType, '| token start:', cleanToken.substring(0, 25));

    // ── 1. Ce token existe déjà en BDD ? ──────────────────────────────────
    const existing = await base44.asServiceRole.entities.FcmToken.filter({ token: cleanToken });

    if (existing.length > 0) {
      const record = existing[0];

      if (record.user_email === user.email) {
        // Même utilisateur — juste mettre à jour last_used + s'assurer is_active=true
        await base44.asServiceRole.entities.FcmToken.update(record.id, {
          is_active: true,
          last_used: new Date().toISOString(),
          device_type: resolvedDeviceType,
        });
        console.log('[saveFcmToken] ✅ Token existant mis à jour pour', user.email);
        return Response.json({ success: true, token_id: record.id, action: 'updated' });
      } else {
        // Appareil réassigné à un autre utilisateur — désactiver l'ancien
        await base44.asServiceRole.entities.FcmToken.update(record.id, { is_active: false });
        console.log('[saveFcmToken] ⚠️ Token réassigné de', record.user_email, '→', user.email);
      }
    }

    // ── 2. Désactiver les anciens tokens de cet utilisateur (optionnel — garder 1 actif max) ──
    // On garde tous les tokens actifs pour multi-device, donc pas de désactivation globale.

    // ── 3. Créer un nouveau record ─────────────────────────────────────────
    const result = await base44.asServiceRole.entities.FcmToken.create({
      user_email: user.email,
      token: cleanToken,
      device_type: resolvedDeviceType,
      registered_at: new Date().toISOString(),
      last_used: new Date().toISOString(),
      is_active: true,
    });

    console.log('[saveFcmToken] ✅ Nouveau token créé — id:', result.id, 'user:', user.email);

    return Response.json({
      success: true,
      token_id: result.id,
      user_email: user.email,
      action: 'created',
    });

  } catch (error) {
    console.error('[saveFcmToken] ❌ ERROR:', error?.message);
    return Response.json({
      success: false,
      error: error?.message || 'Unknown error',
    }, { status: 500 });
  }
});