import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Analyse le marché et recommande un prix pour maximiser les chances d'acceptation rapide.
// Le client fixe son prix — on lui indique juste si c'est Lent/Moyen/Rapide.

const HEURES_POINTE = [{ start: 7, end: 10 }, { start: 12, end: 14 }, { start: 17, end: 21 }];
function isHeurePointe(h) { return HEURES_POINTE.some(p => h >= p.start && h < p.end); }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { quartier_depart, prix_propose } = await req.json();

    const heureLocale = new Date().getUTCHours();
    const enPointe = isHeurePointe(heureLocale);

    // Charger données marché en parallèle
    const [coursesEnAttente, livreursDisponibles, coursesRecentes] = await Promise.all([
      base44.asServiceRole.entities.Course.filter({ statut: 'en_attente' }),
      base44.asServiceRole.entities.User.filter({ user_type: 'livreur', disponible: true }),
      base44.asServiceRole.entities.Course.list('-created_date', 50),
    ]);

    const livreursActifs = (livreursDisponibles || []).filter(l => !l.livreur_bloque);
    const nbAttente = (coursesEnAttente || []).length;
    const nbLivreurs = livreursActifs.length;
    const ratio = nbLivreurs === 0 ? 10 : nbAttente / nbLivreurs;

    // Prix médian des 30 dernières courses livrées dans la même zone (ou global)
    const coursesLivrees = (coursesRecentes || []).filter(c => c.statut === 'livree');
    const coursesZone = coursesLivrees.filter(c => c.quartier_depart === quartier_depart);
    const prixRef = coursesZone.length >= 3 ? coursesZone : coursesLivrees;
    const prixList = prixRef.map(c => c.prix || 0).filter(p => p > 0).sort((a, b) => a - b);
    const mediane = prixList.length > 0
      ? prixList[Math.floor(prixList.length / 2)]
      : 1500;
    const prixMoyen = prixList.length > 0
      ? Math.round(prixList.reduce((s, p) => s + p, 0) / prixList.length)
      : 1500;

    // Prix recommandé : ajusté selon tension du marché
    let facteurMarche = 1.0;
    if (ratio >= 3 || nbLivreurs <= 1) facteurMarche = 1.4;
    else if (ratio >= 1.5 || enPointe)  facteurMarche = 1.2;
    else if (ratio >= 0.8)              facteurMarche = 1.1;

    const prixRecommande = Math.round(mediane * facteurMarche / 100) * 100;
    const prixMinViable  = Math.round(mediane * 0.8 / 100) * 100;
    const prixRapide     = Math.round(mediane * 1.3 * facteurMarche / 100) * 100;

    // Évaluer le prix proposé par le client
    let vitesse, message, color;
    if (!prix_propose || prix_propose <= 0) {
      vitesse = null;
    } else if (prix_propose >= prixRapide) {
      vitesse = 'rapide';
      message = '⚡ Très bon prix — livreur trouvé rapidement';
      color = 'green';
    } else if (prix_propose >= prixRecommande) {
      vitesse = 'moyen';
      message = '✅ Prix correct — bonne chance d\'acceptation';
      color = 'blue';
    } else if (prix_propose >= prixMinViable) {
      vitesse = 'lent';
      message = '⚠️ Prix bas — attente plus longue possible';
      color = 'amber';
    } else {
      vitesse = 'tres_lent';
      message = '🔴 Prix trop bas — difficile de trouver un livreur';
      color = 'red';
    }

    // Contexte marché
    let contexte = null;
    if (nbLivreurs === 0)     contexte = { label: 'Aucun livreur disponible', urgence: true };
    else if (ratio >= 2)      contexte = { label: `${nbAttente} courses pour ${nbLivreurs} livreurs — forte demande`, urgence: true };
    else if (enPointe)        contexte = { label: 'Heure de pointe — plus de demandes', urgence: false };
    else if (nbLivreurs >= 5) contexte = { label: `${nbLivreurs} livreurs disponibles`, urgence: false };

    return Response.json({
      success: true,
      marche: { nbAttente, nbLivreurs, ratio: Math.round(ratio * 10) / 10, enPointe, mediane, prixMoyen },
      recommandation: { prixMinViable, prixRecommande, prixRapide },
      evaluation: prix_propose > 0 ? { vitesse, message, color } : null,
      contexte,
    });

  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});