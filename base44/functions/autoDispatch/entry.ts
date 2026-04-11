/**
 * CDL — Moteur de dispatch simplifié pour la phase de lancement
 *
 * CRITÈRES LIVREUR ÉLIGIBLE (simples) :
 *   1. driver_online = true
 *   2. current_role = "livreur"
 *   3. nombre_courses_actives < 2  (pas occupé)
 *   4. pas déjà contacté pour cette course
 *
 * Pas de GPS obligatoire, pas de score complexe, pas de rayon bloquant.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const courseId = body.course_id || body.event?.entity_id;
    const forceDispatch = body.force === true;
    const excludeEmails = body.exclude_emails || [];

    if (!courseId) {
      return Response.json({ error: 'course_id manquant' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // ── 1. Mode dispatch ──────────────────────────────────────────────────
    const configs = await base44.asServiceRole.entities.DispatchConfig.list('-updated_date', 1);
    const mode = configs[0]?.mode || 'auto';

    console.log(`[Dispatch] MODE: ${mode.toUpperCase()}${forceDispatch ? ' (FORCÉ)' : ''}`);

    if (mode === 'manuel' && !forceDispatch) {
      console.log('[Dispatch] BLOQUÉ — mode manuel, cours en attente_dispatch');
      return Response.json({ success: false, blocked: true, reason: 'mode_manuel' });
    }

    // ── 2. Récupérer la course ─────────────────────────────────────────────
    const courses = await base44.asServiceRole.entities.Course.filter({ id: courseId });
    if (!courses || courses.length === 0) {
      return Response.json({ error: 'Course introuvable' }, { status: 404 });
    }
    const course = courses[0];

    const ELIGIBLE_STATUTS = ['en_attente', 'en_attente_dispatch', 'aucun_livreur', 'echec_dispatch'];
    if (!ELIGIBLE_STATUTS.includes(course.statut)) {
      console.log(`[Dispatch] Course non éligible — statut: ${course.statut}`);
      return Response.json({ success: false, message: `Statut non éligible: ${course.statut}` });
    }

    // ── 3. Historique des livreurs déjà contactés ─────────────────────────
    let historique = [];
    try {
      if (course.historique_assignation) historique = JSON.parse(course.historique_assignation);
    } catch (_) {}

    const dejaContactes = new Set([
      ...excludeEmails,
      ...historique
        .filter(h => ['refuse', 'no_response'].includes(h.statut))
        .map(h => h.livreur_email),
    ]);

    // ── 4. Récupérer les livreurs éligibles (critères simples) ────────────
    const allUsers = await base44.asServiceRole.entities.User.list('-updated_date', 500);

    const eligibles = allUsers.filter(d =>
      d.driver_online === true &&
      d.current_role === 'livreur' &&
      (d.nombre_courses_actives || 0) < 2 &&
      !d.livreur_bloque &&
      !dejaContactes.has(d.email)
    );

    console.log(`[Dispatch] Total users: ${allUsers.length}`);
    console.log(`[Dispatch] driver_online=true: ${allUsers.filter(d => d.driver_online).length}`);
    console.log(`[Dispatch] current_role=livreur: ${allUsers.filter(d => d.driver_online && d.current_role === 'livreur').length}`);
    console.log(`[Dispatch] Éligibles finaux: ${eligibles.length}`);
    if (eligibles.length > 0) {
      console.log(`[Dispatch] Éligibles: ${eligibles.map(d => d.email).join(', ')}`);
    }

    const now = new Date().toISOString();

    // ── 5. Aucun livreur disponible ────────────────────────────────────────
    if (eligibles.length === 0) {
      const totalOnline = allUsers.filter(d => d.driver_online).length;
      const totalBonRole = allUsers.filter(d => d.driver_online && d.current_role === 'livreur').length;

      let failReason = 'Aucun livreur disponible pour le moment';
      if (totalOnline === 0) failReason = 'Aucun livreur connecté';
      else if (totalBonRole === 0) failReason = `${totalOnline} livreur(s) connecté(s) mais aucun avec le profil livreur actif`;
      else failReason = `${totalBonRole} livreur(s) connecté(s) mais tous occupés ou déjà contactés`;

      console.log(`[Dispatch] ❌ ${failReason}`);

      historique.push({ heure: now, statut: 'aucun_livreur', raison: failReason });

      await base44.asServiceRole.entities.Course.update(courseId, {
        statut: 'aucun_livreur',
        nombre_tentatives: (course.nombre_tentatives || 0) + 1,
        historique_assignation: JSON.stringify(historique),
        dispatch_fail_reason: failReason,
      });

      // Notifier client
      if (course.client_email) {
        await base44.asServiceRole.entities.Notification.create({
          destinataire_email: course.client_email,
          destinataire_role: 'client',
          titre: 'Recherche de livreur',
          message: failReason + ' — Nous vous préviendrons dès qu\'un livreur est disponible.',
          type: 'warning',
          lue: false,
          course_id: courseId,
          target_screen: `/course/${courseId}`,
        }).catch(() => {});
      }

      // Notifier admins
      const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
      for (const admin of admins.slice(0, 3)) {
        await base44.asServiceRole.entities.Notification.create({
          destinataire_email: admin.email,
          destinataire_role: 'admin',
          titre: '🚨 Course sans livreur',
          message: `${course.quartier_depart}→${course.quartier_arrivee} (${course.prix} FCFA) — ${failReason}`,
          type: 'danger',
          lue: false,
          course_id: courseId,
          target_screen: `/dispatch-monitor`,
        }).catch(() => {});
      }

      return Response.json({ success: false, reason: failReason, online: totalOnline, bon_role: totalBonRole });
    }

    // ── 6. Choisir le premier livreur éligible (ordre simple) ─────────────
    // Si GPS dispo sur la course et le livreur, on préfère le plus proche
    // Sinon ordre d'arrivée (premier connectedé = premier servi)
    let choisi = eligibles[0];

    if (course.latitude_depart && course.longitude_depart) {
      const avecGPS = eligibles.filter(d => d.gps_latitude && d.gps_longitude);
      if (avecGPS.length > 0) {
        const R = 6371;
        const lat1 = parseFloat(course.latitude_depart);
        const lng1 = parseFloat(course.longitude_depart);
        avecGPS.sort((a, b) => {
          const da = Math.sqrt((a.gps_latitude - lat1) ** 2 + (a.gps_longitude - lng1) ** 2);
          const db = Math.sqrt((b.gps_latitude - lat1) ** 2 + (b.gps_longitude - lng1) ** 2);
          return da - db;
        });
        choisi = avecGPS[0]; // préférer le plus proche si GPS dispo
        console.log(`[Dispatch] GPS disponible — livreur le plus proche: ${choisi.email}`);
      } else {
        console.log(`[Dispatch] Pas de GPS livreur — premier de la liste: ${choisi.email}`);
      }
    }

    // ── 7. Proposer au livreur choisi ────────────────────────────────────
    const expireAt = new Date(Date.now() + 60000).toISOString(); // 60 secondes
    historique.push({
      livreur_email: choisi.email,
      livreur_nom: choisi.full_name,
      heure: now,
      heure_expiration: expireAt,
      statut: 'proposee',
    });

    await base44.asServiceRole.entities.Course.update(courseId, {
      statut: 'assignee_attente',
      livreur_email: choisi.email,
      livreur_name: choisi.full_name,
      telephone_livreur: choisi.telephone || '',
      heure_assignation: now,
      mode_assignation: forceDispatch ? 'force' : 'auto',
      nombre_tentatives: (course.nombre_tentatives || 0) + 1,
      historique_assignation: JSON.stringify(historique),
      dispatch_fail_reason: null,
    });

    // Mettre à jour le compteur du livreur
    await base44.asServiceRole.entities.User.update(choisi.id, {
      nombre_courses_actives: (choisi.nombre_courses_actives || 0) + 1,
      courses_proposees: (choisi.courses_proposees || 0) + 1,
      derniere_proposition_at: now,
    }).catch(() => {});

    // Notifier le livreur
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: choisi.email,
      destinataire_role: 'livreur',
      titre: '🛵 Nouvelle course !',
      message: `${course.quartier_depart} → ${course.quartier_arrivee}. ${course.type_colis || 'Colis'}. ${course.prix} FCFA. Répondez en 60 secondes.`,
      type: 'success',
      lue: false,
      course_id: courseId,
      target_screen: `/course-livreur/${courseId}`,
      target_entity_id: courseId,
      target_entity_type: 'course',
    }).catch(() => {});

    // Notifier client
    if (course.client_email) {
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: course.client_email,
        destinataire_role: 'client',
        titre: '🔍 Livreur trouvé !',
        message: `Un livreur a été contacté pour votre course. En attente de sa confirmation.`,
        type: 'info',
        lue: false,
        course_id: courseId,
        target_screen: `/course/${courseId}`,
      }).catch(() => {});
    }

    // WA livreur (non bloquant)
    if (choisi.telephone) {
      base44.asServiceRole.functions.invoke('sendWhatsAppAlert', {
        eventType: 'driver_course_assigned',
        recipientRole: 'livreur',
        recipientName: choisi.full_name,
        recipientPhone: choisi.telephone,
        messageText: `🚨 Nouvelle course CDL ! ${course.quartier_depart}→${course.quartier_arrivee} — ${course.prix} FCFA. Ouvrez l'app pour accepter (60s).`,
        entityId: courseId,
        entityType: 'course',
        priority: 'urgent',
      }).catch(() => {});
    }

    console.log(`[Dispatch] ✅ Course ${courseId} → ${choisi.full_name} (${choisi.email})`);

    return Response.json({
      success: true,
      livreur: { email: choisi.email, nom: choisi.full_name },
      eligibles_count: eligibles.length,
      mode,
    });

  } catch (error) {
    console.error('[Dispatch] Erreur:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});