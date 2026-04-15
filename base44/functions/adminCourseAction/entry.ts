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
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Accès refusé — admin requis' }, { status: 403 });
    }

    const { course_id, action, raison } = await req.json();
    if (!course_id || !action || !raison?.trim()) {
      return Response.json({ error: 'Paramètres manquants (course_id, action, raison)' }, { status: 400 });
    }
    if (!['cancel', 'delete'].includes(action)) {
      return Response.json({ error: 'Action invalide — valeurs acceptées : cancel | delete' }, { status: 400 });
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
      const updates = {
        statut: 'annulee',
        annulee_par_admin: true,
        admin_cancel_reason: raison.trim(),
        admin_cancel_by: user.email,
        admin_cancel_at: now,
      };

      // Libérer le livreur si assigné
      if (course.livreur_email) {
        const livreurs = await base44.asServiceRole.entities.User.filter({ email: course.livreur_email });
        if (livreurs.length > 0) {
          const l = livreurs[0];
          await base44.asServiceRole.entities.User.update(l.id, {
            nombre_courses_actives: Math.max(0, (l.nombre_courses_actives || 1) - 1),
          }).catch(() => {});
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

      console.log(`[adminCourseAction] CANCEL — course ${course_id} par ${user.email} — ${raison}`);
      return Response.json({ success: true, action: 'cancel', course_id, nouveau_statut: 'annulee' });
    }

    // ── 4. SUPPRESSION LOGIQUE ─────────────────────────────────────────────
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
    console.error('[adminCourseAction] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});