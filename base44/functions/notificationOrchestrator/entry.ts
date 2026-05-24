/**
 * CDL — notificationOrchestrator
 *
 * SOURCE UNIQUE DE VÉRITÉ : toutes les notifications liées aux courses
 *
 * PHILOSOPHIE :
 *   Un seul endroit décide QUI reçoit QUOI et QUAND.
 *   Tous les autres modules (courseStateMachine, bedouEngine, CourseLivreur frontend)
 *   ne doivent PAS envoyer leurs propres notifications course — ils appellent ce module.
 *
 * ACTIONS (event) :
 *   course_assigned       — course assignée à un livreur (statut: assignee_attente)
 *   course_accepted       — livreur a accepté (statut: acceptee)
 *   course_refused        — livreur a refusé
 *   course_en_route       — en route vers pickup (statut: driver_en_route_pickup)
 *   course_arrived_pickup — arrivé au départ (statut: arrived_pickup)
 *   course_pickup         — colis récupéré (statut: en_cours)
 *   course_arrived_dropoff— arrivé destination (statut: arrived_dropoff)
 *   course_delivered      — livraison confirmée (statut: livree) ← LE PLUS IMPORTANT
 *   course_cancelled      — annulation
 *   course_no_driver      — aucun livreur disponible
 *   course_issue          — problème signalé
 *
 * DÉDUPLICATION :
 *   Chaque notification est créée avec un notification_key unique.
 *   Si la clé existe déjà (< 60s), la notification est skippée.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ADMIN_EMAIL = 'weezyh2@gmail.com';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });

  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const { event, course_id, course, extra = {} } = body;

  if (!event || !course_id) {
    return Response.json({ error: 'event et course_id requis' }, { status: 400 });
  }

  const ts = new Date().toISOString();
  const push = (payload) => base44.asServiceRole.functions.invoke('sendCdlNotification', payload).catch(() => {});
  const notif = (payload) => {
    const key = payload.notification_key;
    return base44.asServiceRole.entities.Notification.create(payload).catch(() => {});
  };
  const whatsapp = (eventType, role, name, phone, entityId) => {
    if (!phone) return;
    base44.asServiceRole.functions.invoke('sendWhatsAppAlert', {
      eventType, recipientRole: role, recipientName: name,
      recipientPhone: phone, entityId, entityType: 'course', priority: 'normal',
      messageText: `🚚 CDL - Centrale des Livraisons\n\nBonjour,\nUne nouvelle activité nécessite votre attention sur votre compte CDL.\n\n📲 Veuillez ouvrir votre application pour voir les détails.\n\nMerci,\nL'équipe CDL`,
    }).catch(() => {});
  };

  console.log(`[NOTIF_ORCH] event=${event} | course=${course_id} | ts=${ts}`);

  // ── course_assigned ──────────────────────────────────────────────────────────
  if (event === 'course_assigned') {
    const { livreur_email, livreur_name, quartier_depart, quartier_arrivee, prix } = course || extra;
    if (!livreur_email) return Response.json({ ok: true, skipped: 'no_livreur' });
    await push({
      user_email: livreur_email,
      title: '📦 Nouvelle course',
      body: `${quartier_depart} → ${quartier_arrivee} (${prix || 0} F) — Répondez en 60s`,
      data: { type: 'dispatch_offer', course_id, notif_route: `/course-livreur/${course_id}` },
    });
    await notif({
      destinataire_email: livreur_email, destinataire_role: 'livreur',
      titre: '🛵 Nouvelle course !',
      message: `${quartier_depart} → ${quartier_arrivee} · ${prix || 0} FCFA`,
      type: 'success', lue: false, course_id,
      target_screen: `/course-livreur/${course_id}`,
      notification_key: `${livreur_email}__assigned__${course_id}__${Date.now()}`,
    });
    return Response.json({ ok: true, event });
  }

  // ── course_accepted ──────────────────────────────────────────────────────────
  if (event === 'course_accepted') {
    const { client_email, livreur_name, quartier_depart, quartier_arrivee } = course || extra;
    if (!client_email) return Response.json({ ok: true, skipped: 'no_client' });
    await push({
      user_email: client_email,
      title: '✅ Livreur en chemin !',
      body: `${livreur_name || 'Votre livreur'} a accepté votre course.`,
      data: { type: 'course_accepted', course_id, notif_route: `/course/${course_id}/track` },
    });
    await notif({
      destinataire_email: client_email, destinataire_role: 'client',
      titre: '🛵 Livreur en route !',
      message: `${livreur_name || 'Un livreur'} a accepté votre course ${quartier_depart}→${quartier_arrivee}.`,
      type: 'success', lue: false, course_id,
      target_screen: `/course/${course_id}/track`,
      notification_key: `${client_email}__accepted__${course_id}`,
    });
    return Response.json({ ok: true, event });
  }

  // ── course_refused ───────────────────────────────────────────────────────────
  if (event === 'course_refused') {
    // Pas de notif client sur refus — le redispatch s'en charge
    return Response.json({ ok: true, event, note: 'no_client_notif_on_refuse' });
  }

  // ── course_en_route ──────────────────────────────────────────────────────────
  if (event === 'course_en_route') {
    const { client_email, livreur_name } = course || extra;
    if (!client_email) return Response.json({ ok: true, skipped: 'no_client' });
    await push({
      user_email: client_email,
      title: '🛵 Votre livreur est en route !',
      body: `${livreur_name || 'Votre livreur'} se dirige vers le point de récupération.`,
      data: { type: 'course_en_route', course_id, notif_route: `/course/${course_id}/track` },
    });
    return Response.json({ ok: true, event });
  }

  // ── course_arrived_pickup ────────────────────────────────────────────────────
  if (event === 'course_arrived_pickup') {
    const { client_email, livreur_name } = course || extra;
    if (!client_email) return Response.json({ ok: true, skipped: 'no_client' });
    await push({
      user_email: client_email,
      title: '📍 Votre livreur est arrivé !',
      body: `${livreur_name || 'Votre livreur'} est au point de récupération. Préparez votre colis.`,
      data: { type: 'livreur_arrived_pickup', course_id, notif_route: `/course/${course_id}/track` },
    });
    return Response.json({ ok: true, event });
  }

  // ── course_pickup ────────────────────────────────────────────────────────────
  if (event === 'course_pickup') {
    const { client_email, quartier_arrivee } = course || extra;
    if (!client_email) return Response.json({ ok: true, skipped: 'no_client' });
    await push({
      user_email: client_email,
      title: '📦 Colis récupéré — en route !',
      body: `Votre colis est en livraison vers ${quartier_arrivee}.`,
      data: { type: 'course_pickup', course_id, notif_route: `/course/${course_id}/track` },
    });
    return Response.json({ ok: true, event });
  }

  // ── course_arrived_dropoff ───────────────────────────────────────────────────
  if (event === 'course_arrived_dropoff') {
    const { client_email, livreur_name } = course || extra;
    if (!client_email) return Response.json({ ok: true, skipped: 'no_client' });
    await push({
      user_email: client_email,
      title: '⚡ Livreur à destination !',
      body: `${livreur_name || 'Votre livreur'} est arrivé à destination.`,
      data: { type: 'livreur_arrived_dropoff', course_id, notif_route: `/course/${course_id}/track` },
    });
    return Response.json({ ok: true, event });
  }

  // ── course_delivered ─────────────────────────────────────────────────────────
  // SOURCE UNIQUE pour toutes les notifs post-livraison
  if (event === 'course_delivered') {
    const {
      client_email, client_name, livreur_email, livreur_name,
      quartier_depart, quartier_arrivee, gain_livreur, prix,
      telephone_expediteur, telephone_livreur,
    } = course || extra;

    const tasks = [];

    // Client : push + in-app
    if (client_email) {
      tasks.push(push({
        user_email: client_email,
        title: '🎉 Colis livré !',
        body: `Votre colis a été livré par ${livreur_name || 'votre livreur'}. Notez-le !`,
        data: { type: 'course_delivered', course_id, notif_route: `/course/${course_id}/track` },
      }));
      tasks.push(notif({
        destinataire_email: client_email, destinataire_role: 'client',
        titre: '✅ Colis livré !',
        message: `Votre colis a été livré par ${livreur_name}. ${(prix || 0).toLocaleString()} FCFA débités.`,
        type: 'success', lue: false, course_id,
        target_screen: `/course/${course_id}/track`,
        notification_key: `${client_email}__livree__${course_id}`,
      }));
      tasks.push(Promise.resolve(whatsapp('course_completed', 'client', client_name || '', telephone_expediteur, course_id)));
    }

    // Livreur : push + in-app
    if (livreur_email) {
      tasks.push(push({
        user_email: livreur_email,
        title: '💰 Livraison confirmée !',
        body: `${quartier_arrivee} — Gain : +${(gain_livreur || 0).toLocaleString()} F crédités sur votre Bedou.`,
        data: {
          type: 'course_delivered_driver',
          course_id,
          entity_id: course_id,
          entity_type: 'Course',
          notif_route: '/mes-livraisons',
          bedou_refresh: 'true',
          amount: String(gain_livreur || 0),
        },
      }));
      tasks.push(notif({
        destinataire_email: livreur_email, destinataire_role: 'livreur',
        titre: '💰 Gain crédité !',
        message: `+${(gain_livreur || 0).toLocaleString()} FCFA sur votre Bedou — ${quartier_depart}→${quartier_arrivee}.`,
        type: 'success', lue: false, course_id,
        target_screen: '/mes-gains',
        notification_key: `${livreur_email}__livree__gain__${course_id}`,
      }));
      tasks.push(Promise.resolve(whatsapp('course_completed_driver', 'driver', livreur_name || '', telephone_livreur, course_id)));
    }

    // Admin : push uniquement
    tasks.push(push({
      role: 'admin',
      title: '📦 Course livrée',
      body: `${quartier_depart}→${quartier_arrivee} — ${livreur_name} — ${(prix || 0).toLocaleString()} FCFA`,
      data: { type: 'course_delivered_admin', course_id, notif_route: '/gerer-courses' },
    }));
    tasks.push(notif({
      destinataire_email: ADMIN_EMAIL, destinataire_role: 'admin',
      titre: '📦 Course livrée',
      message: `${quartier_depart}→${quartier_arrivee} livrée par ${livreur_name}. ${(prix || 0).toLocaleString()} FCFA réglés.`,
      type: 'success', lue: false, course_id,
      target_screen: '/gerer-courses',
      notification_key: `${ADMIN_EMAIL}__livree__${course_id}__admin`,
    }));

    await Promise.allSettled(tasks);
    console.log(`[NOTIF_ORCH] course_delivered OK | course=${course_id} | client=${client_email} | livreur=${livreur_email}`);
    return Response.json({ ok: true, event, tasks_count: tasks.length });
  }

  // ── course_cancelled ─────────────────────────────────────────────────────────
  if (event === 'course_cancelled') {
    const { client_email, livreur_email, quartier_depart, quartier_arrivee, frais_annulation, annulee_par } = course || extra;
    const tasks = [];
    if (client_email) {
      tasks.push(notif({
        destinataire_email: client_email, destinataire_role: 'client',
        titre: '❌ Course annulée',
        message: frais_annulation > 0
          ? `Course annulée. Frais : ${frais_annulation.toLocaleString()} F.`
          : `Votre course ${quartier_depart}→${quartier_arrivee} a été annulée.`,
        type: frais_annulation > 0 ? 'warning' : 'info', lue: false, course_id,
        notification_key: `${client_email}__annulee__${course_id}`,
      }));
    }
    if (livreur_email) {
      tasks.push(notif({
        destinataire_email: livreur_email, destinataire_role: 'livreur',
        titre: '❌ Course annulée',
        message: `La course ${quartier_depart}→${quartier_arrivee} a été annulée.`,
        type: 'warning', lue: false, course_id,
        notification_key: `${livreur_email}__annulee__${course_id}`,
      }));
    }
    await Promise.allSettled(tasks);
    return Response.json({ ok: true, event });
  }

  // ── course_no_driver ─────────────────────────────────────────────────────────
  if (event === 'course_no_driver') {
    const { client_email, quartier_depart, quartier_arrivee, reason } = course || extra;
    const tasks = [];
    tasks.push(push({
      role: 'admin',
      title: '🚨 Aucun livreur disponible',
      body: `${quartier_depart}→${quartier_arrivee} — ${reason || 'Aucun livreur disponible'}`,
      data: { type: 'no_driver', course_id, notif_route: '/dispatch-monitor' },
    }));
    if (client_email) {
      tasks.push(notif({
        destinataire_email: client_email, destinataire_role: 'client',
        titre: 'Recherche livreur en cours',
        message: (reason || 'Aucun livreur disponible') + ' — Réessai automatique sous peu.',
        type: 'warning', lue: false, course_id,
        notification_key: `${client_email}__no_driver__${course_id}`,
      }));
    }
    await Promise.allSettled(tasks);
    return Response.json({ ok: true, event });
  }

  // ── course_issue ─────────────────────────────────────────────────────────────
  if (event === 'course_issue') {
    const { livreur_name, description, quartier_depart, quartier_arrivee } = extra;
    await push({
      role: 'admin',
      title: '⚠️ Problème signalé par livreur',
      body: `${livreur_name} : ${description} — Course ${quartier_depart}→${quartier_arrivee}`,
      data: { type: 'issue_reported', course_id, notif_route: '/gestion-signalements' },
    });
    return Response.json({ ok: true, event });
  }

  return Response.json({ ok: true, event, note: 'event_not_handled' });
});
