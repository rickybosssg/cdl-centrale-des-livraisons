import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Retourne les documents manquants et reçus pour un profil incomplet
 * Pas de crash même si données partielles ou nulles
 */
function analyzeMissingDocuments(profile, profileType) {
  // Defaults robustes
  const docs = (() => {
    try {
      return profile.documents_json ? JSON.parse(profile.documents_json) : {};
    } catch {
      return {};
    }
  })();

  const data = (() => {
    try {
      return profile.data_json ? JSON.parse(profile.data_json) : {};
    } catch {
      return {};
    }
  })();

  // Documents obligatoires par type
  const required = {
    livreur: [
      { key: 'photo_profil', label: 'Photo de profil', type: 'image' },
      { key: 'photo_identite_recto', label: 'CNIB (Recto)', type: 'image' },
      { key: 'photo_identite_verso', label: 'CNIB (Verso)', type: 'image' },
      { key: 'photo_moyen_deplacement', label: 'Photo moto/véhicule', type: 'image' },
    ],
    partenaire: [
      { key: 'logo', label: 'Logo boutique', type: 'image' },
      { key: 'photo_principale', label: 'Photo couverture', type: 'image' },
    ],
    commercial: [
      { key: 'telephone', label: 'Téléphone', type: 'field' },
    ],
    client: [
      { key: 'telephone', label: 'Téléphone', type: 'field' },
    ],
  };

  const requiredList = required[profileType] || [];

  // Analyser
  const received = [];
  const missing = [];
  const invalid = [];

  requiredList.forEach(req => {
    if (req.type === 'image') {
      const value = docs[req.key];
      if (value && typeof value === 'string' && value.length > 10) {
        received.push({ ...req, value });
      } else {
        missing.push(req);
      }
    } else if (req.type === 'field') {
      // Chercher dans profile directement ou dans data_json
      const value = profile[req.key] || data[req.key] || profile[`profile_${req.key}`];
      if (value && typeof value === 'string' && value.trim().length > 0) {
        received.push({ ...req, value });
      } else {
        missing.push(req);
      }
    }
  });

  // Vérifier engagement si applicable
  let engagementMissing = false;
  if (profileType === 'livreur') {
    const engagement = profile.engagement_accepted || data.engagement_accepted;
    if (!engagement) {
      engagementMissing = true;
      missing.push({
        key: 'engagement',
        label: 'Accepter les conditions',
        type: 'checkbox',
      });
    }
  }

  return {
    profileId: profile.id,
    profileType,
    status: profile.status,
    received,
    missing,
    invalid,
    isComplete: missing.length === 0 && !engagementMissing,
    completionPercentage: Math.round((received.length / requiredList.length) * 100),
  };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Méthode non autorisée' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { profileId } = await req.json();
    if (!profileId) {
      return Response.json({ error: 'profileId manquant' }, { status: 400 });
    }

    // Charger le profil
    const profiles = await base44.asServiceRole.entities.UserProfile.filter({ id: profileId });
    if (!profiles || profiles.length === 0) {
      return Response.json({ error: 'Profil introuvable' }, { status: 404 });
    }

    const profile = profiles[0];

    // Vérifier que c'est le profil de l'utilisateur
    if (profile.user_email !== user.email) {
      return Response.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const analysis = analyzeMissingDocuments(profile, profile.profile_type);

    return Response.json({
      success: true,
      ...analysis,
    });
  } catch (error) {
    console.error('[getMissingDocuments] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});