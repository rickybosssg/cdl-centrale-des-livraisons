/**
 * CDL — cleanupStaleAssignments
 *
 * PROBLÈME CORRIGÉ :
 *   nombre_courses_actives sur User est un compteur optimiste qui dérive.
 *   Ce job recalcule DEPUIS LA BDD le vrai nombre de courses actives par livreur
 *   et corrige le champ User.nombre_courses_actives.
 *
 * UN LIVREUR EST "OCCUPÉ" UNIQUEMENT si une course avec l'un de ces statuts lui est assignée :
 *   - assignee_attente
 *   - acceptee
 *   - driver_en_route_pickup
 *   - arrived_pickup
 *   - en_cours
 *   - arrived_dropoff
 *
 * TOUS LES AUTRES statuts (livree, annulee, refusee, aucun_livreur, echec_dispatch...)
 * ne comptent PAS comme course active.
 *
 * Admin only. Appelé manuellement depuis /admin/cleanup ou via scheduled automation.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ACTIVE_STATUTS = new Set([
  'assignee_attente',
  'acceptee',
  'driver_en_route_pickup',
  'arrived_pickup',
  'en_cours',
  'arrived_dropoff',
]);

// Statuts "fantômes" : assignée à un livreur mais terminée/annulée — ne devraient pas compter
const STALE_STATUTS = new Set([
  'livree',
  'annulee',
  'refusee',
  'aucun_livreur',
  'echec_dispatch',
  'failed',
  'cancelled',
  'timeout',
  'rejected',
]);

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    // 1. Lire TOUTES les courses (pas seulement actives — pour détecter les fantômes)
    const allCourses = await base44.asServiceRole.entities.Course.list('-created_date', 500);

    // 2. Construire un index : livreur_email → count de vraies courses actives
    const realActiveCounts = {};
    const ghostCourses = []; // courses avec livreur_email mais statut terminal

    for (const course of allCourses) {
      const email = course.livreur_email;
      if (!email || email.trim() === '') continue;

      if (ACTIVE_STATUTS.has(course.statut)) {
        realActiveCounts[email] = (realActiveCounts[email] || 0) + 1;
      } else if (STALE_STATUTS.has(course.statut)) {
        // Course fantôme : livreur_email renseigné mais statut terminal
        // Ces courses ne devraient plus bloquer le livreur
        ghostCourses.push({
          course_id: course.id,
          livreur_email: email,
          statut: course.statut,
          created_date: course.created_date,
          quartier: `${course.quartier_depart || '?'} → ${course.quartier_arrivee || '?'}`,
        });
      }
    }

    // 3. Lire tous les livreurs avec driver_online=true + ceux ayant nombre_courses_actives > 0
    const [onlineDrivers, busyDrivers] = await Promise.all([
      base44.asServiceRole.entities.User.filter({ driver_online: true }, null, 300),
      base44.asServiceRole.entities.User.filter({ driver_online: false }, null, 300),
    ]);

    // Merge unique par email
    const allDriversMap = new Map();
    for (const d of [...onlineDrivers, ...busyDrivers]) {
      if (!allDriversMap.has(d.email)) allDriversMap.set(d.email, d);
    }

    // 4. Corriger les compteurs divergents
    const corrections = [];
    const alreadyCorrect = [];

    for (const [email, driver] of allDriversMap) {
      const realCount = realActiveCounts[email] || 0;
      const storedCount = driver.nombre_courses_actives || 0;

      if (storedCount !== realCount) {
        corrections.push({
          driver_id: driver.id,
          email,
          nom: driver.full_name,
          stored: storedCount,
          real: realCount,
          delta: realCount - storedCount,
        });
        // Corriger en BDD
        await base44.asServiceRole.entities.User.update(driver.id, {
          nombre_courses_actives: realCount,
        }).catch(() => {});
      } else {
        alreadyCorrect.push(email);
      }
    }

    // 5. Aussi corriger les livreurs qui ont un count > 0 mais ne sont pas dans notre map
    // (livreurs avec nombre_courses_actives positif mais aucune vraie course active)
    const allDriversWithCount = await base44.asServiceRole.entities.User.list('-updated_date', 500);
    const extraCorrections = [];
    for (const d of allDriversWithCount) {
      if ((d.nombre_courses_actives || 0) > 0 && !allDriversMap.has(d.email)) {
        const realCount = realActiveCounts[d.email] || 0;
        if (realCount !== d.nombre_courses_actives) {
          extraCorrections.push({ email: d.email, nom: d.full_name, stored: d.nombre_courses_actives, real: realCount });
          await base44.asServiceRole.entities.User.update(d.id, {
            nombre_courses_actives: realCount,
          }).catch(() => {});
        }
      }
    }

    const totalCorrections = corrections.length + extraCorrections.length;
    const elapsed = Date.now() - t0;

    return Response.json({
      success: true,
      summary: {
        courses_analysed: allCourses.length,
        drivers_checked: allDriversMap.size,
        corrections_made: totalCorrections,
        already_correct: alreadyCorrect.length,
        ghost_courses_found: ghostCourses.length,
        elapsed_ms: elapsed,
      },
      corrections: [...corrections, ...extraCorrections],
      ghost_courses: ghostCourses.slice(0, 50), // limiter la réponse
    });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});