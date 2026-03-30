import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ADMIN_EMAILS = ['weezyh2@gmail.com'];
    const isAdmin = user.role === 'admin' || ADMIN_EMAILS.includes(user.email);

    console.log(`[ensureUserProfile] userId=${user.id} email=${user.email} user_type=${user.user_type} onboarding_completed=${user.onboarding_completed} isAdmin=${isAdmin}`);

    if (isAdmin) {
      console.log(`[ensureUserProfile] Admin → skip onboarding check`);
      return Response.json({ status: 'admin', needs_onboarding: false });
    }

    // Vérification critique : user_type obligatoire
    if (!user.user_type) {
      console.log(`[ensureUserProfile] ROLE MANQUANT pour userId=${user.id}`);
      return Response.json({ status: 'needs_onboarding', needs_onboarding: true, reason: 'ROLE MANQUANT' });
    }

    if (!user.onboarding_completed) {
      console.log(`[ensureUserProfile] onboarding_completed=false pour userId=${user.id}`);
      return Response.json({ status: 'needs_onboarding', needs_onboarding: true, reason: 'ONBOARDING NON TERMINE' });
    }

    const now = new Date().toISOString();
    let created = false;
    let skipped = false;

    if (user.user_type === 'client') {
      const existing = await base44.asServiceRole.entities.Client.filter({ email: user.email });
      if (existing.length === 0) {
        await base44.asServiceRole.entities.Client.create({
          nom_complet: user.full_name || '',
          email: user.email,
          numero_telephone: user.telephone || '',
          quartier_principal: user.quartier || '',
          statut_client: 'Actif',
          date_inscription: now,
          nombre_total_courses: 0,
          total_depense: 0,
        });
        created = true;
        console.log(`[ensureUserProfile] ✅ Fiche Client créée pour userId=${user.id}`);
      } else {
        skipped = true;
        console.log(`[ensureUserProfile] ⏭️ Fiche Client déjà existante pour userId=${user.id}`);
      }
    } else if (user.user_type === 'livreur') {
      // Livreurs = table Users uniquement, pas de table séparée
      console.log(`[ensureUserProfile] ⏭️ Livreur = pas de table séparée, userId=${user.id}`);
      skipped = true;
    } else if (user.user_type === 'partenaire') {
      const existing = await base44.asServiceRole.entities.Partenaire.filter({ user_email: user.email });
      if (existing.length === 0) {
        await base44.asServiceRole.entities.Partenaire.create({
          user_email: user.email,
          nom_commerce: user.full_name || '',
          nom_responsable: user.full_name || '',
          telephone: user.telephone || '',
          type_commerce: 'Boutique',
          statut: 'en_attente',
        });
        created = true;
        console.log(`[ensureUserProfile] ✅ Fiche Partenaire créée pour userId=${user.id}`);
      } else {
        skipped = true;
        console.log(`[ensureUserProfile] ⏭️ Fiche Partenaire déjà existante pour userId=${user.id}`);
      }
    } else if (user.user_type === 'commercial') {
      const existing = await base44.asServiceRole.entities.CodePromo.filter({ commercial_email: user.email });
      if (existing.length === 0) {
        await base44.asServiceRole.entities.CodePromo.create({
          commercial_email: user.email,
          commercial_name: user.full_name || '',
          code: '',
          statut: 'en_attente',
          actif: false,
          nombre_utilisations: 0,
          commission_due: 0,
          commission_payee: 0,
          statut_paiement: 'À jour',
        });
        created = true;
        console.log(`[ensureUserProfile] ✅ Fiche Commercial créée pour userId=${user.id}`);
      } else {
        skipped = true;
        console.log(`[ensureUserProfile] ⏭️ Fiche Commercial déjà existante pour userId=${user.id}`);
      }
    } else {
      console.log(`[ensureUserProfile] ⚠️ user_type inconnu: ${user.user_type} pour userId=${user.id}`);
    }

    return Response.json({
      status: 'ok',
      needs_onboarding: false,
      user_type: user.user_type,
      fiche_created: created,
      fiche_skipped: skipped,
    });
  } catch (error) {
    console.error(`[ensureUserProfile] ERREUR:`, error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});