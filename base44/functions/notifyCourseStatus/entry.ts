import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Déclenché par automation entity sur Course (event: update)
// Envoie les notifications client/livreur selon le changement de statut
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const course = body.data;
    const oldCourse = body.old_data;

    if (!course || !oldCourse) return Response.json({ skipped: true });

    const oldStatut = oldCourse.statut;
    const newStatut = course.statut;

    if (oldStatut === newStatut) return Response.json({ skipped: true, reason: 'no_status_change' });

    const notifs = [];

    // ── NOTIFICATIONS CLIENT ──────────────────────────────────────────────────

    if (course.client_email) {
      const clientNotif = {
        destinataire_email: course.client_email,
        destinataire_role: 'client',
        lue: false,
        course_id: course.id,
      };

      if (newStatut === 'assignee_attente') {
        notifs.push({ ...clientNotif,
          titre: '🔍 Recherche d\'un livreur en cours...',
          message: `Nous recherchons un livreur pour votre course ${course.quartier_depart} → ${course.quartier_arrivee}.`,
          type: 'info',
        });
      } else if (newStatut === 'acceptee') {
        notifs.push({ ...clientNotif,
          titre: '✅ Livreur trouvé !',
          message: `${course.livreur_name || 'Votre livreur'} a accepté votre course et vient récupérer le colis.`,
          type: 'success',
        });
      } else if (newStatut === 'en_cours') {
        notifs.push({ ...clientNotif,
          titre: '🚀 Livreur en route !',
          message: `${course.livreur_name || 'Votre livreur'} est en route vers la destination.`,
          type: 'info',
        });
      } else if (newStatut === 'livree') {
        notifs.push({ ...clientNotif,
          titre: '📦 Course terminée !',
          message: `Votre colis a été livré avec succès. Merci d'utiliser CDL !`,
          type: 'success',
        });
      } else if (newStatut === 'aucun_livreur') {
        notifs.push({ ...clientNotif,
          titre: '😔 Aucun livreur disponible',
          message: 'Aucun livreur n\'est disponible pour le moment. Réessayez plus tard ou augmentez le prix proposé.',
          type: 'warning',
        });
      } else if (newStatut === 'annulee') {
        notifs.push({ ...clientNotif,
          titre: '❌ Course annulée',
          message: `Votre course a été annulée.`,
          type: 'danger',
        });
      }
    }

    // ── NOTIFICATIONS LIVREUR ─────────────────────────────────────────────────

    if (course.livreur_email) {
      const livreurNotif = {
        destinataire_email: course.livreur_email,
        destinataire_role: 'livreur',
        lue: false,
        course_id: course.id,
      };

      if (newStatut === 'annulee' && oldStatut !== 'annulee') {
        notifs.push({ ...livreurNotif,
          titre: '❌ Course annulée',
          message: `La course ${course.quartier_depart} → ${course.quartier_arrivee} a été annulée.`,
          type: 'danger',
        });
      }
    }

    // ── NOTIFICATIONS ADMIN ───────────────────────────────────────────────────

    if (newStatut === 'aucun_livreur') {
      try {
        const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
        for (const admin of admins) {
          notifs.push({
            destinataire_email: admin.email,
            destinataire_role: 'admin',
            titre: '⚠️ Course sans livreur',
            message: `Course ${course.quartier_depart} → ${course.quartier_arrivee} (${course.type_colis}) sans livreur après ${course.nombre_tentatives || 0} tentatives.`,
            type: 'warning',
            lue: false,
            course_id: course.id,
          });
        }
      } catch (_) {}
    }

    if (notifs.length === 0) return Response.json({ skipped: true, reason: 'no_notif_for_status' });

    await Promise.all(notifs.map(n => base44.asServiceRole.entities.Notification.create(n)));
    console.log(`[notifyCourseStatus] ${notifs.length} notifications créées (${oldStatut} → ${newStatut})`);
    return Response.json({ success: true, created: notifs.length });

  } catch (error) {
    console.error('[notifyCourseStatus] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});