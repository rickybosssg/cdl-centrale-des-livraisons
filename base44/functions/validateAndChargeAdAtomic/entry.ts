import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const { pub_id, pub_title, advertiser_email, amount } = await req.json();
    const TARIF = 5000;

    // 1. Vérifier le Bedou de l'annonceur MAINTENANT (race condition prevention)
    const bedouRes = await base44.functions.invoke('bedouEngine', {
      action: 'get_bedou_user',
      user_email: advertiser_email,
    });
    const bedou = bedouRes.data?.bedou;
    if (!bedou || (bedou.solde_disponible || 0) < TARIF) {
      return Response.json({ 
        success: false, 
        error: `Solde insuffisant (${TARIF}F requis, ${bedou?.solde_disponible || 0}F disponible)` 
      }, { status: 400 });
    }

    // 2. Débiter l'annonceur
    await base44.functions.invoke('bedouEngine', {
      action: 'debit',
      user_email: advertiser_email,
      montant: TARIF,
      raison: `Paiement publicité: ${pub_title}`,
    });

    // 3. Créditer CDL
    await base44.functions.invoke('bedouEngine', {
      action: 'credit',
      user_email: 'cdl@app.local',
      montant: TARIF,
      raison: `Publicité validée: ${pub_title}`,
    });

    // 4. Mettre à jour la pub
    const dateFin = new Date();
    dateFin.setDate(dateFin.getDate() + 7);
    await base44.entities.Publicite.update(pub_id, {
      statut: 'validée',
      active: true,
      date_fin: dateFin.toISOString(),
      cout: TARIF,
    });

    // 5. Notifier l'annonceur
    await base44.entities.Notification.create({
      destinataire_email: advertiser_email,
      destinataire_role: 'annonceur',
      titre: '✅ Publicité validée et active',
      message: `Votre publicité "${pub_title}" a été validée ! ${TARIF.toLocaleString()}F débité de votre compte. Active pour 7 jours.`,
      type: 'success',
      lue: false,
    });

    // 6. Créer une Transaction de trace
    await base44.entities.Transaction.create({
      user_email: advertiser_email,
      user_nom: advertiser_email,
      role: 'annonceur',
      type: 'paiement',
      sens: 'debit',
      montant: TARIF,
      source: 'publicite',
      methode: 'interne',
      reference_id: pub_id,
      statut: 'valide',
      description: `Paiement publicité: ${pub_title}`,
      valide_par: user.email,
    });

    return Response.json({ 
      success: true, 
      message: `Publicité validée et débité ${TARIF}F` 
    });
  } catch (error) {
    console.error('[validateAndChargeAdAtomic] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});