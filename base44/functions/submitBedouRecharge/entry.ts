/**
 * submitBedouRecharge — VERSION PROPRE
 * Auth via header Authorization uniquement. Pas de fallback body token.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const L = (msg) => console.log(`[RECHARGE] ${new Date().toISOString()} | ${msg}`);

Deno.serve(async (req) => {
  L('=== START ===');
  L(`method: ${req.method}`);

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

  // Log Authorization header reçu
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  L(`Authorization header reçu: ${authHeader ? 'OUI (len=' + authHeader.length + ')' : 'NON — sera 401'}`);

  // Lire le body
  let body = {};
  try {
    const raw = await req.text();
    L(`body length: ${raw.length}`);
    if (raw.length > 0) body = JSON.parse(raw);
  } catch (e) {
    return Response.json({ success: false, error: 'Corps invalide', step: 'parse' }, { status: 400 });
  }

  const { montant, methode_paiement, preuve_paiement_url, bonus } = body;
  L(`montant=${montant} methode=${methode_paiement} bonus=${bonus} preuve=${!!preuve_paiement_url}`);

  // Auth via SDK standard — header Authorization uniquement
  const base44 = createClientFromRequest(req);
  let user = null;
  try {
    user = await base44.auth.me();
    L(`auth OK: user=${user?.email} id=${user?.id}`);
  } catch (e) {
    L(`auth ERROR: ${e.message}`);
    return Response.json({ success: false, error: 'Session expirée — reconnectez-vous', step: 'auth', detail: e.message }, { status: 401 });
  }

  if (!user?.id) {
    L('auth FAILED: user null');
    return Response.json({ success: false, error: 'Non authentifié', step: 'auth' }, { status: 401 });
  }

  // Validation
  const montantInt = parseInt(montant) || 0;
  const bonusInt   = parseInt(bonus)   || 0;

  if (montantInt < 100)     return Response.json({ success: false, error: 'Montant minimum 100 F CFA', step: 'validation' }, { status: 400 });
  if (!methode_paiement)    return Response.json({ success: false, error: 'Méthode requise', step: 'validation' }, { status: 400 });
  if (!preuve_paiement_url) return Response.json({ success: false, error: 'Preuve requise', step: 'validation' }, { status: 400 });

  L(`validation OK: montant=${montantInt} bonus=${bonusInt}`);

  // Créer la demande
  let demande = null;
  try {
    demande = await base44.asServiceRole.entities.DemandeRecharge.create({
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

  // Notifications admin (tâche de fond)
  (async () => {
    try {
      const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' }, null, 50);
      for (const admin of admins) {
        try {
          await base44.asServiceRole.entities.Notification.create({
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