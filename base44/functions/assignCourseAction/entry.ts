/**
 * assignCourseAction — SOURCE UNIQUE D'ASSIGNATION CDL
 *
 * Remplace TOUTE logique d'assignation manuelle dispersée dans les pages frontend.
 * S'appuie sur cdlDispatch pour l'auto-dispatch.
 *
 * Modes :
 *   - "manual"    : admin choisit un livreur spécifique (driver_email requis)
 *   - "auto"      : cdlDispatch sélectionne automatiquement le meilleur livreur
 *   - "redispatch": comme auto mais reset l'historique d'exclusions
 *
 * Payload : { course_id, mode, driver_email? }
 * Réponse : { success, livreur: { email, nom }, mode_used }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DISPATCHABLE_STATUTS = new Set([
  'en_attente', 'aucun_livreur', 'assignee_attente', 'refusee',
]);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });

  const base44 = createClientFromRequest(req);

  // ── Auth ──────────────────────────────────────────────────────────────────
  let user = null;
  try { user = await base44.auth.me(); } catch (_) {}
  if (!user) return Response.json({ error: 'Non authentifié' }, { status: 401 });

  const isAdmin = user.role === 'admin';
  // Staff avec permission ou admin
  let hasPermission = isAdmin;
  if (!hasPermission) {
    const perms = await base44.asServiceRole.entities.StaffPermission
      .filter({ userEmail: user.email, isActive: true })
      .catch(() => []);
    hasPermission = perms[0]?.canManualDispatch === true;
  }
  if (!hasPermission) return Response.json({ error: 'Accès refusé' }, { status: 403 });

  const { course_id, mode = 'auto', driver_email } = await req.json();

  if (!course_id) return Response.json({ error: 'course_id requis' }, { status: 400 });
  if (mode === 'manual' && !driver_email) return Response.json({ error: 'driver_email requis pour mode manual' }, { status: 400 });

  console.log(`[ASSIGN_COURSE] course=${course_id} | mode=${mode} | driver=${driver_email || 'auto'} | by=${user.email}`);

  // ── Charger la course ─────────────────────────────────────────────────────
  const courses = await base44.asServiceRole.entities.Course.filter({ id: course_id });
  const course = courses?.[0];
  if (!course) return Response.json({ error: 'Course introuvable' }, { status: 404 });

  if (!DISPATCHABLE_STATUTS.has(course.statut)) {
    console.log(`[ASSIGN_COURSE] Non dispatchable | statut=${course.statut}`);
    return Response.json({ success: false, reason: `Statut non dispatchable: ${course.statut}` });
  }

  // ── Mode AUTO / REDISPATCH → déléguer à cdlDispatch ──────────────────────
  if (mode === 'auto' || mode === 'redispatch') {
    const res = await base44.asServiceRole.functions.invoke('cdlDispatch', {
      course_id,
      force: true, // toujours forcer (ignore mode dispatch global)
      exclude_emails: mode === 'redispatch' ? [] : undefined,
      // redispatch reset l'historique d'exclusions
    });
    const data = res?.data || res;
    console.log(`[ASSIGN_COURSE] cdlDispatch result | success=${data?.success} | driver=${data?.livreur?.email}`);
    return Response.json({ ...data, mode_used: mode });
  }

  // ── Mode MANUAL ──────────────────────────────────────────────────────────
  // Vérifier le livreur
  const drivers = await base44.asServiceRole.entities.User.filter({ email: driver_email });
  const driver = drivers?.[0];
  if (!driver) return Response.json({ error: 'Livreur introuvable' }, { status: 404 });

  const now = new Date().toISOString();
  let historique = [];
  try { if (course.historique_assignation) historique = JSON.parse(course.historique_assignation); } catch (_) {}

  // ── GUARD ANTI-DOUBLON : ne pas réassigner si même livreur déjà en assignee_attente ──
  if (course.statut === 'assignee_attente' && course.livreur_email === driver_email) {
    console.log(`[ASSIGN_COURSE] GUARD doublon — livreur déjà assigné | course=${course_id} | driver=${driver_email}`);
    return Response.json({ success: false, reason: 'Ce livreur est déjà assigné à cette course' });
  }

  historique.push({
    livreur_email: driver.email,
    livreur_nom: driver.full_name,
    heure: now,
    statut: 'proposee',
    mode: 'manuel_admin',
    assigne_par: user.email,
  });

  // Mettre à jour la course
  await base44.asServiceRole.entities.Course.update(course_id, {
    statut: 'assignee_attente',
    livreur_email: driver.email,
    livreur_name: driver.full_name,
    telephone_livreur: driver.telephone || '',
    heure_assignation: now,
    mode_assignation: 'manuel',
    nombre_tentatives: (course.nombre_tentatives || 0) + 1,
    historique_assignation: JSON.stringify(historique),
  });

  // Mettre à jour stats livreur
  await base44.asServiceRole.entities.User.update(driver.id, {
    nombre_courses_actives: (driver.nombre_courses_actives || 0) + 1,
    courses_proposees: (driver.courses_proposees || 0) + 1,
    derniere_proposition_at: now,
  }).catch(() => {});

  // Notif in-app livreur (avec notification_key pour déduplication)
  const notifKey = `${driver.email}__assigned__${course_id}__${Date.now()}`;
  await base44.asServiceRole.entities.Notification.create({
    destinataire_email: driver.email,
    destinataire_role: 'livreur',
    titre: "🛵 Nouvelle course assignée par l'admin !",
    message: `Course de ${course.quartier_depart} → ${course.quartier_arrivee}. Prix: ${course.prix || 0} FCFA.`,
    type: 'success', lue: false, course_id,
    target_screen: `/course-livreur/${course_id}`,
    target_entity_id: course_id, target_entity_type: 'course',
    notification_key: notifKey,
  }).catch(() => {});

  // Push FCM livreur
  await base44.asServiceRole.functions.invoke('sendCdlNotification', {
    user_email: driver.email,
    title: '📦 Nouvelle course',
    body: `${course.quartier_depart} → ${course.quartier_arrivee} (${course.prix || 0} F)`,
    data: { type: 'dispatch_offer', course_id, notif_route: `/course-livreur/${course_id}` },
  }).catch(() => {});

  // Notif in-app client
  if (course.client_email) {
    await base44.asServiceRole.entities.Notification.create({
      destinataire_email: course.client_email,
      destinataire_role: 'client',
      titre: '🛵 Livreur trouvé !',
      message: `${driver.full_name} a été assigné à votre course.`,
      type: 'success', lue: false, course_id,
      target_screen: `/course/${course_id}`,
    }).catch(() => {});
  }

  // Log audit
  await base44.asServiceRole.entities.AuditLog.create({
    actorEmail: user.email,
    actorName: user.full_name,
    actorRoleLabel: isAdmin ? 'Admin' : 'Staff',
    actionType: 'COURSE_ASSIGNED_MANUAL',
    targetType: 'course',
    targetId: course_id,
    targetName: course_id.slice(0, 8),
    details: `Assigné à ${driver.full_name} (${driver.email})`,
  }).catch(() => {});

  console.log(`[ASSIGN_COURSE] Manual OK | course=${course_id} | driver=${driver.email}`);
  console.log(`[ASSIGNED_DRIVER_ID] course=${course_id} | driver_email=${driver.email} | driver_id=${driver.id} | mode=manual | by=${user.email} | ts=${now}`);

  return Response.json({
    success: true,
    livreur: { email: driver.email, nom: driver.full_name },
    mode_used: 'manual',
  });
});