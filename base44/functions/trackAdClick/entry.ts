import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { adId } = await req.json();

    if (!adId) {
      return Response.json({ error: 'adId manquant' }, { status: 400 });
    }

    // Incrémenter le compteur de clics
    const ads = await base44.asServiceRole.entities.Publicite.filter({ id: adId });
    if (!ads || ads.length === 0) {
      return Response.json({ error: 'Pub non trouvée' }, { status: 404 });
    }

    const ad = ads[0];
    const currentClicks = ad.clics || 0;

    await base44.asServiceRole.entities.Publicite.update(adId, {
      clics: currentClicks + 1,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('[trackAdClick] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});