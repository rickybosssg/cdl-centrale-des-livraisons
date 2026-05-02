/**
 * submitBedouRecharge — VERSION FETCH-DIRECT APK
 *
 * Appelé via fetch() natif depuis MonBedou avec header Authorization.
 * Le token est dans Authorization: Bearer <token> ET dans body.auth_token.
 *
 * Stratégie auth :
 * 1. Header Authorization (fetch direct avec token explicite)
 * 2. body.auth_token injecté dans le header en fallback
 * 3. createClientFromRequest → base44.auth.me()
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const L = (msg) => console.log(`[RECHARGE] ${new Date().toISOString()} | ${msg}`);

Deno.serve(async (req) => {
  L('=== START ===');
  L(`method: ${req.method} | url: ${req.url}`);

  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // ── ÉTAPE 1 : Lire le body ──────────────────────────────────────────────────
  let body = {};
  try {
    const raw = await req.text();
    L(`body length: ${raw.length}`);
    if (raw.length > 0) body = JSON.parse(raw);
  } catch (e) {
    return Response.json({ success: false, error: 'Corps invalide', step: 'parse' }, { status: 400 });
  }

  const { montant, methode_paiement, preuve_paiement_url, bonus, auth_token: bodyToken } = body;
  L(`montant=${montant} methode=${methode_paiement} bonus=${bonus}`);

  // ── ÉTAPE 2 : Construire la Request avec le token dans le header ────────────
  const headerToken = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const effectiveToken = headerToken.replace(/^Bearer\s+/i, '') || bodyToken || '';

  L(`header_token len=${headerToken.length} | body_token len=${bodyToken?.length || 0} | effective len=${effectiveToken.length}`);

  if (!effectiveToken) {
    L('REJECT: no token found in header or body');
    return Response.json({ success: false, error: 'Token manquant — reconnectez-vous', step: 'auth' }, { status: 401 });
  }

  // Reconstruire la Request avec le token dans Authorization header
  const authHeaders = new Headers(req.headers);
  authHeaders.set('Authorization', `Bearer ${effectiveToken}`);
  const reqWithAuth = new Request(req.url, { method: 'GET', headers: authHeaders });

  // ── ÉTAPE 3 : Auth via SDK ──────────────────────────────────────────────────
  let user = null;
  try {
    const base44 = createClientFromRequest(reqWithAuth);
    user = await base44.auth.me();
    L(`auth OK: user=${user?.email} role=${user?.role}`);
  } catch (e) {
    L(`auth ERROR: ${e.message} | token_prefix=${effectiveToken.slice(0, 20)}...`);
    return Response.json({
      success: false,
      error: 'Session expirée — reconnectez-vous',
      step: 'auth',
      detail: e.message,
    }, { status: 401 });
  }

  if (!user?.id) {
    L('auth FAILED: user null or no id');
    return Response.json({ success: false, error: 'Non authentifié', step: 'auth' }, { status: 401 });
  }

  // ── ÉTAPE 4 : Validation ────────────────────────────────────────────────────
  const montantInt = parseInt(montant) || 0;
  const bonusInt   = parseInt(bonus)   || 0;

  if (montantInt < 100)       return Response.json({ success: false, error: 'Montant minimum 100 F CFA', step: 'validation' }, { status: 400 });
  if (!methode_paiement)      return Response.json({ success: false, error: 'Méthode requise', step: 'validation' }, { status: 400 });
  if (!preuve_paiement_url)   return Response.json({ success: false, error: 'Preuve requise', step: 'validation' }, { status: 400 });

  L(`validation OK: montant=${montantInt} bonus=${bonusInt}`);

  // ── ÉTAPE 5 : Créer la demande (service role — pas besoin d'auth user) ──────
  const base44sr = createClientFromRequest(reqWithAuth);
  let demande = null;
  try {
    demande = await base44sr.asServiceRole.entities.DemandeRecharge.create({
      user_id:             user.id,
      user_email:          user.email,
      user_name:           user.full_name || user.email,
      montant:             montantInt,
      bonus:               bonusInt,
      montant_total:       montantInt + bonusInt,
      methode_paiement,
      preuve_paiement_url,
      statut:              'en_attente',
      type:                'recharge_bedou',
    });
    L(`BDD OK: demande.id=${demande.id}`);
  } catch (e) {
    L(`BDD ERROR: ${e.message}`);
    return Response.json({ success: false, error: `Erreur création BDD: ${e.message}`, step: 'db' }, { status: 500 });
  }

  // ── ÉTAPE 6 : Notifications admin (tâche de fond, non-bloquante) ────────────
  (async () => {
    try {
      const admins = await base44sr.asServiceRole.entities.User.filter({ role: 'admin' }, null, 50);
      for (const admin of admins) {
        try {
          await base44sr.asServiceRole.entities.Notification.create({
            destinataire_email:  admin.email,
            destinataire_role:   'admin',
            titre:               '💰 Nouvelle demande de recharge Bedou',
            message:             `${user.full_name || user.email} demande ${montantInt.toLocaleString()} F CFA${bonusInt > 0 ? ` + ${bonusInt} F bonus` : ''}. Validation requise.`,
            type:                'warning',
            lue:                 false,
            target_screen:       '/gestion-bedou',
            target_entity_type:  'DemandeRecharge',
            target_entity_id:    demande.id,
          });
        } catch (_) {}
      }
      L(`notifs envoyées: ${admins.length} admin(s)`);
    } catch (e) {
      L(`notif error (non-bloquant): ${e.message}`);
    }
  })();

  // ── ÉTAPE 7 : Succès ────────────────────────────────────────────────────────
  L(`SUCCESS → recharge_id=${demande.id}`);
  return Response.json({
    success:       true,
    message:       'Demande de recharge envoyée avec succès',
    recharge_id:   demande.id,
    montant:       montantInt,
    bonus:         bonusInt,
    montant_total: montantInt + bonusInt,
  });
});