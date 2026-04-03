import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { referred_email, referral_code } = await req.json();

    if (!referred_email || !referral_code) {
      return Response.json({ error: 'Missing email or code' }, { status: 400 });
    }

    // Vérifier auto-parrainage
    if (referred_email === referral_code) {
      return Response.json({ success: false, message: 'Cannot self-refer' });
    }

    // Trouver le parrain via son code
    const referrer = await base44.asServiceRole.entities.UserReferral.filter({
      referral_code: referral_code,
    });

    let referrer_email = null;

    if (referrer.length > 0) {
      referrer_email = referrer[0].referrer_email;
    } else {
      // Sinon chercher si c'est un email direct (fallback)
      const users = await base44.asServiceRole.entities.User.list('-created_date', 100);
      const found = users.find(u => u.email === referral_code);
      if (found) {
        referrer_email = referral_code;
      } else {
        return Response.json({ success: false, message: 'Invalid referral code' });
      }
    }

    // Vérifier que referred_email n'a pas déjà de parrain
    const existing = await base44.asServiceRole.entities.UserReferral.filter({
      referred_email: referred_email,
    });

    if (existing.length > 0) {
      return Response.json({ success: false, message: 'User already has a referrer' });
    }

    // Créer le lien de parrainage
    await base44.asServiceRole.entities.UserReferral.create({
      referrer_email,
      referred_email,
      referral_code: referral_code,
      status: 'active',
      signup_bonus_paid: false,
      first_course_bonus_paid: false,
      total_bonus: 0,
    });

    console.log(`[linkReferralOnSignup] Referral linked: ${referrer_email} -> ${referred_email}`);

    return Response.json({ success: true, referrer_email });
  } catch (error) {
    console.error('[linkReferralOnSignup] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});