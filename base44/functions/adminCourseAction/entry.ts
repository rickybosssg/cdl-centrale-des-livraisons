/**
 * adminCourseAction — Admin : suppression logique + force delete
 *
 * ⚠️ ACTION "cancel" BLOQUÉE → redirige vers cancelCourseAction (SOURCE UNIQUE)
 *
 * Actions légitimes conservées :
 *   - "delete"       : suppression logique (is_deleted=true, sans annulation)
 *   - "force_delete" : suppression forcée toutes gardes bypassées (is_deleted + annulee)
 *
 * Action bloquée (LEGACY_CANCEL_BLOCKED) :
 *   - "cancel" → redirigé vers cancelCourseAction{action:cancel_admin}
 *
 * Raison : cancelCourseAction est la SOURCE UNIQUE d'annulation.
 * Elle garantit : notifications, Bedou, logs, libération livreur, historique, stats.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    const ALLOWED_ROLES = new Set(['admin', 'dispatcher', 'staff', 'super_admin']);
    let isStaff = ALLOWED_ROLES.has(user?.role) || user?.user_type === 'admin';

    // Fallback : si le token JWT a un mauvais rôle, vérifier le vrai rôle en BDD
    if (!isStaff && user?.email) {
      try {
        const dbUsers = await base44.asServiceRole.entities.User.filter({ email: user.email });
        const dbRole = dbUsers?.[0]?.role;
        isStaff = ALLOWED_ROLES.has(dbRole);
        if (isStaff) console.log(`[adminCourseAction] rôle corrigé via DB | email=${user.email} | db_role=${dbRole}`);
      } catch (_) {}
    }

    if (!user || !isStaff) {
      console.error(`[adminCourseAction] 403 | email=${user?.email} | token_role=${user?.role}`);
      return Response.json({ error: `Accès refusé — rôle token: ${user?.role}` }, { status: 403 });
    }

    const { course_id, action, raison } = await req.json();
    if (!course_id || !action || !raison?.trim()) {
      return Response.json({ error: 'Paramètres manquants (course_id, action, raison)' }, { status: 400 });
    }
    if (!['cancel', 'delete', 'force_delete'].includes(action)) {
      return Response.json({ error: 'Action invalide — valeurs acceptées : cancel | delete | force_delete' }, { status: 400 });
    }

    // ── ACTION CANCEL : LEGACY_CANCEL_BLOCKED → cancelCourseAction ────────────
    if (action === 'cancel') {
      console.warn(`[LEGACY_CANCEL_BLOCKED] adminCourseAction.cancel | course=${course_id} | caller=${user.email} | redirecting to cancelCourseAction{cancel_admin}`);
      const res = await base44.asServiceRole.functions.invoke('cancelCourseAction', {
        courseId: course_id,
        action: 'cancel_admin',
        raison: raison.trim(),
      }).catch(e => ({ data: { success: false, error: e.message } }));
      return Response.json(res?.data || { success: false, reason: 'legacy_cancel_blocked' });
    }

    // ── 1. Récupérer la course ──────────────────────────────────────────────
    const courses = await base44.asServiceRole.entities.Course.filter({ id: course_id });
    if (!courses || courses.length === 0) {
      return Response.json({ error: 'Course introuvable' }, { status: 404 });
    }
    const course = courses[0];

    const now = new Date().toISOString();
    const ancienStatut = course.statut;

    // ── ACTION FORCE DELETE — bypass toutes les gardes statut ─────────────────
    if (action === 'force_delete') {
      console.log(`[FORCE_DELETE_START] course=${course_id} | statut=${ancienStatut} | admin=${user.email} | livreur=${course.livreur_email || 'aucun'}`);

      await base44.asServiceRole.entities.Course.update(course_id, {
        is_deleted: true,
        statut: 'annulee',
        deleted_at: now,
        deleted_by_admin: user.email,
        delete_reason: raison.trim(),
        livreur_email: null,
        livreur_name: null,
        telephone_livreur: null,
        heure_assignation: null,
      });
      console.log(`[FORCE_DELETE_DB_UPDATED] is_deleted=true + statut=annulee | course=${course_id}`);

      // Libérer le livreur — recalcul réel depuis BDD
      if (course.livreur_email) {
        try {
          const livs = await base44.asServiceRole.entities.User.filter({ email: course.livreur_email });
          if (livs?.[0]) {
            const ACTIVE = new Set(['assignee_attente','acceptee','driver_en_route_pickup','arrived_pickup','en_cours','arrived_dropoff']);
            const allActive = await base44.asServiceRole.entities.Course.filter({ livreur_email: course.livreur_email });
            const realCount = allActive.filter(x => x.id !== course_id && ACTIVE.has(x.statut) && !x.is_deleted).length;
            await base44.asServiceRole.entities.User.update(livs[0].id, { nombre_courses_actives: realCount });
            console.log(`[FORCE_DELETE_REALTIME_SENT] livreur libéré | email=${course.livreur_email} | new_count=${realCount}`);
          }
        } catch (_) {}
      }

      await base44.asServiceRole.entities.AdminActionLog.create({
        admin_email: user.email,
        admin_name: user.full_name || user.email,
        action_type: 'COURSE_FORCE_DELETED',
        entity_type: 'Course',
        entity_id: course_id,
        details: `Force delete — Raison: ${raison.trim()} | Statut avant: ${ancienStatut} | Client: ${course.client_email} | Livreur: ${course.livreur_email || 'aucun'}`,
      }).catch(() => {});

      console.log(`[FORCE_DELETE_SUCCESS] course=${course_id} | statut_avant=${ancienStatut}`);
      return Response.json({ success: true, action: 'force_delete', course_id, statut_avant: ancienStatut });
    }

    // ── ACTION DELETE — suppression logique uniquement ─────────────────────
    if (action === 'delete') {
      if (course.is_deleted) {
        return Response.json({ error: 'Course déjà supprimée' }, { status: 409 });
      }
      await base44.asServiceRole.entities.Course.update(course_id, {
        is_deleted: true,
        deleted_at: now,
        deleted_by_admin: user.email,
        delete_reason: raison.trim(),
      });

      await base44.asServiceRole.entities.AdminActionLog.create({
        admin_email: user.email,
        admin_name: user.full_name || user.email,
        action_type: 'COURSE_DELETED',
        entity_type: 'Course',
        entity_id: course_id,
        details: `Suppression logique — Raison: ${raison.trim()} | Statut: ${ancienStatut} | Client: ${course.client_name || course.client_email} | Prix: ${course.prix} FCFA`,
        metadata_json: JSON.stringify({
          statut_au_moment: ancienStatut,
          raison,
          livreur_email: course.livreur_email || null,
          client_email: course.client_email,
          prix: course.prix,
        }),
      }).catch(() => {});

      console.log(`[adminCourseAction] DELETE — course ${course_id} par ${user.email} — ${raison}`);
      return Response.json({ success: true, action: 'delete', course_id });
    }

  } catch (error) {
    console.error(`[ADMIN_CANCEL_ERROR] backend | err=${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});