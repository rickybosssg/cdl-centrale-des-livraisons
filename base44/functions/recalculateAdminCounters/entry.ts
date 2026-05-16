import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Compter les éléments par catégorie
    const partners = await base44.entities.Partenaire.filter({ deleted: false, suspended: false });
    const suspendedPartners = await base44.entities.Partenaire.filter({ suspended: true });
    const deletedPartners = await base44.entities.Partenaire.filter({ deleted: true });

    const commercials = await base44.entities.CodePromo.filter({ deleted: false, suspended: false });
    const suspendedCommericals = await base44.entities.CodePromo.filter({ suspended: true });
    const deletedCommericals = await base44.entities.CodePromo.filter({ deleted: true });

    const ads = await base44.entities.Publicite.filter({ deleted: false, suspended: false });
    const suspendedAds = await base44.entities.Publicite.filter({ suspended: true });
    const deletedAds = await base44.entities.Publicite.filter({ deleted: true });

    const counts = {
      partenaires_actifs: partners.length,
      partenaires_suspendus: suspendedPartners.length,
      partenaires_supprimes: deletedPartners.length,
      partenaires_total: partners.length + suspendedPartners.length + deletedPartners.length,
      commerciaux_actifs: commercials.length,
      commerciaux_suspendus: suspendedCommericals.length,
      commerciaux_supprimes: deletedCommericals.length,
      commerciaux_total: commercials.length + suspendedCommericals.length + deletedCommericals.length,
      publicites_actives: ads.length,
      publicites_suspendues: suspendedAds.length,
      publicites_supprimees: deletedAds.length,
    };

    return Response.json({
      success: true,
      counts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});