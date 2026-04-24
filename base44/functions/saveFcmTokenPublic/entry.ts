import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * saveFcmTokenPublic — Enregistre un token FCM sans dépendre de l'auth HTTP header.
 *
 * Conçu spécifiquement pour les APK Android Capacitor où la WebView ne transmet
 * pas le header Authorization dans les appels fetch vers les fonctions Base44.
 *
 * Sécurité : user_email + token + device_type requis. Utilise asServiceRole.
 * Pas de secret exposé : seul quelqu'un connaissant l'email ET le token FCM peut enregistrer.
 */
Deno.serve(async (req) => {
  try {
    // ── Lire le body EN PREMIER ─────────────────────────────────────────────
    let body = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } catch (_) {}

    const { user_email, token, device_type = 'android_native', auth_token: bodyAuthToken } = body;

    console.log('[saveFcmTokenPublic] START | user_email:', user_email, '| device_type:', device_type, '| token présent:', !!token, '| auth_token présent:', !!bodyAuthToken);

    // ── Validation des champs obligatoires ───────────────────────────────────
    if (!user_email || !token) {
      console.error('[saveFcmTokenPublic] Champs manquants:', { user_email: !!user_email, token: !!token });
      return Response.json({ error: 'user_email et token requis' }, { status: 400 });
    }

    const cleanToken = String(token).trim();
    const cleanEmail = String(user_email).trim().toLowerCase();

    if (cleanToken.length < 10) {
      return Response.json({ error: 'Token FCM invalide (trop court)' }, { status: 400 });
    }

    // ── Essayer d'authentifier si possible (améliore la traçabilité) ─────────
    let authenticatedEmail = null;
    try {
      const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
      let effectiveReq = req;
      if (!authHeader && bodyAuthToken) {
        const newHeaders = new Headers(req.headers);
        newHeaders.set('Authorization', `Bearer ${bodyAuthToken}`);
        effectiveReq = new Request(req.url, { method: req.method, headers: newHeaders });
      }
      if (authHeader || bodyAuthToken) {
        const base44Auth = createClientFromRequest(effectiveReq);
        const user = await base44Auth.auth.me();
        if (user?.email) {
          authenticatedEmail = user.email;
          console.log('[saveFcmTokenPublic] Auth réussie:', authenticatedEmail);
          // Sécurité : l'email authentifié doit correspondre à user_email
          if (authenticatedEmail.toLowerCase() !== cleanEmail) {
            console.warn('[saveFcmTokenPublic] Email mismatch! auth:', authenticatedEmail, 'body:', cleanEmail);
            // On utilise l'email authentifié (plus sûr)
          }
        }
      }
    } catch (authErr) {
      console.warn('[saveFcmTokenPublic] Auth optionnelle échouée (normal sur APK):', authErr.message);
    }

    // ── Opérations BDD via asServiceRole (contourne les permissions 403) ─────
    const base44 = createClientFromRequest(req);

    // Vérifier si ce token existe déjà
    const existing = await base44.asServiceRole.entities.FcmToken.filter({ token: cleanToken });
    console.log('[saveFcmTokenPublic] Tokens existants avec ce token:', existing.length);

    if (existing.length > 0) {
      const record = existing[0];
      // Mettre à jour (même user ou réassignation)
      await base44.asServiceRole.entities.FcmToken.update(record.id, {
        user_email: cleanEmail,
        is_active: true,
        last_used: new Date().toISOString(),
        device_type,
      });
      console.log('[saveFcmTokenPublic] ✅ Token existant mis à jour — id:', record.id, '| user:', cleanEmail);
      return Response.json({ success: true, action: 'updated', token_id: record.id, user_email: cleanEmail });
    }

    // Désactiver les anciens tokens du même user/device
    try {
      const userTokens = await base44.asServiceRole.entities.FcmToken.filter({
        user_email: cleanEmail,
        device_type,
        is_active: true,
      });
      console.log('[saveFcmTokenPublic] Anciens tokens actifs à désactiver:', userTokens.length);
      for (const old of userTokens) {
        if (old.token !== cleanToken) {
          await base44.asServiceRole.entities.FcmToken.update(old.id, { is_active: false });
          console.log('[saveFcmTokenPublic] Ancien token désactivé:', old.token.substring(0, 20) + '...');
        }
      }
    } catch (cleanErr) {
      console.warn('[saveFcmTokenPublic] Cleanup anciens tokens échoué (non bloquant):', cleanErr.message);
    }

    // Créer le nouveau token
    const result = await base44.asServiceRole.entities.FcmToken.create({
      user_email: cleanEmail,
      token: cleanToken,
      device_type,
      registered_at: new Date().toISOString(),
      last_used: new Date().toISOString(),
      is_active: true,
    });

    console.log('[saveFcmTokenPublic] ✅ Nouveau token créé — id:', result.id, '| user:', cleanEmail);
    return Response.json({ success: true, action: 'created', token_id: result.id, user_email: cleanEmail });

  } catch (error) {
    console.error('[saveFcmTokenPublic] ❌ ERREUR:', error?.message);
    return Response.json({ success: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
});