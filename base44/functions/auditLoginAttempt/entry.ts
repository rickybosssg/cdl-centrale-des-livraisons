import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Audit centralisé de toutes les tentatives de connexion.
 * Logs détaillés : identifier utilisé, méthode, succès/échec, raison, profil, rôle.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const {
      step, // 'request' | 'verify' | 'success' | 'error'
      method, // 'email' | 'phone' | 'google'
      identifier, // email ou téléphone utilisé
      error_code, // si erreur : 'invalid_format' | 'not_found' | 'wrong_password' | 'expired_code' | 'network_error' | etc.
      error_message,
      user_id, // si auth réussie
      user_email,
      user_phone,
      profile_status, // 'created' | 'exists' | 'missing' | 'corrupted'
      user_role,
      profiles_count,
      current_profile_type,
      ip_address,
      user_agent,
    } = body;

    const now = new Date().toISOString();
    const logEntry = {
      timestamp: now,
      step,
      method,
      identifier,
      error_code,
      error_message,
      user_id,
      user_email,
      user_phone,
      profile_status,
      user_role,
      profiles_count,
      current_profile_type,
      ip_address,
      user_agent,
    };

    console.log(`[auditLoginAttempt] ${JSON.stringify(logEntry)}`);

    // Enregistrer en BDD pour historique
    try {
      await base44.asServiceRole.entities.LoginAuditLog.create(logEntry);
    } catch (e) {
      // Si la table n'existe pas encore, just log to console
      console.warn('[auditLoginAttempt] LoginAuditLog table missing:', e.message);
    }

    return Response.json({
      success: true,
      logged: true,
      timestamp: now,
    });
  } catch (error) {
    console.error('[auditLoginAttempt] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});