import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { user_email, user_nom, user_role, type, montant, status } = body;

    if (!user_email || !type || !montant) {
      return Response.json({ error: 'Paramètres manquants' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // Déterminer le message
    let titre, message;
    if (type === 'recharge') {
      if (status === 'demande') {
        titre = '💰 Recharge Bedou demandée';
        message = `Votre demande de rechargement de ${montant.toLocaleString()} FCFA a été envoyée. En attente de validation.`;
      } else if (status === 'valide') {
        titre = '✅ Recharge Bedou validée';
        message = `Recharge réussie ! Votre compte Bedou a été crédité de ${montant.toLocaleString()} FCFA.`;
      } else if (status === 'refuse') {
        titre = '❌ Recharge Bedou refusée';
        message = `Votre rechargement de ${montant.toLocaleString()} FCFA a été refusé. Contactez le support.`;
      }
    } else if (type === 'retrait') {
      if (status === 'demande') {
        titre = '📤 Retrait Bedou demandé';
        message = `Votre demande de retrait de ${montant.toLocaleString()} FCFA est en cours de traitement.`;
      } else if (status === 'valide') {
        titre = '✅ Retrait effectué';
        message = `Retrait réussie ! Vous avez reçu ${montant.toLocaleString()} FCFA.`;
      } else if (status === 'refuse') {
        titre = '❌ Retrait refusé';
        message = `Votre demande de retrait a été refusée. Vérifiez vos informations.`;
      }
    }

    // Créer la notification in-app
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: user_email,
      destinataire_role: user_role,
      titre,
      message,
      type: status === 'valide' ? 'success' : status === 'refuse' ? 'danger' : 'info',
      lue: false,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('[notifyBedouRequest] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});