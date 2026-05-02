/**
 * submitBedouRecharge — Flux recharge Bedou fiable et atomique
 *
 * ARCHITECTURE :
 * - Le body est lu UNE SEULE FOIS en premier (contrainte HTTP stream)
 * - L'auth token est extrait du header (déjà présent via SDK base44)
 * - La demande est créée en BDD AVANT toute notification
 * - La réponse succès est envoyée IMMÉDIATEMENT après création BDD
 * - Les notifications admin sont envoyées en tâche de fond (non-bloquant)
 *
 * RÉPONSE SUCCÈS :
 * { success: true, recharge_id, montant, bonus, montant_total, message, admin_notification_sent }
 *
 * RÉPONSE ERREUR :
 * { success: false, message: "raison exacte" }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const L = (msg) => console.log(`[RECHARGE] ${new Date().toISOString()} — ${msg}`);

Deno.serve(async (req) => {
  L('START');

  // ═══════════════════════════════════════════════════════════
  // ÉTAPE 1 : Lire le body EN PREMIER (stream = lecture unique)
  // ═══════════════════════════════════════════════════════════
  let body = {};
  try {
    const raw = await req.text();
    L(`body read OK (${raw.length} chars)`);
    body = JSON.parse(raw);
  } catch (e) {
    L(`body parse ERROR: ${e.message}`);
    return Response.json({ success: false, message: 'Corps de requête invalide' }, { status: 400 });
  }

  const { montant, methode_paiement, preuve_paiement_url, bonus } = body;

  // ═══════════════════════════════════════════════════════════
  // ÉTAPE 2 : Authentification via header (déjà dans req.headers)
  // ═══════════════════════════════════════════════════════════
  // Le SDK base44.functions.invoke() envoie toujours le token dans Authorization header.
  // On reconstruit une Request sans body (déjà consommé) mais avec les mêmes headers.
  let user = null;
  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    L(`auth header present: ${!!authHeader}`);

    const reqForAuth = new Request(req.url, {
      method: 'GET', // body non nécessaire pour auth
      headers: req.headers,
    });
    const base44 = createClientFromRequest(reqForAuth);
    user = await base44.auth.me();
  } catch (e) {
    L(`auth ERROR: ${e.message}`);
    return Response.json({ success: false, message: 'Erreur authentification' }, { status: 401 });
  }

  if (!user) {
    L('auth FAILED — no user');
    return Response.json({ success: false, message: 'Non authentifié' }, { status: 401 });
  }
  L(`auth OK — user: ${user.email}`);

  // ═══════════════════════════════════════════════════════════
  // ÉTAPE 3 : Validation des paramètres
  // ═══════════════════════════════════════════════════════════
  const montantInt = parseInt(montant) || 0;
  const bonusInt   = parseInt(bonus)   || 0;

  if (montantInt < 100) {
    L(`validation FAILED — montant: ${montantInt}`);
    return Response.json({ success: false, message: 'Montant minimum 100 F CFA' }, { status: 400 });
  }
  if (!methode_paiement) {
    L('validation FAILED — no methode');
    return Response.json({ success: false, message: 'Méthode de paiement requise' }, { status: 400 });
  }
  if (!preuve_paiement_url) {
    L('validation FAILED — no preuve_url');
    return Response.json({ success: false, message: 'Preuve de paiement requise' }, { status: 400 });
  }

  L(`params OK — montant: ${montantInt}, bonus: ${bonusInt}, methode: ${methode_paiement}`);

  // ═══════════════════════════════════════════════════════════
  // ÉTAPE 4 : Créer la demande en BDD (opération principale)
  // ═══════════════════════════════════════════════════════════
  // On utilise asServiceRole pour garantir la création même si le user a des restrictions
  let demande = null;
  try {
    // Recréer le client avec asServiceRole
    const reqForDB = new Request(req.url, { method: 'GET', headers: req.headers });
    const base44db = createClientFromRequest(reqForDB);

    demande = await base44db.asServiceRole.entities.DemandeRecharge.create({
      user_id:           user.id,
      user_email:        user.email,
      user_name:         user.full_name || user.email,
      montant:           montantInt,
      bonus:             bonusInt,
      montant_total:     montantInt + bonusInt,
      methode_paiement,
      preuve_paiement_url,
      statut:            'en_attente',
      type:              'recharge_bedou',
    });

    L(`BDD create OK — id: ${demande.id}`);
  } catch (e) {
    L(`BDD create ERROR: ${e.message}`);
    return Response.json({ success: false, message: `Erreur création demande: ${e.message}` }, { status: 500 });
  }

  // ═══════════════════════════════════════════════════════════
  // ÉTAPE 5 : Notifications admin EN TÂCHE DE FOND (non-bloquant)
  // Le client reçoit sa réponse AVANT que les notifs soient envoyées
  // ═══════════════════════════════════════════════════════════
  let adminNotifSent = false;

  // Lancer async sans await — ne bloque JAMAIS la réponse client
  (async () => {
    try {
      const reqForNotif = new Request(req.url, { method: 'GET', headers: req.headers });
      const b44 = createClientFromRequest(reqForNotif);

      // 5a. Notification BDD pour chaque admin
      const admins = await b44.asServiceRole.entities.User.filter({ role: 'admin' }, null, 50);
      L(`notif — admins found: ${admins.length}`);

      for (const admin of admins) {
        try {
          await b44.asServiceRole.entities.Notification.create({
            destinataire_email:  admin.email,
            destinataire_role:   'admin',
            titre:               '💰 Nouvelle demande de recharge Bedou',
            message:             `${user.full_name || user.email} demande ${montantInt.toLocaleString()} F CFA${bonusInt > 0 ? ` + ${bonusInt.toLocaleString()} F bonus` : ''}. Validation requise.`,
            type:                'warning',
            lue:                 false,
            target_screen:       '/gestion-bedou',
            target_entity_type:  'DemandeRecharge',
            target_entity_id:    demande.id,
            notification_key:    `bedou_${user.email}_${demande.id}`,
          });
          L(`notif BDD OK — admin: ${admin.email}`);
        } catch (e) {
          L(`notif BDD FAIL admin ${admin.email}: ${e.message}`);
        }
      }

      // 5b. Push FCM admin (best-effort)
      try {
        await b44.asServiceRole.functions.invoke('sendFcmNotification', {
          tokens: await b44.asServiceRole.entities.FcmToken
            .filter({ is_active: true }, null, 200)
            .then(tks => tks
              .filter(t => admins.some(a => a.email === t.user_email))
              .map(t => t.token)
            ),
          title: '💰 Recharge Bedou à valider',
          body:  `${user.full_name || user.email} — ${montantInt.toLocaleString()} F CFA`,
          data:  { notif_route: '/gestion-bedou' },
        });
        L('push FCM admin OK');
        adminNotifSent = true;
      } catch (e) {
        L(`push FCM admin FAIL (non-bloquant): ${e.message}`);
      }

    } catch (e) {
      L(`notif background ERROR: ${e.message}`);
    }
  })();

  // ═══════════════════════════════════════════════════════════
  // ÉTAPE 6 : Réponse succès immédiate au client
  // ═══════════════════════════════════════════════════════════
  L(`RÉPONSE SUCCÈS envoyée — recharge_id: ${demande.id}`);

  return Response.json({
    success:                  true,
    message:                  'Demande de recharge envoyée avec succès',
    recharge_id:              demande.id,
    montant:                  montantInt,
    bonus:                    bonusInt,
    montant_total:            montantInt + bonusInt,
    admin_notification_sent:  adminNotifSent,
  });
});