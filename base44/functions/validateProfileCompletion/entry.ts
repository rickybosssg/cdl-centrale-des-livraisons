import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { profile_id } = await req.json();

    // Récupérer le profil
    const profile = await base44.entities.UserProfile.filter({ id: profile_id, user_email: user.email });
    if (!profile || profile.length === 0) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    const prof = profile[0];
    const issues = [];

    // Valider les champs obligatoires selon le type
    if (!prof.data_json) {
      issues.push('missing_data');
    } else {
      try {
        const data = JSON.parse(prof.data_json);
        // Champs génériques requuis
        if (!data.nom || !data.telephone) issues.push('missing_contact');
        // Spécifiques livreur
        if (prof.profile_type === 'livreur') {
          if (!data.moyen_transport) issues.push('missing_transport');
        }
        // Spécifiques partenaire
        if (prof.profile_type === 'partenaire') {
          if (!data.nom_commerce || !data.type_commerce) issues.push('missing_commerce');
        }
      } catch {
        issues.push('invalid_data');
      }
    }

    // Valider documents
    if (!prof.documents_json) {
      issues.push('missing_documents');
    } else {
      try {
        const docs = JSON.parse(prof.documents_json);
        if (prof.profile_type === 'livreur') {
          if (!docs.photo_profil || !docs.photo_identite_recto) {
            issues.push('missing_livreur_docs');
          }
        }
      } catch {
        issues.push('invalid_documents');
      }
    }

    const isComplete = issues.length === 0;

    // Si complet, passer à "en_attente"
    if (isComplete && prof.status === 'incomplet') {
      await base44.entities.UserProfile.update(profile_id, {
        status: 'en_attente',
      });
      return Response.json({ success: true, status: 'en_attente', issues: [] });
    }

    return Response.json({
      success: false,
      status: prof.status,
      issues,
      completion_percentage: issues.length === 0 ? 100 : 50,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});