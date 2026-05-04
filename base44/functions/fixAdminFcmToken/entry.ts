// v2 - 2026-05-04
/**
 * fixAdminFcmToken — Diagnostic + nettoyage doublons tokens FCM admin
 *
 * Actions :
 * 1. Charger tous les tokens de l'admin
 * 2. Détecter et désactiver les doublons (même token, plusieurs records)
 * 3. Retourner le statut complet
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const t0 = Date.now();
  const base44 = createClientFromRequest(req);

  let user = null;
  try { user = await base44.auth.me(); } catch (e) {
    return Response.json({ error: 'Non authentifié' }, { status: 401 });
  }
  if (!user) return Response.json({ error: 'Non authentifié' }, { status: 401 });
  if (user.role !== 'admin') return Response.json({ error: 'Admin requis' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const targetEmail = body.target_email || user.email;

  // Charger TOUS les tokens (actifs et inactifs) pour diagnostic complet
  const allTokens = await base44.asServiceRole.entities.FcmToken.filter({ user_email: targetEmail });
  console.log(`[fixAdminFcmToken] Tous tokens pour ${targetEmail}: ${allTokens.length}`);

  // Détecter doublons : même valeur de token → garder le plus récent, désactiver les autres
  const tokenMap = new Map();
  for (const t of allTokens) {
    const key = t.token;
    if (!tokenMap.has(key)) {
      tokenMap.set(key, []);
    }
    tokenMap.get(key).push(t);
  }

  let duplicatesFixed = 0;
  for (const [tokenVal, records] of tokenMap.entries()) {
    if (records.length > 1) {
      // Trier par updated_date ou registered_at — garder le plus récent
      records.sort((a, b) => new Date(b.updated_date || b.registered_at || 0) - new Date(a.updated_date || a.registered_at || 0));
      const keep = records[0];
      console.log(`[fixAdminFcmToken] Doublon détecté: ${records.length} records pour token ${tokenVal.slice(0, 20)}... — garder id=${keep.id}`);
      for (let i = 1; i < records.length; i++) {
        await base44.asServiceRole.entities.FcmToken.update(records[i].id, { is_active: false }).catch(() => {});
        duplicatesFixed++;
        console.log(`[fixAdminFcmToken] Doublon désactivé: id=${records[i].id}`);
      }
    }
  }

  // Re-charger après nettoyage
  const tokensAfter = await base44.asServiceRole.entities.FcmToken.filter({ user_email: targetEmail });
  const activeTokens = tokensAfter.filter(t => t.is_active);
  const androidTokens = activeTokens.filter(t => t.device_type === 'android_native');
  const webTokens = activeTokens.filter(t => t.device_type === 'web');
  const latestToken = [...activeTokens].sort((a, b) =>
    new Date(b.last_used || b.registered_at || 0) - new Date(a.last_used || a.registered_at || 0)
  )[0] || null;

  let status = 'ok';
  let issue = null;
  if (tokensAfter.length === 0) {
    status = 'no_token';
    issue = 'Aucun token FCM en BDD';
  } else if (activeTokens.length === 0) {
    status = 'token_inactive';
    issue = `${tokensAfter.length} token(s) mais tous inactifs`;
  }

  console.log(`[ADMIN_FCM_STATUS] email=${targetEmail} | status=${status} | active=${activeTokens.length} | android=${androidTokens.length} | web=${webTokens.length} | duplicates_fixed=${duplicatesFixed} | latest=${latestToken?.token?.slice(0, 20) || 'NONE'}...`);

  return Response.json({
    ok: activeTokens.length > 0,
    email: targetEmail,
    status,
    issue,
    tokens_total: tokensAfter.length,
    tokens_active: activeTokens.length,
    tokens_android: androidTokens.length,
    tokens_web: webTokens.length,
    duplicates_fixed: duplicatesFixed,
    latest_token_prefix: latestToken?.token?.slice(0, 30) || null,
    latest_token_device: latestToken?.device_type || null,
    latest_token_last_used: latestToken?.last_used || null,
    latest_token_registered_at: latestToken?.registered_at || null,
    can_receive_push: activeTokens.length > 0,
    summary: activeTokens.length > 0
      ? `${activeTokens.length} token(s) actif(s) — push possible`
      : `Aucun token actif — enregistrer le token FCM`,
    delay_ms: Date.now() - t0,
  });
});