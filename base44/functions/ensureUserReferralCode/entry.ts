import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Génère un code unique du format XXXX####
function generateCode() {
  const prefix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const number = Math.floor(100 + Math.random() * 9000);
  return `${prefix}${number}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Vérifier si l'utilisateur a déjà un code
    const existing = await base44.asServiceRole.entities.UserReferral.filter({
      referrer_email: user.email,
    });

    if (existing.length > 0 && existing[0].referral_code) {
      return Response.json({
        success: true,
        code: existing[0].referral_code,
        link: `https://cdl.app/register?promo=${existing[0].referral_code}`,
      });
    }

    // Générer un nouveau code unique
    let code;
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      code = generateCode();
      const check = await base44.asServiceRole.entities.UserReferral.filter({
        referral_code: code,
      });
      if (check.length === 0) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return Response.json({ error: 'Could not generate unique code' }, { status: 500 });
    }

    console.log(`[ensureUserReferralCode] Generated code ${code} for ${user.email}`);

    return Response.json({
      success: true,
      code,
      link: `https://cdl.app/register?promo=${code}`,
    });
  } catch (error) {
    console.error('[ensureUserReferralCode] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});