import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Diagnostic admin complet d'un utilisateur :
 * userId, email, téléphone, méthode d'inscription, dernière connexion,
 * état de vérification, présence/état du profil CDL, rôle actuel, profils disponibles,
 * date de dernière connexion, dernière erreur.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();

    if (!me || me.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await req.json();
    const { search_email, search_phone, search_id } = body;

    let user = null;

    // Rechercher par email
    if (search_email) {
      const users = await base44.asServiceRole.entities.User.filter({ email: search_email });
      if (users.length > 0) user = users[0];
    }

    // Rechercher par téléphone
    if (!user && search_phone) {
      const users = await base44.asServiceRole.entities.User.filter({
        telephone: search_phone,
      });
      if (users.length > 0) user = users[0];
    }

    // Rechercher par ID
    if (!user && search_id) {
      const users = await base44.asServiceRole.entities.User.filter({ id: search_id });
      if (users.length > 0) user = users[0];
    }

    if (!user) {
      return Response.json({ success: true, found: false, message: 'Utilisateur non trouvé' });
    }

    // Récupérer tous les profils associés
    const profiles = await base44.asServiceRole.entities.UserProfile.filter({
      user_email: user.email,
    });

    // Récupérer les logs de connexion
    let loginLogs = [];
    try {
      loginLogs = await base44.asServiceRole.entities.LoginAuditLog.filter(
        { user_email: user.email },
        '-created_date',
        10
      );
    } catch (_) {}

    // Récupérer les logs de réparation
    let repairLogs = [];
    try {
      repairLogs = await base44.asServiceRole.entities.RepairLog.filter(
        { user_email: user.email },
        '-created_date',
        5
      );
    } catch (_) {}

    const diagnosis = {
      // Identité
      user_id: user.id,
      email: user.email,
      phone: user.telephone,
      full_name: user.full_name,

      // Méthodes de création/connexion
      signup_method: user.created_phone_login ? 'phone' : user.google_id ? 'google' : 'email',
      google_id: user.google_id || null,
      created_phone_login: user.created_phone_login || false,

      // État de vérification
      email_verified: user.email_verified || false,
      phone_verified: user.phone_verified || false,
      onboarding_completed: user.onboarding_completed || false,

      // Rôle et statut
      current_role: user.role,
      current_profile_type: user.current_role || user.active_profile_type || null,

      // Profils
      profiles: profiles.map(p => ({
        id: p.id,
        type: p.profile_type,
        status: p.status,
        is_active: p.is_active_profile,
        completion: p.completion_percentage || 0,
        created_date: p.created_date,
        validated_at: p.validated_at,
        refusal_reason: p.refusal_reason,
      })),
      profiles_count: profiles.length,

      // Chronologie
      account_created: user.created_date,
      last_login: user.last_login,
      last_login_method: user.last_login_method || 'unknown',

      // Problèmes détectés
      issues: [
        ...(profiles.length === 0 ? ['⚠️ Aucun profil CDL'] : []),
        ...(profiles.some(p => p.status === 'refuse')
          ? ['⚠️ Au moins un profil refusé']
          : []),
        ...(profiles.some(p => p.status === 'suspend')
          ? ['⚠️ Au moins un profil suspendu']
          : []),
        ...(profiles.some(p => p.status === 'incomplet')
          ? ['⚠️ Au moins un profil incomplet']
          : []),
        ...(!user.onboarding_completed ? ['⚠️ Onboarding non complété'] : []),
        ...(!user.email_verified && user.email
          ? ['⚠️ Email non vérifié']
          : []),
        ...(!user.phone_verified && user.telephone
          ? ['⚠️ Téléphone non vérifié']
          : []),
      ],

      // Historique de connexion
      login_history: loginLogs.map(l => ({
        timestamp: l.created_date,
        step: l.step,
        method: l.method,
        error_code: l.error_code,
        error_message: l.error_message,
      })),

      // Logs de réparation
      repair_history: repairLogs.map(r => ({
        timestamp: r.created_date,
        correction: r.correction,
        detail: r.detail,
      })),

      // Recommandations
      recommendations: [],
    };

    // Ajouter les recommandations
    if (diagnosis.issues.length > 0) {
      if (!diagnosis.onboarding_completed) {
        diagnosis.recommendations.push(
          'Relancer le onboarding utilisateur via une fonction dédiée'
        );
      }
      if (diagnosis.profiles.length === 0) {
        diagnosis.recommendations.push('Créer automatiquement un profil client par défaut');
      }
      if (!diagnosis.email_verified && diagnosis.email) {
        diagnosis.recommendations.push('Forcer la vérification email');
      }
      if (
        diagnosis.login_history.some(l =>
          ['expired_code', 'wrong_password', 'not_found'].includes(l.error_code)
        )
      ) {
        diagnosis.recommendations.push('Aider l\'utilisateur à réinitialiser son mot de passe');
      }
    }

    return Response.json({
      success: true,
      found: true,
      diagnosis,
    });
  } catch (error) {
    console.error('[adminAuthDiagnostics] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});