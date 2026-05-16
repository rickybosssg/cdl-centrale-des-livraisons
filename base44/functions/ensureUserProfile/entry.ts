import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Accepter un user_type passé en paramètre (appelé juste après updateMe)
    // pour éviter le problème de cache de session
    let body = {};
    try { body = await req.json(); } catch (_) {}
    const userType = body.user_type || user.active_profile_type;

    const ADMIN_EMAILS = ['weezyh2@gmail.com'];
    const isAdmin = user.role === 'admin' || ADMIN_EMAILS.includes(user.email);
    const callContext = body.context || 'login';

    console.log(`[ensureUserProfile][${callContext}] userId=${user.id} email=${user.email} user_type(param)=${body.user_type} user_type(session)=${user.user_type} onboarding_completed=${user.onboarding_completed}`);

    if (isAdmin) {
      console.log(`[ensureUserProfile] Admin → skip`);
      return Response.json({ status: 'admin', needs_onboarding: false });
    }

    // Vérification critique : si user_type absent des deux sources → appelé trop tôt
    if (!userType) {
      console.log(`[ensureUserProfile] ⛔ ERREUR : ensureUserProfile appelé trop tôt — user_type non défini pour userId=${user.id}`);
      return Response.json({ status: 'needs_onboarding', needs_onboarding: true, reason: 'ROLE MANQUANT — appelé trop tôt' });
    }

    const onboardingOk = user.onboarding_completed || body.onboarding_completed;
    if (!onboardingOk) {
      console.log(`[ensureUserProfile] onboarding_completed=false pour userId=${user.id}`);
      // Audit log
      try {
        await base44.asServiceRole.functions.invoke('auditLoginAttempt', {
          step: 'success',
          method: 'session',
          identifier: user.email,
          user_id: user.id,
          user_email: user.email,
          error_code: 'onboarding_incomplete',
          error_message: 'Onboarding non terminé',
        });
      } catch (_) {}
      return Response.json({ status: 'needs_onboarding', needs_onboarding: true, reason: 'ONBOARDING NON TERMINE' });
    }

    const now = new Date().toISOString();
    let created = false;
    const logsToWrite = [];

    if (userType === 'client') {
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
        logsToWrite.push({ correction: 'fiche_creee', detail: 'Fiche Client créée automatiquement' });
        console.log(`[ensureUserProfile] ✅ Fiche Client créée pour userId=${user.id}`);
      } else {
        console.log(`[ensureUserProfile] ⏭️ Fiche Client déjà existante pour userId=${user.id}`);
      }
    } else if (userType === 'livreur') {
      console.log(`[ensureUserProfile] ⏭️ Livreur = pas de table séparée, userId=${user.id}`);
    } else if (userType === 'partenaire') {
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
        logsToWrite.push({ correction: 'fiche_creee', detail: 'Fiche Partenaire créée automatiquement' });
        console.log(`[ensureUserProfile] ✅ Fiche Partenaire créée pour userId=${user.id}`);
      } else {
        console.log(`[ensureUserProfile] ⏭️ Fiche Partenaire déjà existante pour userId=${user.id}`);
      }
    } else if (userType === 'commercial') {
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
        logsToWrite.push({ correction: 'fiche_creee', detail: 'Fiche Commercial créée automatiquement' });
        console.log(`[ensureUserProfile] ✅ Fiche Commercial créée pour userId=${user.id}`);
      } else {
        console.log(`[ensureUserProfile] ⏭️ Fiche Commercial déjà existante pour userId=${user.id}`);
      }
    } else {
      console.log(`[ensureUserProfile] ⚠️ user_type inconnu: ${userType} pour userId=${user.id}`);
    }

    // Écrire les logs de réparation si nécessaire
    for (const log of logsToWrite) {
      try {
        await base44.asServiceRole.entities.RepairLog.create({
          user_id: user.id,
          user_email: user.email,
          user_type: userType,
          correction: log.correction,
          detail: log.detail,
          contexte: callContext,
        });
      } catch (_) {}
    }

    // Audit log succès
    try {
      await base44.asServiceRole.functions.invoke('auditLoginAttempt', {
        step: 'success',
        method: 'session',
        identifier: user.email,
        user_id: user.id,
        user_email: user.email,
        user_role: user.role,
        profile_status: created ? 'created' : 'exists',
        current_profile_type: userType,
      });
    } catch (_) {}

    return Response.json({ status: 'ok', needs_onboarding: false, user_type: userType, fiche_created: created });
  } catch (error) {
    console.error(`[ensureUserProfile] ERREUR:`, error.message);
    
    // Audit log erreur
    try {
      const user = await base44.auth.me();
      await base44.asServiceRole.functions.invoke('auditLoginAttempt', {
        step: 'error',
        method: 'session',
        identifier: user?.email,
        user_id: user?.id,
        error_code: 'profile_load_error',
        error_message: error.message,
      });
    } catch (_) {}
    
    return Response.json({ error: error.message }, { status: 500 });
  }
});