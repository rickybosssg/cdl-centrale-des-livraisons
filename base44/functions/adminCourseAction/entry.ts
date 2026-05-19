/**
 * adminCourseAction — Annulation ou suppression logique d'une course par l'admin
 *
 * Payload:
 *   course_id  : string (obligatoire)
 *   action     : "cancel" | "delete"
 *   raison     : string (obligatoire)
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

    // ── 1. Récupérer la course ──────────────────────────────────────────────
    const courses = await base44.asServiceRole.entities.Course.filter({ id: course_id });
    if (!courses || courses.length === 0) {
      return Response.json({ error: 'Course introuvable' }, { status: 404 });
    }
    const course = courses[0];

    // ── 2. Garde anti-doublons ─────────────────────────────────────────────
    if (action === 'cancel' && ['annulee', 'annulee_par_admin'].includes(course.statut)) {
      return Response.json({ error: 'Course déjà annulée' }, { status: 409 });
    }
    if (action === 'delete' && course.is_deleted) {
      return Response.json({ error: 'Course déjà supprimée' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const ancienStatut = course.statut;

    // ── 3. ANNULATION ──────────────────────────────────────────────────────
    if (action === 'cancel') {
      console.log(`[ADMIN_CANCEL_START] course=${course_id} | statut=${ancienStatut} | admin=${user.email} | livreur=${course.livreur_email || 'aucun'} | raison=${raison.trim()}`);

      const updates = {
        statut: 'annulee',
        annulee_par_admin: true,
        admin_cancel_reason: raison.trim(),
        admin_cancel_by: user.email,
        admin_cancel_at: now,
        livreur_email: null,
        livreur_name: null,
        telephone_livreur: null,
      };

      // Libérer le livreur si assigné — TOUS les statuts avec un livreur actif
      // Couvre : assignee_attente, acceptee, en_cours, driver_en_route_pickup, arrived_pickup, arrived_dropoff
      // + alias alternatifs : pickup, livraison, pending, assigned
      const STATUTS_AVEC_LIVREUR = [
        'assignee_attente', 'acceptee', 'en_cours',
        'driver_en_route_pickup', 'arrived_pickup', 'arrived_dropoff',
        'pickup', 'livraison', 'pending', 'assigned',
      ];
      const livreurAssigne = STATUTS_AVEC_LIVREUR.includes(ancienStatut) || !!course.livreur_email;
      if (course.livreur_email && livreurAssigne) {
        const livreurs = await base44.asServiceRole.entities.User.filter({ email: course.livreur_email });
        if (livreurs.length > 0) {
          const l = livreurs[0];
          await base44.asServiceRole.entities.User.update(l.id, {
            nombre_courses_actives: Math.max(0, (l.nombre_courses_actives || 1) - 1),
          }).catch(() => {});
          console.log(`[ADMIN_CANCEL_START] livreur libéré: ${course.livreur_email}`);
        }

        // Notifier le livreur
        await base44.asServiceRole.entities.Notification.create({
          destinataire_email: course.livreur_email,
          destinataire_role: 'livreur',
          titre: '🚫 Course annulée par l\'administrateur',
          message: `La course ${course.quartier_depart}→${course.quartier_arrivee} a été annulée par l'admin. Raison : ${raison.trim()}`,
          type: 'warning',
          lue: false,
          course_id: course_id,
        }).catch(() => {});
      }

      // Notifier le client
      if (course.client_email) {
        await base44.asServiceRole.entities.Notification.create({
          destinataire_email: course.client_email,
          destinataire_role: 'client',
          titre: '❌ Votre course a été annulée',
          message: `Votre course ${course.quartier_depart}→${course.quartier_arrivee} a été annulée par l'administration CDL. Raison : ${raison.trim()}`,
          type: 'danger',
          lue: false,
          course_id: course_id,
          target_screen: `/course/${course_id}`,
        }).catch(() => {});
      }

      // Appliquer la mise à jour
      await base44.asServiceRole.entities.Course.update(course_id, updates);

      // Journaliser
      await base44.asServiceRole.entities.AdminActionLog.create({
        admin_email: user.email,
        admin_name: user.full_name || user.email,
        action_type: 'COURSE_CANCELLED',
        entity_type: 'Course',
        entity_id: course_id,
        details: `Annulation admin — Raison: ${raison.trim()} | Statut précédent: ${ancienStatut} | Livreur: ${course.livreur_name || 'aucun'} | Client: ${course.client_name || course.client_email}`,
        metadata_json: JSON.stringify({
          ancien_statut: ancienStatut,
          nouveau_statut: 'annulee',
          raison,
          livreur_email: course.livreur_email || null,
          client_email: course.client_email,
          prix: course.prix,
        }),
      }).catch(() => {});

      console.log(`[ADMIN_CANCEL_SUCCESS] course=${course_id} | ancien_statut=${ancienStatut} | admin=${user.email}`);
      return Response.json({ success: true, action: 'cancel', course_id, nouveau_statut: 'annulee', ancien_statut: ancienStatut });
    }

    // ── 4. FORCE DELETE — bypass toutes les gardes statut ─────────────────
    if (action === 'force_delete') {
      const ancienStatutForce = course.statut;
      console.log(`[FORCE_DELETE_START] course=${course_id} | statut=${ancienStatutForce} | admin=${user.email} | livreur=${course.livreur_email || 'aucun'}`);

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

      // Libérer le livreur
      if (course.livreur_email) {
        try {
          const livs = await base44.asServiceRole.entities.User.filter({ email: course.livreur_email });
          if (livs?.[0]) {
            const allActive = await base44.asServiceRole.entities.Course.filter({ livreur_email: course.livreur_email });
            const ACTIVE = new Set(['assignee_attente','acceptee','driver_en_route_pickup','arrived_pickup','en_cours','arrived_dropoff']);
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
        details: `Force delete — Raison: ${raison.trim()} | Statut avant: ${ancienStatutForce} | Client: ${course.client_email} | Livreur: ${course.livreur_email || 'aucun'}`,
      }).catch(() => {});

      console.log(`[FORCE_DELETE_SUCCESS] course=${course_id} | statut_avant=${ancienStatutForce}`);
      return Response.json({ success: true, action: 'force_delete', course_id, statut_avant: ancienStatutForce });
    }

    // ── 5. SUPPRESSION LOGIQUE ─────────────────────────────────────────────
    if (action === 'delete') {
      await base44.asServiceRole.entities.Course.update(course_id, {
        is_deleted: true,
        deleted_at: now,
        deleted_by_admin: user.email,
        delete_reason: raison.trim(),
      });

      // Journaliser
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