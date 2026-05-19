/**
 * CDL — driverPresenceEngine
 *
 * SOURCE BACKEND DE VÉRITÉ pour la présence livreur.
 * Le frontend (usePresence) appelle HEARTBEAT toutes les 60s.
 * Ce backend valide, enregistre et peut marquer hors-ligne les livreurs
 * dont le heartbeat est trop ancien (> OFFLINE_THRESHOLD_MS).
 *
 * ACTIONS :
 *   HEARTBEAT      — ping du livreur (frontend → backend)
 *   GET_STATUS     — lire le statut d'un livreur (online/offline/busy)
 *   MARK_OFFLINE   — forcer hors-ligne (admin ou expiration)
 *   SWEEP_STALE    — marquer hors-ligne tous les livreurs sans heartbeat récent (cron)
 *
 * STATUTS CALCULÉS :
 *   online    — driver_online=true, pas de course active, last_seen < 3min
 *   busy      — driver_online=true, courses actives >= 1
 *   offline   — driver_online=false OU last_seen > 3min
 *   stale     — last_seen > OFFLINE_THRESHOLD (considéré hors-ligne)
 *
 * RÈGLE ABSOLUE :
 *   - Seul ce module écrit driver_online=false par expiration.
 *   - Le toggle livreur (LivreurHome) écrit driver_online via auth.updateMe — SOURCE UNIQUE USER.
 *   - Ce module NE remplace PAS le toggle volontaire — il complète avec la détection passive.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000;  // 5 min sans heartbeat → hors-ligne
const BUSY_THRESHOLD       = 1;               // >= 1 course active = occupé

const ACTIVE_STATUTS = new Set([
  'assignee_attente', 'acceptee', 'driver_en_route_pickup',
  'arrived_pickup', 'en_cours', 'arrived_dropoff',
]);

function computeDriverStatus(driver, realActiveCount) {
  const lastSeen = driver.last_seen ? new Date(driver.last_seen).getTime() : 0;
  const age = Date.now() - lastSeen;
  const isStale = age > OFFLINE_THRESHOLD_MS;

  if (!driver.driver_online || isStale) return 'offline';
  if (realActiveCount >= BUSY_THRESHOLD) return 'busy';
  return 'online';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });

  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const { action, email, role } = body;

  const ts = new Date().toISOString();

  // ── HEARTBEAT — ping frontend ─────────────────────────────────────────────
  if (action === 'HEARTBEAT') {
    if (!email) return Response.json({ error: 'email requis' }, { status: 400 });

    // Auth : vérifier que c'est bien l'utilisateur lui-même ou un admin
    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}
    if (!user) return Response.json({ error: 'Non authentifié' }, { status: 401 });

    const isSelf = (user.email || '').toLowerCase() === (email || '').toLowerCase();
    const isAdmin = user.role === 'admin';
    if (!isSelf && !isAdmin) return Response.json({ error: 'Non autorisé' }, { status: 403 });

    const updateFields = {
      last_seen: ts,
      // Synchroniser current_role si fourni
      ...(role ? { current_role: role } : {}),
      // Mettre driver_online=true uniquement si le rôle actif est livreur
      ...(role === 'livreur' ? { driver_online: true } : {}),
    };

    await base44.auth.updateMe(updateFields).catch(() => {});

    console.log(`[PRESENCE_HEARTBEAT] email=${email} | role=${role || '?'} | ts=${ts}`);
    return Response.json({ ok: true, ts, action: 'HEARTBEAT' });
  }

  // ── GET_STATUS — lire le statut réel d'un livreur ─────────────────────────
  if (action === 'GET_STATUS') {
    if (!email) return Response.json({ error: 'email requis' }, { status: 400 });

    const users = await base44.asServiceRole.entities.User.filter({ email });
    const driver = users?.[0];
    if (!driver) return Response.json({ error: 'Livreur introuvable' }, { status: 404 });

    const courses = await base44.asServiceRole.entities.Course.filter({ livreur_email: email });
    const realActiveCount = courses.filter(c => ACTIVE_STATUTS.has(c.statut) && !c.is_deleted).length;

    const status = computeDriverStatus(driver, realActiveCount);
    const lastSeenAge = driver.last_seen
      ? Math.round((Date.now() - new Date(driver.last_seen).getTime()) / 1000)
      : null;

    return Response.json({
      email,
      status,
      driver_online: driver.driver_online,
      disponible: driver.disponible,
      realActiveCount,
      last_seen: driver.last_seen,
      last_seen_age_seconds: lastSeenAge,
      is_stale: lastSeenAge !== null && lastSeenAge > (OFFLINE_THRESHOLD_MS / 1000),
    });
  }

  // ── MARK_OFFLINE — forcer hors-ligne (admin ou sweep) ─────────────────────
  if (action === 'MARK_OFFLINE') {
    // Admin uniquement
    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}
    if (!user || user.role !== 'admin') {
      // Autoriser aussi le sweep interne (appelé depuis SWEEP_STALE en service-role)
      if (body._internal_sweep !== true) {
        return Response.json({ error: 'Admin requis' }, { status: 403 });
      }
    }
    if (!email) return Response.json({ error: 'email requis' }, { status: 400 });

    const users = await base44.asServiceRole.entities.User.filter({ email });
    const driver = users?.[0];
    if (!driver) return Response.json({ error: 'Livreur introuvable' }, { status: 404 });

    await base44.asServiceRole.entities.User.update(driver.id, {
      driver_online: false,
      disponible: false,
    });

    const reason = body.reason || 'admin_force';
    console.log(`[PRESENCE_MARK_OFFLINE] email=${email} | reason=${reason} | by=${user?.email || 'sweep'} | ts=${ts}`);
    return Response.json({ ok: true, email, status: 'offline', reason });
  }

  // ── SWEEP_STALE — cron : marquer hors-ligne les livreurs inactifs ─────────
  if (action === 'SWEEP_STALE') {
    // Admin ou cron interne
    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}
    const isAdmin = user?.role === 'admin';
    const isCron = body._cron === true;
    if (!isAdmin && !isCron) return Response.json({ error: 'Admin ou cron requis' }, { status: 403 });

    const allDrivers = await base44.asServiceRole.entities.User.filter({ driver_online: true });
    const staleDrivers = allDrivers.filter(d => {
      const age = d.last_seen ? Date.now() - new Date(d.last_seen).getTime() : Infinity;
      return age > OFFLINE_THRESHOLD_MS;
    });

    const swept = [];
    for (const d of staleDrivers) {
      await base44.asServiceRole.entities.User.update(d.id, {
        driver_online: false,
        disponible: false,
      }).catch(() => {});
      swept.push({ email: d.email, last_seen: d.last_seen });
      console.log(`[PRESENCE_SWEEP] marked offline | email=${d.email} | last_seen=${d.last_seen}`);
    }

    console.log(`[PRESENCE_SWEEP_DONE] swept=${swept.length} | online_checked=${allDrivers.length} | ts=${ts}`);
    return Response.json({
      ok: true,
      swept_count: swept.length,
      swept,
      online_checked: allDrivers.length,
      ts,
    });
  }

  return Response.json({ error: 'Action inconnue. Valeurs : HEARTBEAT | GET_STATUS | MARK_OFFLINE | SWEEP_STALE' }, { status: 400 });
});