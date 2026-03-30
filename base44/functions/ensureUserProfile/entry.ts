import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Crée la fiche métier si elle n'existe pas encore
async function createBusinessRecord(base44, user) {
  const { user_type, email, full_name, telephone, quartier } = user;
  const now = new Date().toISOString();

  if (user_type === 'client') {
    const existing = await base44.asServiceRole.entities.Client.filter({ email });
    if (existing.length === 0) {
      await base44.asServiceRole.entities.Client.create({
        nom_complet: full_name || '',
        email,
        numero_telephone: telephone || '',
        quartier_principal: quartier || '',
        statut_client: 'Actif',
        date_inscription: now,
        nombre_total_courses: 0,
        total_depense: 0,
      });
    }
    return true;
  }

  if (user_type === 'livreur') {
    // Pas de table Livreur séparée, tout est dans Users
    return true;
  }

  if (user_type === 'partenaire') {
    const existing = await base44.asServiceRole.entities.Partenaire.filter({ user_email: email });
    if (existing.length === 0) {
      await base44.asServiceRole.entities.Partenaire.create({
        user_email: email,
        nom_commerce: full_name || '',
        nom_responsable: full_name || '',
        telephone: telephone || '',
        type_commerce: 'Boutique',
        statut: 'en_attente',
      });
    }
    return true;
  }

  if (user_type === 'commercial') {
    // Vérifier si un code promo existe déjà
    const existing = await base44.asServiceRole.entities.CodePromo.filter({ commercial_email: email });
    if (existing.length === 0) {
      await base44.asServiceRole.entities.CodePromo.create({
        commercial_email: email,
        commercial_name: full_name || '',
        code: '',
        statut: 'en_attente',
        actif: false,
        nombre_utilisations: 0,
        commission_due: 0,
        commission_payee: 0,
        statut_paiement: 'À jour',
      });
    }
    return true;
  }

  return false;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ADMIN_EMAILS = ['weezyh2@gmail.com'];
    const isAdmin = user.role === 'admin' || ADMIN_EMAILS.includes(user.email);

    // Admin : pas d'onboarding requis
    if (isAdmin) {
      return Response.json({ status: 'admin', needs_onboarding: false });
    }

    const needsOnboarding = !user.user_type || !user.onboarding_completed;

    if (needsOnboarding) {
      return Response.json({ status: 'needs_onboarding', needs_onboarding: true });
    }

    // Auto-réparation : vérifier et créer la fiche métier si manquante
    await createBusinessRecord(base44, user);

    return Response.json({ status: 'ok', needs_onboarding: false, user_type: user.user_type });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});