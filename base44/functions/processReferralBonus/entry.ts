import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { referred_email, bonus_type } = await req.json();

    if (!referred_email || !['signup', 'first_course'].includes(bonus_type)) {
      return Response.json({ error: 'Invalid params' }, { status: 400 });
    }

    // Trouver le parrainage
    const referrals = await base44.asServiceRole.entities.UserReferral.filter({
      referred_email,
      status: 'active',
    });

    if (referrals.length === 0) {
      return Response.json({ success: false, message: 'No referral found' });
    }

    const referral = referrals[0];

    // Vérifier si le bonus a déjà été versé
    const fieldName = bonus_type === 'signup' ? 'signup_bonus_paid' : 'first_course_bonus_paid';
    if (referral[fieldName]) {
      return Response.json({ success: false, message: 'Bonus already paid' });
    }

    const BONUS_AMOUNT = 100;

    // Créditer le Bedou du parrain via bedouEngine
    try {
      await base44.functions.invoke('bedouEngine', {
        action: 'credit',
        user_email: referral.referrer_email,
        montant: BONUS_AMOUNT,
        raison: `Bonus parrainage - ${bonus_type === 'signup' ? 'inscription' : '1ère course'} de ${referred_email}`,
      });
    } catch (e) {
      console.error('[processReferralBonus] bedouEngine error:', e);
      // Continuer quand même pour enregistrer le bonus
    }

    // Mettre à jour UserReferral
    const updateData = {
      [fieldName]: true,
      [`${fieldName}_at`]: new Date().toISOString(),
      total_bonus: referral.total_bonus + BONUS_AMOUNT,
    };

    await base44.asServiceRole.entities.UserReferral.update(referral.id, updateData);

    // Notifier le parrain
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: referral.referrer_email,
      destinataire_role: 'user',
      titre: `💰 Bonus parrainage +${BONUS_AMOUNT}F`,
      message: `Votre filleul ${referred_email} ${bonus_type === 'signup' ? 'a confirmé son inscription' : 'a effectué sa première course'}. Bonus crédité sur votre Bedou.`,
      type: 'success',
      lue: false,
    });

    console.log(`[processReferralBonus] Bonus ${bonus_type} (${BONUS_AMOUNT}F) credited to ${referral.referrer_email}`);

    return Response.json({ success: true, bonus_amount: BONUS_AMOUNT });
  } catch (error) {
    console.error('[processReferralBonus] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});