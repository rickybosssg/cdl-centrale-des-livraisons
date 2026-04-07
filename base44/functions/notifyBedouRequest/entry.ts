import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Notifie un utilisateur du statut de sa demande Bedou (recharge ou retrait)
 * ET les admins en cas de nouvelle demande
 * DB + FCM push
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { user_email, user_nom, user_role, type, montant, status } = body;

    if (!user_email || !type || !montant) {
      return Response.json({ error: 'Paramètres manquants' }, { status: 400 });
    }

    let titre, message;
    if (type === 'recharge') {
      if (status === 'demande') {
        titre = '💰 Recharge Bedou en attente';
        message = `Votre demande de rechargement de ${montant.toLocaleString()} FCFA a été envoyée. En attente de validation admin.`;
      } else if (status === 'valide') {
        titre = '✅ Recharge Bedou validée !';
        message = `Recharge réussie ! Votre compte Bedou a été crédité de ${montant.toLocaleString()} FCFA.`;
      } else if (status === 'refuse') {
        titre = '❌ Recharge Bedou refusée';
        message = `Votre rechargement de ${montant.toLocaleString()} FCFA a été refusé. Contactez le support CDL.`;
      }
    } else if (type === 'retrait') {
      if (status === 'demande') {
        titre = '📤 Retrait Bedou en attente';
        message = `Votre demande de retrait de ${montant.toLocaleString()} FCFA est en cours de traitement.`;
      } else if (status === 'valide') {
        titre = '✅ Retrait Bedou effectué !';
        message = `Retrait réussi ! Vous avez reçu ${montant.toLocaleString()} FCFA.`;
      } else if (status === 'refuse') {
        titre = '❌ Retrait Bedou refusé';
        message = `Votre demande de retrait a été refusée. Vérifiez vos informations ou contactez le support.`;
      }
    }

    if (!titre) return Response.json({ skipped: true, reason: 'unknown type/status' });

    const notifType = status === 'valide' ? 'success' : status === 'refuse' ? 'danger' : 'info';
    const route = '/mon-bedou';

    // 1. Notif DB utilisateur
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: user_email,
      destinataire_role: user_role || 'user',
      titre,
      message,
      type: notifType,
      lue: false,
      target_screen: route,
    });

    // 2. FCM push utilisateur
    await base44.asServiceRole.functions.invoke('sendFcmNotification', {
      user_email,
      title: titre,
      body: message,
      data: { type: `bedou_${type}`, route, status: status || '' },
    }).catch(() => {});

    return Response.json({ success: true });
  } catch (error) {
    console.error('[notifyBedouRequest] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});