/**
 * syncPhoneOtps — Automation schedulée toutes les 5 minutes
 *
 * Lit tous les users phone non-vérifiés (phone_XXX@cdl.phone)
 * et essaie de récupérer leur otp_code pour le stocker dans PhoneOtpTemp.
 *
 * L'automation système a potentiellement accès à des champs filtrés.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const BASE44_APP_ID = Deno.env.get('BASE44_APP_ID');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Lire via l'API REST interne — tenter avec plusieurs formats d'auth
    const authHeader = req.headers.get('authorization') || '';
    const serviceToken = authHeader.replace(/^Bearer\s+/i, '').trim();

    const result = { synced: 0, skipped: 0, steps: [] };

    // Chercher les users phone non-vérifiés créés dans les 15 dernières minutes
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    // Lire via SDK asServiceRole — lister TOUS les users (pas de filtre is_verified)
    // et chercher côté client les phone users non vérifiés
    const allPhoneUsers = await base44.asServiceRole.entities.User.filter({ email: { $regex: '^phone_' } }).catch(() => []);
    result.steps.push({
      step: 'sdk_list_phone_users',
      count: allPhoneUsers.length,
      sample_fields: allPhoneUsers[0] ? Object.keys(allPhoneUsers[0]) : [],
    });

    // Pour chaque user phone non-vérifié, lire l'OTP via REST direct
    const recentPhoneUsers = allPhoneUsers.filter(u =>
      u.email?.endsWith('@cdl.phone') &&
      !u.is_verified &&
      new Date(u.created_date) > new Date(cutoff)
    );

    result.steps.push({ step: 'recent_unverified', count: recentPhoneUsers.length });

    // Pour chaque user, lire via REST pour obtenir otp_code (si accessible)
    const dList = [];
    for (const u of recentPhoneUsers) {
      const rUser = await fetch(`https://api.base44.app/api/apps/${BASE44_APP_ID}/entities/User/${u.id}`, {
        headers: { 'Authorization': `Bearer ${serviceToken}` },
      });
      const dUser = await rUser.json().catch(() => null);
      if (dUser?.otp_code) {
        dList.push({ ...u, otp_code: dUser.otp_code, otp_expires_at: dUser.otp_expires_at });
        result.steps.push({ step: 'otp_found_via_rest', email: u.email, otp: dUser.otp_code });
      } else {
        result.steps.push({ step: 'otp_not_found', email: u.email, fields: Object.keys(dUser || {}) });
      }
    }

    result.steps.push({ step: 'users_with_otp', count: dList.length });

    // Filtrer les users phone CDL avec OTP disponible
    const phoneUsers = dList;

    result.steps.push({ step: 'filtered_phone_users', count: phoneUsers.length });

    for (const u of phoneUsers) {
      try {
        // Nettoyer les anciens enregistrements
        const old = await base44.asServiceRole.entities.PhoneOtpTemp.filter({ email: u.email });
        for (const o of old) {
          await base44.asServiceRole.entities.PhoneOtpTemp.delete(o.id);
        }

        // Stocker l'OTP dans PhoneOtpTemp
        const expiresAt = u.otp_expires_at || new Date(Date.now() + 9 * 60 * 1000).toISOString();
        await base44.asServiceRole.entities.PhoneOtpTemp.create({
          email: u.email,
          otp_code: u.otp_code,
          expires_at: expiresAt,
          used: false,
        });

        result.synced++;
        result.steps.push({ step: 'synced', email: u.email, otp: u.otp_code });
      } catch (e) {
        result.skipped++;
        result.steps.push({ step: 'skip_error', email: u.email, error: e.message });
      }
    }

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});