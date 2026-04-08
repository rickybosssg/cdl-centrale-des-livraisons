import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Calcul du surge pricing en temps réel
// Facteurs : ratio courses/livreurs, heure de pointe, zone saturée

const HEURES_POINTE = [
  { start: 7, end: 10 },   // Matin
  { start: 12, end: 14 },  // Midi
  { start: 17, end: 21 },  // Soir
];

function isHeurePointe(heureLocale) {
  return HEURES_POINTE.some(h => heureLocale >= h.start && heureLocale < h.end);
}

function calculerSurge({ coursesEnAttente, livreursDisponibles, heureLocale, zone }) {
  let score = 0;

  // 1. Ratio courses / livreurs (facteur principal)
  const ratio = livreursDisponibles === 0 ? 10 : coursesEnAttente / livreursDisponibles;
  if (ratio >= 4)       score += 50;
  else if (ratio >= 2)  score += 30;
  else if (ratio >= 1)  score += 15;
  else if (ratio >= 0.5) score += 5;

  // 2. Nombre absolu de courses en attente
  if (coursesEnAttente >= 8)       score += 20;
  else if (coursesEnAttente >= 5)  score += 12;
  else if (coursesEnAttente >= 3)  score += 6;

  // 3. Heure de pointe
  if (isHeurePointe(heureLocale)) score += 15;

  // 4. Peu de livreurs disponibles
  if (livreursDisponibles === 0)      score += 25;
  else if (livreursDisponibles <= 1)  score += 15;
  else if (livreursDisponibles <= 2)  score += 8;

  // Déterminer le niveau
  let level, multiplier, label, message, livreurMessage;
  if (score >= 60) {
    level = 'extreme';
    multiplier = 1.8;
    label = '🔴 Demande extrême';
    message = 'Demande extrêmement élevée dans votre zone. Prix ajusté pour trouver un livreur en urgence.';
    livreurMessage = '💰 GAINS MAXIMAUX maintenant ! Forte demande dans ta zone, gagne +80% !';
  } else if (score >= 35) {
    level = 'fort';
    multiplier = 1.5;
    label = '🟠 Forte demande';
    message = 'Forte demande dans votre zone. Prix ajusté pour trouver un livreur plus rapidement.';
    livreurMessage = '💰 Gagne plus maintenant ! Forte demande dans ta zone, +50% sur les courses !';
  } else if (score >= 18) {
    level = 'eleve';
    multiplier = 1.2;
    label = '🟡 Demande élevée';
    message = 'Demande élevée actuellement. Prix légèrement ajusté pour vous trouver un livreur rapidement.';
    livreurMessage = '📈 Bonne période ! Demande en hausse dans ta zone, +20% sur les courses.';
  } else {
    level = 'normal';
    multiplier = 1.0;
    label = '🟢 Prix normal';
    message = null;
    livreurMessage = null;
  }

  return {
    level,
    multiplier,
    label,
    message,
    livreurMessage,
    score,
    debug: { ratio: Math.round(ratio * 10) / 10, coursesEnAttente, livreursDisponibles, heureLocale, isPointe: isHeurePointe(heureLocale) },
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { quartier } = body;

    // Heure locale Ouagadougou (UTC+0)
    const heureLocale = new Date().getUTCHours();

    // Charger courses en attente + livreurs disponibles en parallèle
    const [coursesEnAttente, livreursDisponibles] = await Promise.all([
      base44.asServiceRole.entities.Course.filter({ statut: 'en_attente' }),
      base44.asServiceRole.entities.User.filter({ user_type: 'livreur', disponible: true }),
    ]);

    const livreursActifs = (livreursDisponibles || []).filter(l => !l.livreur_bloque);

    // Surge global
    const surgeGlobal = calculerSurge({
      coursesEnAttente: (coursesEnAttente || []).length,
      livreursDisponibles: livreursActifs.length,
      heureLocale,
    });

    // Surge par zone si quartier fourni
    let surgeZone = null;
    if (quartier) {
      const coursesZone = (coursesEnAttente || []).filter(c => c.quartier_depart === quartier);
      const livreursZone = livreursActifs.filter(l => l.quartier === quartier);
      surgeZone = calculerSurge({
        coursesEnAttente: coursesZone.length,
        livreursDisponibles: livreursZone.length,
        heureLocale,
        zone: quartier,
      });
    }

    // Prendre le plus élevé entre global et zone
    const LEVELS = ['normal', 'eleve', 'fort', 'extreme'];
    const surgeFinale = surgeZone && LEVELS.indexOf(surgeZone.level) > LEVELS.indexOf(surgeGlobal.level)
      ? surgeZone
      : surgeGlobal;

    console.log(`[SurgePrice] Zone: ${quartier || 'global'} | Level: ${surgeFinale.level} | x${surgeFinale.multiplier} | Score: ${surgeFinale.score}`);

    return Response.json({
      success: true,
      surge: surgeFinale,
      global: surgeGlobal,
      zone: surgeZone,
    });

  } catch (error) {
    console.error('[SurgePrice] Erreur:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});