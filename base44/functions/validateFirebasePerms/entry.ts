/**
 * validateFirebasePerms — Vérifier permissions FCM du service account
 * 
 * Le service account DOIT avoir les rôles :
 * - roles/firebase.admin
 * - roles/firebase.messaging.admin
 * - roles/cloudmessaging.serviceAgent
 * 
 * Si manquant → 403 Forbidden sur FCM API
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const sa_json = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (!sa_json) return Response.json({ error: 'Service account JSON manquant' }, { status: 500 });

    const sa = JSON.parse(sa_json);
    console.log('[validateFirebasePerms] Service account email:', sa.client_email);
    console.log('[validateFirebasePerms] Project ID:', sa.project_id);

    // Permissions requises pour FCM
    const requiredRoles = [
      'roles/firebase.admin',
      'roles/firebase.messaging.admin',
      'roles/cloudmessaging.serviceAgent',
    ];

    console.log('[validateFirebasePerms] Rôles requis:', requiredRoles.join(', '));

    return Response.json({
      success: true,
      message: 'Vérification manuelle requise via Google Cloud Console',
      service_account: {
        email: sa.client_email,
        project_id: sa.project_id,
      },
      required_roles: requiredRoles,
      action: `
        1. Ouvre https://console.cloud.google.com/iam-admin/iam?project=${sa.project_id}
        2. Cherche ${sa.client_email}
        3. Edit → Add roles → Ajoute les rôles ci-dessus
        4. Réessaye le push
      `,
    });
  } catch (err) {
    console.error('[validateFirebasePerms] error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});