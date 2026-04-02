import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Calcule l'ETA basée sur position GPS actuelle du livreur et distance à destination
 * Utilise une vitesse moyenne d'environ 20-30 km/h en milieu urbain
 */
function calculateETATime(livreurLat, livreurLng, destLat, destLng) {
  // Distance en km (approximation)
  const diffLat = destLat - livreurLat;
  const diffLng = destLng - livreurLng;
  const distance = Math.sqrt(diffLat * diffLat + diffLng * diffLng) * 111; // 1 degré ≈ 111 km

  // Vitesse moyenne urbaine : 25 km/h
  // Ajouter 5 min pour arrêt/présentation
  const speedKmh = 25;
  const timeMinutes = Math.ceil((distance / speedKmh) * 60 + 5);

  // ETA = maintenant + durée
  const now = new Date();
  const eta = new Date(now.getTime() + timeMinutes * 60000);

  return {
    distance: distance.toFixed(2),
    timeMinutes,
    eta: eta.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    etaObject: eta,
  };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Méthode non autorisée" }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const { livreurLat, livreurLng, destLat, destLng, courseId } = await req.json();

    // Valider les coordonnées
    if (
      livreurLat === undefined ||
      livreurLng === undefined ||
      destLat === undefined ||
      destLng === undefined
    ) {
      return Response.json({ error: "Coordonnées manquantes" }, { status: 400 });
    }

    const result = calculateETATime(livreurLat, livreurLng, destLat, destLng);

    // Optionnel : mettre à jour la course avec l'ETA
    if (courseId) {
      try {
        await base44.asServiceRole.entities.Course.update(courseId, {
          eta: result.eta,
          eta_timestamp: result.etaObject.toISOString(),
          estimated_distance: result.distance,
        });
      } catch (err) {
        console.warn('[calculateETA] Erreur mise à jour course:', err);
      }
    }

    return Response.json({
      success: true,
      eta: result.eta,
      etaMinutes: result.timeMinutes,
      distance: result.distance,
      distanceFormatted: `${result.distance} km`,
      timeFormatted: `${result.timeMinutes} min`,
    });
  } catch (error) {
    console.error("[calculateETA] Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});