/**
 * submitBedouRecharge — Enregistrer une demande de recharge Bedou
 * 
 * Processus atomique sécurisé :
 * 1. Vérifier l'authentification
 * 2. Créer la demande en BDD
 * 3. Envoyer notification admin (non-blocking)
 * 4. Retourner succès
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function log(msg) {
  console.log(`[BEDOU_RECHARGE] ${msg}`);
}

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    log('submit start');

    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    log(`user authenticated: ${user.email}`);

    // ── 2. Parse payload ──────────────────────────────────────────────────────
    const bodyText = await req.text();
    let payload = {};
    try {
      payload = JSON.parse(bodyText);
    } catch (_) {
      log('invalid json');
      return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { montant, methode_paiement, preuve_paiement_url, bonus } = payload;

    log(`montant: ${montant}, methode: ${methode_paiement}, bonus: ${bonus}`);

    // Validation
    if (!montant || montant < 100) {
      log('montant < 100');
      return Response.json({ error: 'Montant minimum 100 F CFA' }, { status: 400 });
    }
    if (!methode_paiement) {
      log('no methode');
      return Response.json({ error: 'Méthode requise' }, { status: 400 });
    }
    if (!preuve_paiement_url) {
      log('no preuve_paiement_url');
      return Response.json({ error: 'Preuve paiement requise' }, { status: 400 });
    }

    // ── 3. Créer la demande en BDD ────────────────────────────────────────────
    log('db create start');

    let demande;
    try {
      demande = await base44.asServiceRole.entities.DemandeRecharge.create({
        user_id: user.id,
        user_email: user.email,
        user_name: user.full_name || 'N/A',
        montant: parseInt(montant),
        bonus: parseInt(bonus || 0),
        montant_total: parseInt(montant) + parseInt(bonus || 0),
        methode_paiement,
        preuve_paiement_url,
        statut: 'en_attente',
        created_at: new Date().toISOString(),
        type: 'recharge_bedou',
      });

      log(`db create success: ${demande.id}`);
    } catch (dbErr) {
      log(`db create error: ${dbErr.message}`);
      return Response.json(
        { error: 'Erreur création demande en base' },
        { status: 500 }
      );
    }

    // ── 4. Notification admin (NON-BLOCKING) ──────────────────────────────────
    log('admin notification start');

    // Envoyer async sans attendre — NE PAS BLOQUER LA REPONSE
    Promise.resolve().then(async () => {
      try {
        const admins = await base44.asServiceRole.entities.User.filter(
          { role: 'admin' },
          null,
          1000
        );

        log(`admins found: ${admins.length}`);

        for (const admin of admins) {
          try {
            // Créer notification directement en BDD
            await base44.asServiceRole.entities.Notification.create({
              destinataire_email: admin.email,
              destinataire_role: 'admin',
              titre: 'Nouvelle demande de recharge Bedou',
              message: `${user.full_name || user.email} a demandé une recharge de ${montant} F CFA (+ ${bonus} bonus = ${parseInt(montant) + parseInt(bonus || 0)} F). Validation requise.`,
              type: 'warning',
              lue: false,
              target_screen: '/gestion-bedou',
              target_entity_type: 'DemandeRecharge',
              target_entity_id: demande.id,
              notification_key: `bedou_recharge_${user.email}_${Date.now()}`,
            });

            log(`notification created for admin: ${admin.email}`);
          } catch (notifErr) {
            log(`notification error for ${admin.email}: ${notifErr.message}`);
            // Continue — ne pas bloquer
          }
        }

        log('admin notification success');
      } catch (err) {
        log(`admin notification global error: ${err.message}`);
      }
    }).catch(err => {
      log(`admin notification promise error: ${err.message}`);
    });

    // ── 5. Succès immédiat ────────────────────────────────────────────────────
    log(`submit end (${Date.now() - startTime}ms)`);

    return Response.json({
      success: true,
      demande_id: demande.id,
      montant,
      bonus: bonus || 0,
      montant_total: parseInt(montant) + parseInt(bonus || 0),
      message: 'Demande de recharge envoyée avec succès',
    });

  } catch (err) {
    log(`FATAL: ${err.message}`);
    return Response.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
});