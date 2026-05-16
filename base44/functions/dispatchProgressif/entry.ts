/**
 * CDL — dispatchProgressif v4 UNIFIÉ
 *
 * SOURCE UNIQUE : DispatchModeState (suppression de DispatchConfig)
 * VERROU ABSOLU mode=manuel à chaque vague
 *
 * LOGS :
 *   [DISPATCH_MODE_READ]
 *   [AUTO_DISPATCH_BLOCKED_MANUAL_MODE]
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TAG = 'dispatchProgressif';
const L = (msg) => console.log(`[${TAG}] ${new Date().toISOString().slice(11, 19)} | ${msg}`);

// ── Lecture exclusive DispatchModeState ───────────────────────────────────────
async function readDispatchMode(base44) {
  const rows = await base44.asServiceRole.entities.DispatchModeState.list('-updated_date', 1).catch(() => []);
  const doc = rows[0];
  const mode = doc?.mode === 'manuel' ? 'manuel' : 'auto';
  console.log(`[DISPATCH_MODE_READ] source=DispatchModeState | fn=${TAG} | mode=${mode} | id=${doc?.id || 'none'} | ts=${new Date().toISOString()}`);
  return { mode, configId: doc?.id || null };
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  const ts = new Date().toISOString();
  L(`START ts=${ts}`);

  try {
    const body = await req.json().catch(() => ({}));
    const { courseId, courseLatitude, courseLongitude, courseQuartier, coursePrix, clientEmail, clientName } = body;

    if (!courseId) return Response.json({ error: 'courseId requis' }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const admin = await base44.auth.me();
    if (!admin) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // ── VERROU ABSOLU ─────────────────────────────────────────────────────────
    const { mode, configId } = await readDispatchMode(base44);
    if (mode === 'manuel') {
      L(`[AUTO_DISPATCH_BLOCKED_MANUAL_MODE] BLOQUÉ mode=manuel | course=${courseId} | configId=${configId}`);
      return Response.json({ success: false, blocked: true, reason: 'manual_mode_active', fn: TAG, ts });
    }

    L(`mode=auto autorisé | course=${courseId}`);

    // Sélectionner livreurs via selectSmartLivreurs
    let response = await base44.functions.invoke('selectSmartLivreurs', {
      courseId, courseLatitude, courseLongitude, courseQuartier, limit: 15,
    });

    let allLivreurs = response?.livreurs || [];
    L(`livreurs trouvés=${allLivreurs.length}`);

    if (allLivreurs.length === 0) {
      L('[DISPATCH_FAIL] aucun livreur');
      await base44.asServiceRole.entities.Notification.create({
        destinataire_role: 'admin',
        titre: '❌ Aucun livreur disponible',
        message: `Course ${courseId} : ${clientName} — ${coursePrix}F — Aucun livreur en ligne.`,
        type: 'warning',
        target_screen: '/gerer-courses',
        target_entity_id: courseId,
        target_entity_type: 'Course',
      }).catch(() => {});
      return Response.json({ success: false, error: 'Aucun livreur disponible', courseId, fn: TAG, ts });
    }

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

      // Re-vérifier le mode à chaque vague
      const { mode: currentMode } = await readDispatchMode(base44);
      if (currentMode === 'manuel') {
        L(`[AUTO_DISPATCH_BLOCKED_MANUAL_MODE] interrompu pendant dispatch | vague=${tentativeNumber}`);
        return Response.json({ success: false, blocked: true, reason: 'manual_mode_active_mid_dispatch', tentatives: tentativeNumber, fn: TAG });
      }

      const batchLivreurs = allLivreurs.slice(0, batch.count);
      L(`tentative=${tentativeNumber} count=${batchLivreurs.length} timeout=${batch.timeout}ms`);

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
        L(`acceptation=${acceptedLivreur.user_email} tentative=${tentativeNumber}`);
        break;
      }
      L(`tentative=${tentativeNumber} timeout`);
    }

    if (!acceptedLivreur) {
      L('[DISPATCH_FAIL] tous refusés');
      await base44.asServiceRole.entities.Notification.create({
        destinataire_role: 'admin',
        titre: '⚠️ Aucun livreur n\'a accepté',
        message: `Course ${courseId} : ${clientName} — ${coursePrix}F — Assignation manuelle recommandée.`,
        type: 'danger',
        target_screen: '/gerer-courses',
        target_entity_id: courseId,
        target_entity_type: 'Course',
      }).catch(() => {});
      return Response.json({ success: false, error: 'Aucun livreur n\'a accepté', courseId, tentatives: tentativeNumber, fn: TAG, ts });
    }

    await base44.asServiceRole.entities.Course.update(courseId, {
      statut: 'assignee_attente',
      livreur_email: acceptedLivreur.user_email,
      livreur_name: acceptedLivreur.user_name,
      time_dispatch: acceptanceTime,
      mode_assignation: 'auto',
    });

    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: clientEmail,
      titre: '✅ Livreur assigné',
      message: `${acceptedLivreur.user_name} a accepté votre course et arrive bientôt.`,
      type: 'success',
      target_screen: `/course/${courseId}/track`,
      target_entity_id: courseId,
      target_entity_type: 'Course',
    }).catch(() => {});

    await base44.functions.invoke('sendCdlNotification', {
      user_email: clientEmail,
      title: '✅ Livreur en route',
      body: `${acceptedLivreur.user_name} a accepté et arrive.`,
      data: { type: 'course_accepted', entity_id: courseId, entity_type: 'Course', notif_route: `/course/${courseId}/track` },
    }).catch(() => {});

    L(`success | time_total=${Date.now() - t0}ms`);
    return Response.json({ success: true, courseId, livreur: acceptedLivreur, acceptanceTime, totalTime: Date.now() - t0, tentatives: tentativeNumber, fn: TAG, ts });

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
    await base44.functions.invoke('sendCdlNotification', {
      user_email: livreur.user_email,
      title: '🚀 Nouvelle course',
      body: `${courseInfo.clientName} en attente — ${courseInfo.coursePrix} F`,
      urgence: 'urgent',
      data: { type: 'course_assigned', entity_id: courseId, entity_type: 'Course', notif_route: `/course-livreur/${courseId}` },
    }).catch(() => {});
  } catch (e) {
    console.warn(`[${TAG}] notif error: ${e.message}`);
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
      if (!course?.length) { await new Promise(r => setTimeout(r, pollInterval)); continue; }
      const c = course[0];
      if (c.statut === 'acceptee' && emails.includes(c.livreur_email)) {
        return { livreur: livreurs.find(l => l.user_email === c.livreur_email), time: Date.now() - t0 };
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, pollInterval));
  }
  return null;
}