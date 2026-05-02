/**
 * submitBedouRecharge — Enregistrer une demande de recharge Bedou
 *
 * FIX CRITIQUE : le body HTTP ne peut être lu qu'une seule fois.
 * Solution : lire le body en premier, extraire auth_token du payload,
 * puis reconstruire une requête avec le header Authorization pour le SDK.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function log(msg) {
  console.log(`[BEDOU_RECHARGE] ${msg}`);
}

Deno.serve(async (req) => {
  const startTime = Date.now();

  try {
    log('submit start');

    // ── 1. Lire le body EN PREMIER (stream HTTP = lecture unique) ─────────────
    let bodyText = '';
    try {
      bodyText = await req.text();
    } catch (e) {
      log('body read error: ' + e.message);
      return Response.json({ error: 'Impossible de lire la requête' }, { status: 400 });
    }

    let payload = {};
    try {
      payload = JSON.parse(bodyText);
    } catch (_) {
      log('invalid json');
      return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { montant, methode_paiement, preuve_paiement_url, bonus, auth_token } = payload;

    // ── 2. Auth — reconstruire la requête avec le token pour le SDK ───────────
    // Le SDK Base44 lit le header Authorization pour authentifier.
    // Comme on a déjà lu le body, on forge une nouvelle requête avec les bons headers.
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const tokenToUse = authHeader.replace('Bearer ', '').trim() || auth_token || '';

    const fakeReq = new Request(req.url, {
      method: req.method,
      headers: (() => {
        const h = new Headers(req.headers);
        if (tokenToUse) h.set('Authorization', `Bearer ${tokenToUse}`);
        return h;
      })(),
      // body vide — déjà lu, pas besoin de le repasser
    });

    const base44 = createClientFromRequest(fakeReq);
    const user = await base44.auth.me();

    if (!user) {
      log('unauthorized');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    log(`user authenticated: ${user.email}`);

    // ── 3. Validation des paramètres ─────────────────────────────────────────
    log(`montant: ${montant}, methode: ${methode_paiement}, bonus: ${bonus}`);

    if (!montant || Number(montant) < 100) {
      return Response.json({ error: 'Montant minimum 100 F CFA' }, { status: 400 });
    }
    if (!methode_paiement) {
      return Response.json({ error: 'Méthode requise' }, { status: 400 });
    }
    if (!preuve_paiement_url) {
      return Response.json({ error: 'Preuve paiement requise' }, { status: 400 });
    }

    // ── 4. Créer la demande en BDD ────────────────────────────────────────────
    log('db create start');

    const bonusInt = parseInt(bonus || 0);
    const montantInt = parseInt(montant);

    let demande;
    try {
      demande = await base44.asServiceRole.entities.DemandeRecharge.create({
        user_id: user.id,
        user_email: user.email,
        user_name: user.full_name || 'N/A',
        montant: montantInt,
        bonus: bonusInt,
        montant_total: montantInt + bonusInt,
        methode_paiement,
        preuve_paiement_url,
        statut: 'en_attente',
        type: 'recharge_bedou',
      });
      log(`db create success: ${demande.id}`);
    } catch (dbErr) {
      log(`db create error: ${dbErr.message}`);
      return Response.json({ error: 'Erreur création demande en base' }, { status: 500 });
    }

    // ── 5. Notifications admin (NON-BLOCKING) ─────────────────────────────────
    Promise.resolve().then(async () => {
      try {
        const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' }, null, 100);
        log(`admins found: ${admins.length}`);
        for (const admin of admins) {
          try {
            await base44.asServiceRole.entities.Notification.create({
              destinataire_email: admin.email,
              destinataire_role: 'admin',
              titre: 'Nouvelle demande de recharge Bedou',
              message: `${user.full_name || user.email} demande ${montantInt.toLocaleString()} F CFA${bonusInt > 0 ? ` + ${bonusInt} bonus` : ''}. Validation requise.`,
              type: 'warning',
              lue: false,
              target_screen: '/gestion-bedou',
              target_entity_type: 'DemandeRecharge',
              target_entity_id: demande.id,
              notification_key: `bedou_recharge_${user.email}_${Date.now()}`,
            });
          } catch (e) {
            log(`notif error for ${admin.email}: ${e.message}`);
          }
        }
      } catch (e) {
        log(`admin notif global error: ${e.message}`);
      }
    }).catch(e => log(`admin notif promise error: ${e.message}`));

    // ── 6. Réponse succès immédiate ───────────────────────────────────────────
    log(`submit end (${Date.now() - startTime}ms)`);

    return Response.json({
      success: true,
      demande_id: demande.id,
      montant: montantInt,
      bonus: bonusInt,
      montant_total: montantInt + bonusInt,
      message: 'Demande de recharge envoyée avec succès',
    });

  } catch (err) {
    log(`FATAL: ${err.message}`);
    return Response.json({ error: 'Erreur serveur: ' + err.message }, { status: 500 });
  }
});