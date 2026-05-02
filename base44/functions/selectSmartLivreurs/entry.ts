/**
 * selectSmartLivreurs — Sélection intelligente des livreurs disponibles
 * 
 * Critères obligatoires :
 * - profil livreur actif
 * - en ligne (en_ligne = true)
 * - compte validé
 * 
 * Bonus :
 * - distance proche du point de départ
 * - livreur actif récemment (dernier_ping < 5 min)
 * - bon taux d'acceptation (> 80%)
 * 
 * Retourne : tableau de livreurs triés par score
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // rayon Terre en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // distance en km
};

Deno.serve(async (req) => {
  const t0 = Date.now();
  console.log('[LIVREUR_SELECT] start');

  try {
    const body = await req.json().catch(() => ({}));
    const { courseLatitude, courseLongitude, courseId, courseQuartier, limit = 10 } = body;

    if (!courseId) return Response.json({ error: 'courseId requis' }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // 1. Récupérer tous les livreurs potentiels
    const profiles = await base44.asServiceRole.entities.UserProfile.filter({
      profile_type: 'livreur',
      status: 'actif',
      deleted: false,
    });

    if (!profiles || profiles.length === 0) {
      console.log('[LIVREUR_SELECT] Aucun livreur trouvé');
      return Response.json({ livreurs: [], courseId, message: 'Aucun livreur disponible' });
    }

    // 2. Vérifier en_ligne et autres critères
    const candidates = [];
    for (const profile of profiles) {
      try {
        const data = profile.data_json ? JSON.parse(profile.data_json) : {};
        if (!data.en_ligne) continue; // doit être en ligne
        if (data.compte_valide === false) continue; // doit être validé

        // Calculer le score
        let score = 100;

        // Bonus distance (max 30 points) — plus proche = plus de points
        if (courseLatitude && courseLongitude && data.latitude && data.longitude) {
          const dist = haversine(courseLatitude, courseLongitude, data.latitude, data.longitude);
          score += Math.max(0, 30 - dist * 2); // décrémente de 2 points par km
        }

        // Bonus récence du ping (max 15 points) — actif récemment
        if (data.dernier_ping) {
          const lastPing = new Date(data.dernier_ping).getTime();
          const minSinceLastPing = (Date.now() - lastPing) / 60000;
          if (minSinceLastPing < 5) score += 15;
          else if (minSinceLastPing < 15) score += 10;
          else if (minSinceLastPing < 30) score += 5;
        }

        // Bonus acceptation (max 20 points)
        if (data.taux_acceptation) {
          if (data.taux_acceptation >= 90) score += 20;
          else if (data.taux_acceptation >= 80) score += 15;
          else if (data.taux_acceptation >= 70) score += 10;
        }

        // Bonus zone (max 10 points)
        if (courseQuartier && data.quartier_favori && courseQuartier === data.quartier_favori) {
          score += 10;
        }

        candidates.push({
          id: profile.id,
          user_email: profile.user_email,
          user_name: profile.user_name || profile.user_email,
          score,
          distance: courseLatitude && courseLongitude && data.latitude && data.longitude
            ? haversine(courseLatitude, courseLongitude, data.latitude, data.longitude)
            : null,
          en_ligne: data.en_ligne,
          taux_acceptation: data.taux_acceptation || 0,
          quartier: data.quartier_favori || 'unknown',
        });
      } catch (e) {
        console.warn('[LIVREUR_SELECT] Erreur parsing profil:', e.message);
      }
    }

    // 3. Trier par score (descending) + distance (ascending)
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.distance !== null && b.distance !== null) return a.distance - b.distance;
      return 0;
    });

    const selected = candidates.slice(0, limit);
    console.log('[LIVREUR_SELECT] candidates trouvés:', selected.length);
    console.log('[LIVREUR_SELECT] top 3:', selected.slice(0, 3).map(l => `${l.user_name}(${l.score})`).join(' | '));

    return Response.json({
      courseId,
      livreurs: selected,
      total: candidates.length,
      elapsed: Date.now() - t0,
    });
  } catch (err) {
    console.error('[LIVREUR_SELECT] error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});