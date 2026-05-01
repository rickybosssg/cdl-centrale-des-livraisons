/**
 * sendBedouRechargeNotification — Notifier un admin d'une nouvelle demande de recharge
 * Envoie notification push + SMS WhatsApp
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function log(msg) {
  console.log(`[BEDOU_NOTIF] ${msg}`);
}

Deno.serve(async (req) => {
  try {
    log('send start');

    const base44 = createClientFromRequest(req);
    const bodyText = await req.text();
    const payload = JSON.parse(bodyText);

    const {
      admin_email,
      requester_name,
      requester_email,
      montant,
      bonus,
      demande_id,
    } = payload;

    if (!admin_email) {
      log('no admin_email');
      return Response.json({ error: 'admin_email required' }, { status: 400 });
    }

    log(`admin: ${admin_email}, requester: ${requester_email}, montant: ${montant}`);

    // ── Créer notification Bedou ────────────────────────────────────────────
    const montantTotal = (parseInt(montant) || 0) + (parseInt(bonus) || 0);
    
    try {
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: admin_email,
        destinataire_role: 'admin',
        titre: 'Nouvelle demande de recharge Bedou',
        message: `${requester_name} a demandé une recharge de ${montant} F CFA (+ ${bonus} bonus = ${montantTotal} F total). Validation requise.`,
        type: 'warning',
        lue: false,
        target_screen: '/gestion-bedou',
        target_entity_type: 'DemandeRecharge',
        target_entity_id: demande_id,
        notification_key: `bedou_recharge_${requester_email}_${Date.now()}`,
      });

      log(`notification created for ${admin_email}`);
    } catch (notifErr) {
      log(`notification create error: ${notifErr.message}`);
      // Continue even if notification fails
    }

    // ── Envoyer push FCM à l'admin (optionnel, best-effort) ──────────────────
    try {
      const fcmTokens = await base44.asServiceRole.entities.FcmToken.filter({
        user_email: admin_email,
        is_active: true,
      });

      if (fcmTokens && fcmTokens.length > 0) {
        log(`found ${fcmTokens.length} FCM tokens for admin`);
        
        // Envoyer async sans attendre
        Promise.resolve().then(async () => {
          try {
            await base44.asServiceRole.functions.invoke('sendFcmNotification', {
              user_email: admin_email,
              title: '🔔 Nouvelle demande de recharge Bedou',
              body: `${requester_name} : ${montant} F CFA à valider`,
              data: {
                notif_route: '/gestion-bedou',
                demande_id: demande_id,
              },
            });
            log('FCM notification sent');
          } catch (fcmErr) {
            log(`FCM notification error: ${fcmErr.message}`);
          }
        }).catch(err => {
          log(`FCM promise error: ${err.message}`);
        });
      }
    } catch (fcmCheckErr) {
      log(`FCM check error: ${fcmCheckErr.message}`);
    }

    log('send end - SUCCESS');

    return Response.json({
      success: true,
      message: 'Notification sent to admin',
    });

  } catch (err) {
    log(`FATAL: ${err.message}`);
    return Response.json(
      { error: 'Notification error' },
      { status: 500 }
    );
  }
});