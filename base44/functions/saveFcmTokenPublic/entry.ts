import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * saveFcmTokenPublic — UPSERT robuste des tokens FCM
 *
 * Stratégie anti-doublon :
 * 1. Chercher si ce token exact existe → update last_used
 * 2. Si nouveau token : désactiver les anciens du même user+device
 * 3. Si doublons détectés (race condition) → garder 1, supprimer le reste
 * 4. Créer le nouveau token si vraiment nouveau
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    let body = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } catch (_) {}

    const { user_email, token, device_type = 'android_native' } = body;

    console.log('[saveFcmTokenPublic] START | user_email:', user_email, '| device_type:', device_type, '| token length:', token?.length);

    if (!user_email || !token) {
      return Response.json({ error: 'user_email et token requis' }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const cleanToken = String(token).trim();
    const cleanEmail = String(user_email).trim().toLowerCase();

    if (cleanToken.length < 20) {
      return Response.json({ error: 'Token FCM invalide (trop court)' }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const base44 = createClientFromRequest(req);
    const now = new Date().toISOString();

    // ── ÉTAPE 1 : Chercher tous les enregistrements avec ce token exact ──────
    const byToken = await base44.asServiceRole.entities.FcmToken.filter({ token: cleanToken });
    console.log('[saveFcmTokenPublic] Enregistrements avec ce token exact:', byToken.length);

    if (byToken.length === 1) {
      // Token connu, pas de doublon → simple mise à jour
      await base44.asServiceRole.entities.FcmToken.update(byToken[0].id, {
        user_email: cleanEmail,
        is_active: true,
        last_used: now,
        device_type,
      });
      console.log('[saveFcmTokenPublic] ✅ UPDATED (1 existant) id:', byToken[0].id);
      return Response.json({ success: true, action: 'updated', token_id: byToken[0].id, user_email: cleanEmail }, {
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    if (byToken.length > 1) {
      // DOUBLON DÉTECTÉ — garder le plus ancien, supprimer les autres
      console.warn('[saveFcmTokenPublic] ⚠️ DOUBLONS DÉTECTÉS:', byToken.length, '— nettoyage en cours');
      const sorted = byToken.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
      const keeper = sorted[0];
      // Supprimer les doublons (garder le premier)
      for (let i = 1; i < sorted.length; i++) {
        try {
          await base44.asServiceRole.entities.FcmToken.delete(sorted[i].id);
          console.log('[saveFcmTokenPublic] 🗑️ Doublon supprimé id:', sorted[i].id);
        } catch (_) {}
      }
      // Mettre à jour le keeper
      await base44.asServiceRole.entities.FcmToken.update(keeper.id, {
        user_email: cleanEmail,
        is_active: true,
        last_used: now,
        device_type,
      });
      console.log('[saveFcmTokenPublic] ✅ UPDATED (après nettoyage doublons) id:', keeper.id);
      return Response.json({ success: true, action: 'deduplicated', token_id: keeper.id, user_email: cleanEmail, duplicates_removed: sorted.length - 1 }, {
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    // ── ÉTAPE 2 : Token inconnu → désactiver les anciens du même user+device ─
    try {
      const oldTokens = await base44.asServiceRole.entities.FcmToken.filter({
        user_email: cleanEmail,
        device_type,
        is_active: true,
      });
      console.log('[saveFcmTokenPublic] Anciens tokens actifs à désactiver:', oldTokens.length);
      for (const old of oldTokens) {
        await base44.asServiceRole.entities.FcmToken.update(old.id, { is_active: false });
        console.log('[saveFcmTokenPublic] 🔕 Désactivé ancien token id:', old.id);
      }
    } catch (e) {
      console.warn('[saveFcmTokenPublic] Cleanup non bloquant:', e.message);
    }

    // ── ÉTAPE 3 : Créer le nouveau token ─────────────────────────────────────
    const created = await base44.asServiceRole.entities.FcmToken.create({
      user_email: cleanEmail,
      token: cleanToken,
      device_type,
      registered_at: now,
      last_used: now,
      is_active: true,
    });

    console.log('[saveFcmTokenPublic] ✅ CREATED nouveau token id:', created.id, '| user:', cleanEmail);
    return Response.json({ success: true, action: 'created', token_id: created.id, user_email: cleanEmail }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });

  } catch (error) {
    console.error('[saveFcmTokenPublic] ❌ ERREUR:', error?.message);
    return Response.json({ success: false, error: error?.message || 'Unknown error' }, {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }
});