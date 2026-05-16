import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { course_id, user_email } = payload;

    if (!course_id || !user_email) {
      return Response.json({ error: 'Missing course_id or user_email' }, { status: 400 });
    }

    // Récupérer la course
    const courses = await base44.asServiceRole.entities.Course.filter({ id: course_id });
    if (!courses || courses.length === 0) {
      return Response.json({ error: 'Course not found' }, { status: 404 });
    }

    const course = courses[0];

    // Vérifier que c'est la première course validée de cet utilisateur
    const userCourses = await base44.asServiceRole.entities.Course.filter({
      client_email: user_email,
      statut: 'livree',
    }, 'created_date', 100);

    const sortedCourses = (userCourses || []).sort((a, b) => 
      new Date(a.created_date) - new Date(b.created_date)
    );

    const isFirstCourse = sortedCourses.length > 0 && sortedCourses[0].id === course_id;

    if (!isFirstCourse) {
      console.log('[creditCommercialFirstCourse] Not the first course, skipping credit');
      return Response.json({ success: false, reason: 'Not first validated course' });
    }

    // Récupérer l'utilisateur pour son code de parrainage
    const users = await base44.asServiceRole.entities.User.filter({ email: user_email });
    if (!users || users.length === 0) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const user = users[0];
    const referralCode = user.code_promo_utilise || user.referral_code;

    if (!referralCode) {
      console.log('[creditCommercialFirstCourse] No referral code for user, no credit');
      return Response.json({ success: false, reason: 'No referral code' });
    }

    // Trouver le commercial avec ce code
    const codePromos = await base44.asServiceRole.entities.CodePromo.filter({ code: referralCode });
    if (!codePromos || codePromos.length === 0) {
      return Response.json({ error: 'CodePromo not found' }, { status: 404 });
    }

    const codePromo = codePromos[0];
    const commercialEmail = codePromo.commercial_email;

    // Vérifier si ce commercial a déjà été crédité pour cet utilisateur
    const transactions = await base44.asServiceRole.entities.ReferralTransaction.filter({
      user_email: commercialEmail,
      source_user_email: user_email,
      type: 'referral_first_course_bonus',
    });

    if (transactions && transactions.length > 0) {
      console.log('[creditCommercialFirstCourse] Already credited for this user');
      return Response.json({ success: false, reason: 'Already credited' });
    }

    // Créditer +50 F dans balance_blocked du commercial
    const bedouRecords = await base44.asServiceRole.entities.Bedou.filter({ user_email: commercialEmail });
    let bedouRecord = bedouRecords && bedouRecords.length > 0 ? bedouRecords[0] : null;

    if (!bedouRecord) {
      bedouRecord = await base44.asServiceRole.entities.Bedou.create({
        user_email: commercialEmail,
        user_nom: codePromo.commercial_name || '',
        role: 'commercial',
        solde: 0,
        solde_disponible: 0,
        solde_bloque: 0,
        bonus: 0,
        gains_totaux: 0,
        depenses_totales: 0,
        balance_blocked: 50,
        statut_bedou: 'actif',
        date_creation: new Date().toISOString(),
      });
    } else {
      const newBalance = (bedouRecord.balance_blocked || 0) + 50;
      await base44.asServiceRole.entities.Bedou.update(bedouRecord.id, {
        balance_blocked: newBalance,
        solde: (bedouRecord.solde || 0) + 50,
        gains_totaux: (bedouRecord.gains_totaux || 0) + 50,
      });
    }

    // Enregistrer la transaction
    await base44.asServiceRole.entities.ReferralTransaction.create({
      user_email: commercialEmail,
      type: 'referral_first_course_bonus',
      amount: 50,
      source_user_email: user_email,
      description: `Bonus première course validée pour ${user_email}`,
      status: 'completed',
    });

    // Incrémenter CodePromo
    await base44.asServiceRole.entities.CodePromo.update(codePromo.id, {
      nombre_validations: (codePromo.nombre_validations || 0) + 1,
    });

    // Notifier le commercial
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: commercialEmail,
      destinataire_role: 'commercial',
      titre: '💰 +50 F CFA de bonus parrainage !',
      message: `${user.full_name || user_email} a complété sa première course. Vous gagnez 50 F CFA dans votre Bedou bloqué.`,
      type: 'success',
      lue: false,
    });

    console.log('[creditCommercialFirstCourse] SUCCESS: +50 F credited to', commercialEmail);
    return Response.json({
      success: true,
      commercial_email: commercialEmail,
      amount: 50,
    });
  } catch (error) {
    console.error('[creditCommercialFirstCourse] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});