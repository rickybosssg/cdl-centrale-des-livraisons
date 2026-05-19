/**
 * CDL — courseStateMachine v1 : Machine d'état centrale unique
 *
 * PHILOSOPHIE :
 *   UNE seule fonction backend pour TOUTES les transitions d'état d'une course.
 *   Zéro logique de transition dans le frontend ou dans des fonctions séparées.
 *   Le frontend appelle uniquement courseStateMachine({ course_id, action, ... }).
 *
 * ACTIONS SUPPORTÉES :
 *   ACCEPT          — livreur accepte une course (assignee_attente → acceptee)
 *   REFUSE          — livreur refuse une course  (assignee_attente → en_attente)
 *   EN_ROUTE        — livreur part vers pickup   (acceptee → driver_en_route_pickup)
 *   ARRIVED_PICKUP  — livreur arrive au départ   (driver_en_route_pickup → arrived_pickup)
 *   PICKUP          — colis récupéré             (arrived_pickup → en_cours)
 *   ARRIVED_DROPOFF — livreur arrive à dest.     (en_cours → arrived_dropoff)
 *   DELIVER         — livraison confirmée        (en_cours|arrived_dropoff → livree + settlement)
 *
 * MODULE UNIQUE D'ÉLIGIBILITÉ : isDriverEligible() — source unique partagée
 *
 * RÈGLES ABSOLUES :
 *   - Seul le livreur assigné ou un admin peut effectuer une transition
 *   - Transitions invalides retournent 400 avec l'état actuel
 *   - Mode manuel = aucun redispatch automatique post-REFUSE
 *   - DELIVER est idempotent (settlement_status=completed → skip bedouEngine)
 *   - Tous les side-effects (notifs, stats) sont fire-and-forget après la transition atomique
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─── Machine d'état : transitions autorisées par action ──────────────────────
const TRANSITIONS = {
  ACCEPT:          { from: ['assignee_attente'],                    to: 'acceptee' },
  REFUSE:          { from: ['assignee_attente'],                    to: 'en_attente' },
  EN_ROUTE:        { from: ['acceptee'],                            to: 'driver_en_route_pickup' },
  ARRIVED_PICKUP:  { from: ['driver_en_route_pickup'],             to: 'arrived_pickup' },
  PICKUP:          { from: ['arrived_pickup'],                      to: 'en_cours' },
  ARRIVED_DROPOFF: { from: ['en_cours'],                           to: 'arrived_dropoff' },
  DELIVER:         { from: ['en_cours', 'arrived_dropoff'],        to: 'livree' },
};

// ─── Statuts actifs (source unique — identique à cdlDispatch et checkPendingAssignments) ──
const ACTIVE_STATUTS = new Set([
  'assignee_attente', 'acceptee', 'driver_en_route_pickup',
  'arrived_pickup', 'en_cours', 'arrived_dropoff',
]);

// ─── Module unique d'éligibilité livreur ─────────────────────────────────────
// Source de vérité unique (cdlDispatch et checkPendingAssignments ont leurs propres copies
// identiques — pas d'import local possible en Deno deploy isolé)
function isDriverEligible(driver, realActiveCount = null) {
  if (driver.driver_online !== true) return false;
  if (!driver.profil_valide && driver.statut_validation_livreur !== 'valide' && driver.statut_validation_livreur !== 'actif') return false;
  if (driver.livreur_bloque || driver.livreur_suspendu) return false;
  if (driver.disponible === false) return false;
  const count = realActiveCount !== null ? realActiveCount : (driver.nombre_courses_actives || 0);
  if (count >= 2) return false;
  return true;
}

// ─── Recalcul réel depuis BDD ─────────────────────────────────────────────────
async function getRealActiveCount(base44, email) {
  const courses = await base44.asServiceRole.entities.Course.filter({ livreur_email: email });
  return courses.filter(c => ACTIVE_STATUTS.has(c.statut) && !c.is_deleted).length;
}

// ─── Lecture mode dispatch ────────────────────────────────────────────────────
async function getDispatchMode(base44) {
  const rows = await base44.asServiceRole.entities.DispatchModeState.list('-updated_date', 1).catch(() => []);
  return rows[0]?.mode === 'manuel' ? 'manuel' : 'auto';
}

// ─── Validation de la transition ─────────────────────────────────────────────
function validateTransition(action, currentStatut, isAdmin) {
  const rule = TRANSITIONS[action];
  if (!rule) return { ok: false, reason: `Action inconnue: ${action}` };
  if (!isAdmin && !rule.from.includes(currentStatut)) {
    return { ok: false, reason: `Transition invalide: ${currentStatut} → ${action} (attendu: ${rule.from.join('|')})` };
  }
  // Admin peut forcer certaines transitions (ex: depuis en_cours si bug)
  if (isAdmin && !rule.from.includes(currentStatut)) {
    console.log(`[CSM] Admin force transition | ${currentStatut} → ${action}`);
  }
  return { ok: true, to: rule.to };
}

// ─── Side-effects : stats livreur (toujours depuis BDD fraîche) ──────────────
async function syncDriverStats(base44, livreurEmail, extraFields = {}) {
  try {
    const [freshUsers] = await Promise.all([
      base44.asServiceRole.entities.User.filter({ email: livreurEmail }),
    ]);
    const freshUser = freshUsers?.[0];
    if (!freshUser) return;
    const realCount = await getRealActiveCount(base44, livreurEmail);
    await base44.asServiceRole.entities.User.update(freshUser.id, {
      nombre_courses_actives: realCount,
      ...extraFields,
    }).catch(() => {});
  } catch (_) {}
}

// ─── Side-effects : notifications (fire-and-forget) ──────────────────────────
function notifyAsync(base44, notif) {
  base44.asServiceRole.entities.Notification.create(notif).catch(() => {});
}
function pushAsync(base44, payload) {
  base44.asServiceRole.functions.invoke('sendCdlNotification', payload).catch(() => {});
}

// ─── Handler principal ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST required' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);

  // Auth
  let user = null;
  try { user = await base44.auth.me(); } catch (_) {}
  if (!user) return Response.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await req.json();
  const { course_id, action, extra = {} } = body;

  if (!course_id || !action) {
    return Response.json({ error: 'course_id et action requis' }, { status: 400 });
  }

  const isAdmin = user.role === 'admin' || user.role === 'dispatcher';
  const ts = new Date().toISOString();
  console.log(`[CSM] action=${action} | course=${course_id} | user=${user.email} | isAdmin=${isAdmin} | ts=${ts}`);

  // ── 1. Charger la course ──────────────────────────────────────────────────
  const courses = await base44.asServiceRole.entities.Course.filter({ id: course_id });
  const course = courses?.[0];
  if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });
  if (course.is_deleted) return Response.json({ error: 'Course supprimée' }, { status: 410 });

  // ── 2. Vérifier l'autorisation ────────────────────────────────────────────
  const livreurAssigne = (course.livreur_email || '').toLowerCase().trim();
  const userEmail = (user.email || '').toLowerCase().trim();
  // Pour ACCEPT et REFUSE : le livreur assigné ou admin
  const needsAssignedDriver = ['ACCEPT', 'REFUSE', 'EN_ROUTE', 'ARRIVED_PICKUP', 'PICKUP', 'ARRIVED_DROPOFF', 'DELIVER'];
  if (needsAssignedDriver.includes(action) && !isAdmin) {
    if (livreurAssigne && livreurAssigne !== userEmail) {
      return Response.json({ error: 'Non autorisé — vous n\'êtes pas le livreur de cette course' }, { status: 403 });
    }
  }

  // ── 3. Valider la transition ──────────────────────────────────────────────
  const { ok, reason, to } = validateTransition(action, course.statut, isAdmin);
  if (!ok) {
    // Idempotence : si déjà dans l'état cible → succès silencieux
    const rule = TRANSITIONS[action];
    if (rule && rule.to === course.statut) {
      return Response.json({ success: true, alreadyDone: true, statut: course.statut });
    }
    console.error(`[CSM] INVALID_TRANSITION | ${reason} | course=${course_id} | currentStatut=${course.statut}`);
    return Response.json({ error: reason, current_statut: course.statut }, { status: 400 });
  }

  // ── 4. DELIVER — idempotence et settlement Bedou ──────────────────────────
  if (action === 'DELIVER') {
    if (course.statut === 'livree' || course.settlement_status === 'completed') {
      console.log(`[CSM] DELIVER already done | course=${course_id}`);
      return Response.json({ success: true, alreadyDone: true, statut: 'livree' });
    }

    // Appel bedouEngine — règlement financier avant de changer le statut
    const montant = course.prix || 0;
    const gainLivreur = course.gain_livreur || Math.round(montant * 0.8);
    const commissionCdl = course.commission_cdl || (montant - gainLivreur);

    let bedouRes = null;
    try {
      const r = await base44.asServiceRole.functions.invoke('bedouEngine', {
        action: 'finaliser_course',
        course_id,
        client_email: course.client_email,
        client_nom: course.client_name,
        livreur_email: course.livreur_email,
        livreur_nom: course.livreur_name,
        montant,
      });
      bedouRes = r?.data;
    } catch (err) {
      console.error(`[CSM] DELIVER bedouEngine error | ${err.message}`);
      return Response.json({ error: 'Erreur règlement Bedou: ' + err.message }, { status: 500 });
    }

    if (!bedouRes?.success && !bedouRes?.alreadyDone) {
      if (bedouRes?.insuffisant) {
        return Response.json({ error: `Solde client insuffisant (${bedouRes.solde?.toLocaleString()} FCFA)`, insuffisant: true }, { status: 402 });
      }
      return Response.json({ error: bedouRes?.error || 'Échec règlement Bedou' }, { status: 500 });
    }

    // Transition atomique → livree
    const now = new Date().toISOString();
    await base44.asServiceRole.entities.Course.update(course_id, {
      statut: 'livree',
      date_livraison: now,
      statut_paiement: 'paye',
      commission_cdl: commissionCdl,
      gain_livreur: gainLivreur,
      statut_paiement_livreur: 'Payé',
      settlement_status: 'completed',
      settled_at: now,
      ...extra,
    });

    // Side-effects fire-and-forget
    syncDriverStats(base44, course.livreur_email, {
      total_courses_livrees: undefined, // géré par updateLivreurStreak
    });
    base44.asServiceRole.functions.invoke('updateLivreurStreak', {}).catch(() => {});

    notifyAsync(base44, {
      destinataire_email: course.client_email, destinataire_role: 'client',
      titre: '✅ Colis livré !',
      message: `Votre colis a été livré par ${course.livreur_name}. ${montant.toLocaleString()} FCFA débités.`,
      type: 'success', lue: false, course_id,
      target_screen: `/course/${course_id}/track`,
      notification_key: `${course.client_email}__livree__${course_id}`,
    });
    pushAsync(base44, {
      user_email: course.client_email,
      title: '✅ Livraison confirmée',
      body: `Votre colis est arrivé à ${course.quartier_arrivee}.`,
      data: { notif_route: `/course/${course_id}/track` },
    });

    console.log(`[CSM] DELIVER OK | course=${course_id} | gain=${gainLivreur}`);
    return Response.json({ success: true, statut: 'livree', gain_livreur: gainLivreur });
  }

  // ── 5. Toutes les autres transitions ─────────────────────────────────────
  const now = new Date().toISOString();
  const updateData = { statut: to, ...extra };

  // Données spécifiques par action
  if (action === 'ACCEPT') {
    updateData.livreur_email = user.email;
    updateData.livreur_name = user.full_name || user.email;
    updateData.telephone_livreur = user.telephone || '';
    updateData.date_acceptation = now;
    updateData.mode_assignation = course.mode_assignation || 'auto';
  }

  if (action === 'REFUSE') {
    // Mettre à jour l'historique
    let historique = [];
    try { if (course.historique_assignation) historique = JSON.parse(course.historique_assignation); } catch (_) {}
    historique = historique.map(h =>
      h.livreur_email?.toLowerCase() === userEmail && h.statut === 'proposee'
        ? { ...h, statut: 'refuse', heure_refus: now }
        : h
    );
    updateData.livreur_email = null;
    updateData.livreur_name = null;
    updateData.telephone_livreur = null;
    updateData.heure_assignation = null;
    updateData.historique_assignation = JSON.stringify(historique);
  }

  if (action === 'PICKUP') {
    updateData.date_recuperation = now;
  }

  // Transition atomique
  await base44.asServiceRole.entities.Course.update(course_id, updateData);
  console.log(`[CSM] ${action} OK | ${course.statut} → ${to} | course=${course_id} | user=${user.email}`);

  // Side-effects fire-and-forget par action
  if (action === 'ACCEPT') {
    syncDriverStats(base44, user.email, {
      courses_acceptees: undefined, // incrémenté dans syncDriverStats depuis BDD
      courses_refusees_consecutives: 0,
    }).then(async () => {
      // Incrémenter courses_acceptees séparément (besoin du +1)
      const freshUsers = await base44.asServiceRole.entities.User.filter({ email: user.email });
      const fu = freshUsers?.[0];
      if (fu) await base44.asServiceRole.entities.User.update(fu.id, {
        courses_acceptees: (fu.courses_acceptees || 0) + 1,
        courses_refusees_consecutives: 0,
      }).catch(() => {});
    }).catch(() => {});

    notifyAsync(base44, {
      destinataire_email: course.client_email, destinataire_role: 'client',
      titre: '🛵 Livreur en route !',
      message: `${user.full_name || 'Un livreur'} a accepté votre course ${course.quartier_depart}→${course.quartier_arrivee}.`,
      type: 'success', lue: false, course_id,
      target_screen: `/course/${course_id}/track`,
    });
    pushAsync(base44, {
      user_email: course.client_email,
      title: '🛵 Livreur en route',
      body: `${user.full_name || 'Un livreur'} prend en charge votre course.`,
      data: { notif_route: `/course/${course_id}/track` },
    });
  }

  if (action === 'REFUSE') {
    syncDriverStats(base44, user.email).then(async () => {
      const freshUsers = await base44.asServiceRole.entities.User.filter({ email: user.email });
      const fu = freshUsers?.[0];
      if (fu) await base44.asServiceRole.entities.User.update(fu.id, {
        courses_refusees: (fu.courses_refusees || 0) + 1,
        courses_refusees_consecutives: (fu.courses_refusees_consecutives || 0) + 1,
      }).catch(() => {});
    }).catch(() => {});

    // Redispatch seulement si mode AUTO
    const modeAssign = (course.mode_assignation || '').toLowerCase();
    const isManual = modeAssign === 'manuel' || modeAssign === 'manuel_admin' || modeAssign === 'manuel_force';
    if (!isManual) {
      base44.asServiceRole.functions.invoke('cdlDispatch', {
        course_id,
        exclude_emails: [user.email],
      }).catch(() => {});
    } else {
      console.log(`[CSM] REFUSE — mode=manuel, pas de redispatch auto | course=${course_id}`);
    }
  }

  return Response.json({ success: true, statut: to, ancien_statut: course.statut, action });
});