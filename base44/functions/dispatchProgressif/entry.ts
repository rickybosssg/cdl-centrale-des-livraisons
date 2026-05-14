/**
 * dispatchProgressif — VERROU CANONIQUE V2 ABSOLU
 *
 * Si mode GLOBAL = "manuel" → BLOQUÉ TOTALEMENT, retour immédiat.
 * Aucun fallback vers auto. Aucune écriture de DispatchConfig.
 *
 * LOGS :
 *   [DISPATCH_CANONICAL_READ]
 *   [AUTO_DISPATCH_BLOCKED_MANUAL_MODE]
 *   [MANUAL_MODE_PROTECTED]
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CANONICAL_KEY = 'GLOBAL';
const L = (msg) => console.log(`[DISPATCH] ${new Date().toISOString().slice(11, 19)} | ${msg}`);

async function getCanonicalMode(base44) {
  const allConfigs = await base44.asServiceRole.entities.DispatchConfig.list('-updated_date', 50).catch(() => []);
  const canonical = allConfigs.find(c => c.mode_key === CANONICAL_KEY);
  const mode = canonical?.mode === 'manuel' ? 'manuel' : canonical?.mode === 'auto' ? 'auto' : null;
  console.log(`[DISPATCH_CANONICAL_READ] dispatchProgressif | CANONICAL=${!!canonical} | mode=${mode} | id=${canonical?.id || 'none'} | totalDocs=${allConfigs.length}`);
  return { mode, configId: canonical?.id || null };
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  L('START');

  try {
    const body = await req.json().catch(() => ({}));
    const {
      courseId,
      courseLatitude,
      courseLongitude,
      courseQuartier,
      coursePrix,
      clientEmail,
      clientName,
    } = body;

    if (!courseId) return Response.json({ error: 'courseId requis' }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const admin = await base44.auth.me();
    if (!admin) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    L(`course_id=${courseId}`);

    // ── VERROU CANONIQUE ABSOLU — PRIORITÉ MAXIMALE ───────────────────────────
    const { mode, configId } = await getCanonicalMode(base44);

    if (mode === null) {
      console.error(`[AUTO_DISPATCH_BLOCKED_MANUAL_MODE] dispatchProgressif BLOQUÉ — aucun doc GLOBAL | course=${courseId} | function=dispatchProgressif`);
      return Response.json({ success: false, blocked: true, reason: 'no_canonical_config' });
    }

    if (mode === 'manuel') {
      console.log(`[AUTO_DISPATCH_BLOCKED_MANUAL_MODE] BLOQUÉ — mode=manuel | course=${courseId} | configId=${configId} | function=dispatchProgressif`);
      console.log(`[MANUAL_MODE_PROTECTED] dispatchProgressif bloqué par verrou manuel | course=${courseId}`);
      return Response.json({ success: false, blocked: true, reason: 'manual_mode_active' });
    }

    L(`[DISPATCH_CANONICAL_READ] mode=auto confirmé | configId=${configId} — dispatch autorisé`);

    // ── ÉTAPE 1 : Sélectionner livreurs ──────────────────────────────────────
    let response = await base44.functions.invoke('selectSmartLivreurs', {
      courseId,
      courseLatitude,
      courseLongitude,
      courseQuartier,
      limit: 15,
    });

    let allLivreurs = response?.livreurs || [];
    L(`livreurs trouvés=${allLivreurs.length}`);

    if (allLivreurs.length === 0) {
      L('échec=aucun_livreur');
      try {
        await base44.asServiceRole.entities.Notification.create({
          destinataire_role: 'admin',
          titre: '❌ Aucun livreur disponible',
          message: `Course ${courseId} : ${clientName} — ${coursePrix}F — Aucun livreur en ligne.`,
          type: 'warning',
          target_screen: '/gerer-courses',
          target_entity_id: courseId,
          target_entity_type: 'Course',
        });
      } catch (_) {}
      return Response.json({ success: false, error: 'Aucun livreur disponible', courseId });
    }

    // ── ÉTAPE 2-6 : Progressif (top 3 → 5 → 10 → tous) ───────────────────────
    const batches = [
      { count: 3, timeout: 60000 },
      { count: 5, timeout: 90000 },
      { count: 10, timeout: 120000 },
      { count: allLivreurs.length, timeout: 60000 },
    ];

    let acceptedLivreur = null;
    let acceptanceTime = null;
    let tentativeNumber = 0;

    for (const batch of batches) {
      if (acceptedLivreur) break;
      tentativeNumber++;

      // RE-VÉRIFIER le mode à chaque vague (le mode peut changer pendant les 60s d'attente)
      const { mode: currentMode } = await getCanonicalMode(base44);
      if (currentMode !== 'auto') {
        console.log(`[AUTO_DISPATCH_BLOCKED_MANUAL_MODE] dispatchProgressif interrompu en cours — mode=${currentMode} | course=${courseId} | vague=${tentativeNumber}`);
        console.log(`[MANUAL_MODE_PROTECTED] dispatch interrompu mid-flight | course=${courseId}`);
        return Response.json({ success: false, blocked: true, reason: 'manual_mode_active_mid_dispatch', tentatives: tentativeNumber });
      }

      const batchLivreurs = allLivreurs.slice(0, batch.count);
      L(`tentative=${tentativeNumber} count=${batchLivreurs.length} timeout=${batch.timeout}ms`);
      L(`envoyés=${batchLivreurs.map(l => l.user_email.split('@')[0]).join(',')}`);

      const notifPromises = batchLivreurs.map(livreur =>
        sendDispatchNotif(base44, courseId, livreur, { coursePrix, clientName, courseQuartier })
      );
      await Promise.allSettled(notifPromises);

      const acceptancePromise = waitForAcceptance(base44, courseId, batchLivreurs);
      const result = await Promise.race([
        acceptancePromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), batch.timeout)),
      ]).catch(() => null);

      if (result) {
        acceptedLivreur = result.livreur;
        acceptanceTime = result.time;
        L(`acceptation=${acceptedLivreur.user_email} tentative=${tentativeNumber} time=${acceptanceTime}ms`);
        break;
      }

      L(`tentative=${tentativeNumber} échec timeout`);
    }

    if (!acceptedLivreur) {
      L('échec=tous_refus');
      try {
        await base44.asServiceRole.entities.Notification.create({
          destinataire_role: 'admin',
          titre: '⚠️ Aucun livreur n\'a accepté',
          message: `Course ${courseId} : ${clientName} — ${coursePrix}F — Assignation manuelle recommandée.`,
          type: 'danger',
          target_screen: '/gerer-courses',
          target_entity_id: courseId,
          target_entity_type: 'Course',
        });
      } catch (_) {}
      return Response.json({ success: false, error: 'Aucun livreur n\'a accepté', courseId, tentatives: tentativeNumber });
    }

    // ── ÉTAPE FINALE : Assigner et notifier ──────────────────────────────────
    try {
      await base44.asServiceRole.entities.Course.update(courseId, {
        statut: 'assignee_attente',
        livreur_email: acceptedLivreur.user_email,
        livreur_name: acceptedLivreur.user_name,
        time_dispatch: acceptanceTime,
      });

      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: clientEmail,
        titre: '✅ Livreur assigné',
        message: `${acceptedLivreur.user_name} a accepté votre course et arrive bientôt.`,
        type: 'success',
        target_screen: `/course/${courseId}/track`,
        target_entity_id: courseId,
        target_entity_type: 'Course',
      });

      try {
        await base44.functions.invoke('sendCdlNotification', {
          user_email: clientEmail,
          title: '✅ Livreur en route',
          body: `${acceptedLivreur.user_name} a accepté et arrive.`,
          data: {
            type: 'course_accepted',
            entity_id: courseId,
            entity_type: 'Course',
            notif_route: `/course/${courseId}/track`,
          },
        });
      } catch (_) {}
    } catch (e) {
      L(`assignation error=${e.message}`);
      throw e;
    }

    L(`success=true time_total=${Date.now() - t0}ms`);
    return Response.json({
      success: true,
      courseId,
      livreur: acceptedLivreur,
      acceptanceTime,
      totalTime: Date.now() - t0,
      tentatives: tentativeNumber,
    });
  } catch (err) {
    L(`error=${err.message}`);
    return Response.json({ error: err.message }, { status: 500 });
  }
});

async function sendDispatchNotif(base44, courseId, livreur, courseInfo) {
  try {
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: livreur.user_email,
      titre: '🚀 Nouvelle course disponible',
      message: `${courseInfo.clientName} en attente — ${courseInfo.coursePrix} F — Accepte rapidement !`,
      type: 'warning',
      lue: false,
      target_screen: `/course-livreur/${courseId}`,
      target_entity_id: courseId,
      target_entity_type: 'Course',
    });

    try {
      await base44.functions.invoke('sendCdlNotification', {
        user_email: livreur.user_email,
        title: '🚀 Nouvelle course',
        body: `${courseInfo.clientName} en attente — ${courseInfo.coursePrix} F`,
        urgence: 'urgent',
        data: {
          type: 'course_assigned',
          entity_id: courseId,
          entity_type: 'Course',
          notif_route: `/course-livreur/${courseId}`,
        },
      });
    } catch (_) {}
  } catch (e) {
    console.warn('[DISPATCH] notif error:', e.message);
  }
}

async function waitForAcceptance(base44, courseId, livreurs) {
  const emails = livreurs.map(l => l.user_email);
  const t0 = Date.now();
  const pollInterval = 2000;
  const maxWait = 150000;

  while (Date.now() - t0 < maxWait) {
    try {
      const course = await base44.asServiceRole.entities.Course.filter({ id: courseId });
      if (!course || course.length === 0) {
        await new Promise(r => setTimeout(r, pollInterval));
        continue;
      }

      const c = course[0];
      if (c.statut === 'acceptee' && emails.includes(c.livreur_email)) {
        return { livreur: livreurs.find(l => l.user_email === c.livreur_email), time: Date.now() - t0 };
      }
    } catch (_) {}

    await new Promise(r => setTimeout(r, pollInterval));
  }

  return null;
}