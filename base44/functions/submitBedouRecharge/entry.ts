/**
 * submitBedouRecharge — VERSION ANTI-403 FINALE
 *
 * CAUSE DU 403 RÉELLE : Sur APK Capacitor, base44.functions.invoke() envoie
 * le token dans le body JSON (pas dans le header Authorization).
 * createClientFromRequest() ne voit pas le header → 403.
 *
 * FIX : On reconstruit manuellement la Request avec le token dans le header,
 * extrait soit du header existant, soit du champ auth_token du body.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const L = (msg) => console.log(`[RECHARGE] ${new Date().toISOString()} | ${msg}`);

Deno.serve(async (req) => {
  L('=== START ===');

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

  // ── ÉTAPE 1 : Lire le body EN PREMIER ──────────────────────────────────────
  let body = {};
  try {
    const raw = await req.text();
    L(`body length: ${raw.length}`);
    if (raw.length > 0) body = JSON.parse(raw);
  } catch (e) {
    L(`body parse error: ${e.message}`);
    return Response.json({ success: false, error: 'Corps invalide', step: 'parse' }, { status: 400 });
  }

  const { montant, methode_paiement, preuve_paiement_url, bonus, auth_token } = body;
  L(`montant=${montant} methode=${methode_paiement} bonus=${bonus}`);
  L(`preuve_present=${!!preuve_paiement_url} body_token_present=${!!auth_token} body_token_len=${auth_token?.length || 0}`);

  // ── ÉTAPE 2 : Reconstruire la Request avec le bon token dans le header ──────
  const existingHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  L(`existing_auth_header: "${existingHeader.slice(0, 30)}..."`);

  // Si pas de header mais token dans body → injecter dans les headers
  const newHeaders = new Headers(req.headers);
  if (!existingHeader && auth_token) {
    newHeaders.set('Authorization', `Bearer ${auth_token}`);
    L('injected body token into Authorization header');
  }

  const reqWithToken = new Request(req.url, {
    method: 'GET', // body déjà lu, pas besoin
    headers: newHeaders,
  });

  // ── ÉTAPE 3 : Auth via SDK ──────────────────────────────────────────────────
  let user = null;
  try {
    const base44 = createClientFromRequest(reqWithToken);
    user = await base44.auth.me();
    L(`auth OK: user=${user?.email} id=${user?.id} role=${user?.role}`);
  } catch (e) {
    L(`auth ERROR: ${e.message}`);
    // Log le header utilisé pour diagnostiquer
    const finalHeader = newHeaders.get('Authorization') || '';
    L(`auth header used: "${finalHeader.slice(0, 50)}..."`);
    return Response.json({
      success: false,
      error: 'Session expirée — reconnectez-vous',
      step: 'auth',
      detail: e.message,
    }, { status: 401 });
  }

  if (!user) {
    L('auth FAILED: user null');
    return Response.json({ success: false, error: 'Non authentifié', step: 'auth' }, { status: 401 });
  }

  // ── ÉTAPE 4 : Validation paramètres ────────────────────────────────────────
  const montantInt = parseInt(montant) || 0;
  const bonusInt   = parseInt(bonus)   || 0;

  if (montantInt < 100) {
    return Response.json({ success: false, error: 'Montant minimum 100 F CFA', step: 'validation' }, { status: 400 });
  }
  if (!methode_paiement) {
    return Response.json({ success: false, error: 'Méthode de paiement requise', step: 'validation' }, { status: 400 });
  }
  if (!preuve_paiement_url) {
    return Response.json({ success: false, error: 'Preuve de paiement requise', step: 'validation' }, { status: 400 });
  }
  L(`validation OK: montant=${montantInt} bonus=${bonusInt}`);

  // ── ÉTAPE 5 : Créer la demande en BDD ──────────────────────────────────────
  const base44db = createClientFromRequest(reqWithToken);
  let demande = null;
  try {
    demande = await base44db.asServiceRole.entities.DemandeRecharge.create({
      user_id:            user.id,
      user_email:         user.email,
      user_name:          user.full_name || user.email,
      montant:            montantInt,
      bonus:              bonusInt,
      montant_total:      montantInt + bonusInt,
      methode_paiement,
      preuve_paiement_url,
      statut:             'en_attente',
      type:               'recharge_bedou',
    });
    L(`BDD OK: demande.id=${demande.id}`);
  } catch (e) {
    L(`BDD ERROR: ${e.message}`);
    return Response.json({ success: false, error: `Erreur création BDD: ${e.message}`, step: 'db' }, { status: 500 });
  }

  // ── ÉTAPE 6 : Notifications admin en tâche de fond ─────────────────────────
  (async () => {
    try {
      const b44 = createClientFromRequest(reqWithToken);
      const admins = await b44.asServiceRole.entities.User.filter({ role: 'admin' }, null, 50);
      L(`notif: ${admins.length} admins`);
      for (const admin of admins) {
        try {
          await b44.asServiceRole.entities.Notification.create({
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
    } catch (e) {
      L(`notif error (non-bloquant): ${e.message}`);
    }
  })();

  // ── ÉTAPE 7 : Réponse succès ────────────────────────────────────────────────
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