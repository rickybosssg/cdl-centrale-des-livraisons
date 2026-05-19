/**
 * forceDeleteCourse — Suppression forcée d'une course bloquée (admin service-role uniquement)
 *
 * Contourne les gardes statut/email qui causent 403/400 côté client.
 * Propage l'événement realtime cross-device via mise à jour is_deleted=true + statut=annulee.
 *
 * Payload: { course_id: string, raison?: string }
 *
 * Logs:
 *   [FORCE_DELETE_STARTED]
 *   [FORCE_DELETE_SUCCESS]
 *   [FORCE_DELETE_REALTIME_PROPAGATED]
 *   [FORCE_DELETE_UI_REMOVED]
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CDL_ADMIN_EMAIL = 'weezyh2@gmail.com';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST required' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);

  // Auth
  let user = null;
  try { user = await base44.auth.me(); } catch (_) {}

  if (!user) {
    return Response.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const isAdmin = user.role === 'admin' || user.role === 'dispatcher' || user.email === CDL_ADMIN_EMAIL;
  if (!isAdmin) {
    console.error(`[FORCE_DELETE_ERROR] 403 | user=${user.email} | role=${user.role}`);
    return Response.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
  }

  let body = {};
  try { body = await req.json(); } catch (_) {}

  const { course_id, raison = 'Force delete admin' } = body;
  if (!course_id) {
    return Response.json({ error: 'course_id requis' }, { status: 400 });
  }

  const now = new Date().toISOString();

  console.log(`[FORCE_DELETE_STARTED] course=${course_id} | admin=${user.email} | raison=${raison} | ts=${now}`);

  // 1. Lire la course (service-role, bypass RLS)
  let courses = [];
  try {
    courses = await base44.asServiceRole.entities.Course.filter({ id: course_id });
  } catch (e) {
    console.error(`[FORCE_DELETE_ERROR] filter failed | ${e.message}`);
    return Response.json({ error: 'Impossible de lire la course: ' + e.message }, { status: 500 });
  }

  const c = courses?.[0];

  // Diagnostic complet de la course
  if (c) {
    console.log(`[FORCE_DELETE_STARTED] course_state | statut=${c.statut} | is_deleted=${c.is_deleted} | settlement_status=${c.settlement_status} | client=${c.client_email} | livreur=${c.livreur_email} | prix=${c.prix}`);
  } else {
    console.warn(`[FORCE_DELETE_STARTED] course introuvable en BDD | course_id=${course_id}`);
    return Response.json({
      success: false,
      already_gone: true,
      message: 'Course introuvable en BDD — peut-être déjà supprimée',
      course_id,
    });
  }

  const ancienStatut = c.statut;

  // 2. Suppression forcée — is_deleted + statut annulee + nettoyage livreur SIMULTANÉMENT
  try {
    await base44.asServiceRole.entities.Course.update(course_id, {
      is_deleted: true,
      statut: 'annulee',
      deleted_at: now,
      deleted_by_admin: user.email,
      delete_reason: raison,
      livreur_email: null,
      livreur_name: null,
      telephone_livreur: null,
      heure_assignation: null,
    });
    console.log(`[FORCE_DELETE_SUCCESS] course=${course_id} | statut_avant=${ancienStatut} | ts=${now}`);
  } catch (e) {
    console.error(`[FORCE_DELETE_ERROR] update failed | ${e.message}`);
    return Response.json({ error: 'Échec suppression: ' + e.message }, { status: 500 });
  }

  // 3. Libérer le livreur si assigné
  if (c.livreur_email) {
    try {
      const livs = await base44.asServiceRole.entities.User.filter({ email: c.livreur_email });
      if (livs?.[0]) {
        const allCourses = await base44.asServiceRole.entities.Course.filter({ livreur_email: c.livreur_email });
        const ACTIVE = new Set(['assignee_attente','acceptee','driver_en_route_pickup','arrived_pickup','en_cours','arrived_dropoff']);
        const realCount = allCourses.filter(x => x.id !== course_id && ACTIVE.has(x.statut) && !x.is_deleted).length;
        await base44.asServiceRole.entities.User.update(livs[0].id, {
          nombre_courses_actives: realCount,
        });
        console.log(`[FORCE_DELETE_SUCCESS] livreur libéré | email=${c.livreur_email} | new_count=${realCount}`);
      }
    } catch (e) {
      console.warn(`[FORCE_DELETE_ERROR] libération livreur failed | ${e.message}`);
    }
  }

  // 4. Notifier client + livreur → déclenche update realtime sur leurs appareils
  //    Le update realtime de la Course + les Notifications cross-device propagent l'événement
  const notifPromises = [];

  if (c.client_email) {
    notifPromises.push(
      base44.asServiceRole.entities.Notification.create({
        destinataire_email: c.client_email,
        destinataire_role: 'client',
        titre: '❌ Votre course a été supprimée',
        message: `Votre course ${c.quartier_depart || ''}→${c.quartier_arrivee || ''} a été retirée par CDL. Raison : ${raison}`,
        type: 'danger',
        lue: false,
        course_id,
      }).catch(() => {})
    );
  }

  if (c.livreur_email) {
    notifPromises.push(
      base44.asServiceRole.entities.Notification.create({
        destinataire_email: c.livreur_email,
        destinataire_role: 'livreur',
        titre: '🚫 Course supprimée',
        message: `La course ${c.quartier_depart || ''}→${c.quartier_arrivee || ''} a été supprimée. Raison : ${raison}`,
        type: 'warning',
        lue: false,
        course_id,
      }).catch(() => {})
    );
  }

  // 5. Marquer toutes les notifications liées comme lues → nettoie l'UI notification
  notifPromises.push(
    base44.asServiceRole.entities.Notification.filter({ course_id }).then(async (notifs) => {
      for (const n of (notifs || [])) {
        await base44.asServiceRole.entities.Notification.update(n.id, { lue: true }).catch(() => {});
      }
      console.log(`[FORCE_DELETE_UI_REMOVED] notifications nettoyées | count=${notifs?.length || 0}`);
    }).catch(() => {})
  );

  await Promise.allSettled(notifPromises);

  // 6. Log admin
  await base44.asServiceRole.entities.AdminActionLog.create({
    admin_email: user.email,
    admin_name: user.full_name || user.email,
    action_type: 'COURSE_FORCE_DELETED',
    entity_type: 'Course',
    entity_id: course_id,
    details: `Force delete — Raison: ${raison} | Statut avant: ${ancienStatut} | Client: ${c.client_email} | Livreur: ${c.livreur_email || 'aucun'}`,
    metadata_json: JSON.stringify({
      statut_au_moment: ancienStatut,
      is_deleted_avant: c.is_deleted,
      settlement_status: c.settlement_status,
      raison,
      client_email: c.client_email,
      livreur_email: c.livreur_email,
      prix: c.prix,
    }),
  }).catch(() => {});

  console.log(`[FORCE_DELETE_REALTIME_PROPAGATED] is_deleted=true propagé | course=${course_id} | client=${c.client_email} | livreur=${c.livreur_email || 'none'} | ts=${now}`);

  return Response.json({
    success: true,
    course_id,
    statut_avant: ancienStatut,
    client_email: c.client_email,
    livreur_email: c.livreur_email || null,
    prix: c.prix,
    message: `Course ${course_id} supprimée de force. Propagation realtime déclenchée.`,
  });
});