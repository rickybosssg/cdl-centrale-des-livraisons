import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// Délais de relance en millisecondes
const RELANCE_STEPS = [
  { step: 1, delayMs: 30 * 60 * 1000,       message: "Bonjour 👋, votre inscription CDL est presque terminée. Envoyez vos documents pour commencer à recevoir des courses rapidement 💰" },
  { step: 2, delayMs: 6 * 60 * 60 * 1000,   message: "⚠️ Vous avez des courses disponibles ! Finalisez votre profil maintenant pour commencer à gagner de l'argent" },
  { step: 3, delayMs: 24 * 60 * 60 * 1000,  message: "🔥 Plusieurs courses sont en attente ! Activez votre compte en envoyant vos documents dès maintenant" },
  { step: 4, delayMs: 48 * 60 * 60 * 1000,  message: "🚀 CDL recrute activement ! Ne perdez pas votre place. Complétez votre dossier maintenant" },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { manual_email, manual_message } = body;

    // Relance manuelle d'un livreur spécifique
    if (manual_email) {
      const message = manual_message || "👋 Rappel CDL : Complétez votre dossier pour commencer à recevoir des courses !";
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: manual_email,
        destinataire_role: 'livreur',
        titre: '📋 Rappel : Complétez votre dossier',
        message,
        type: 'warning',
        lue: false,
      });
      await base44.asServiceRole.entities.MessageAdmin.create({
        livreur_email: manual_email,
        sender_email: 'system@cdl.app',
        sender_role: 'admin',
        contenu: message,
        lu_admin: true,
        lu_livreur: false,
      });
      return Response.json({ success: true, sent_to: manual_email });
    }

    // Relance automatique — détecter les profils incomplets
    const now = new Date();
    const allProfiles = await base44.asServiceRole.entities.UserProfile.filter({
      profile_type: 'livreur',
      deleted: false,
    });

    // Profils incomplets = draft, incomplet, ou en_attente sans documents
    const incompleteProfiles = allProfiles.filter(p => {
      if (['actif', 'bloque', 'suspendu'].includes(p.status)) return false;
      const docs = p.documents_json ? JSON.parse(p.documents_json) : {};
      const hasAllDocs = docs.photo_profil && docs.photo_identite_recto && docs.photo_identite_verso && docs.photo_moyen_deplacement;
      return !hasAllDocs;
    });

    console.log(`[relanceLivreurs] ${incompleteProfiles.length} profils incomplets détectés`);

    let sentCount = 0;
    const results = [];

    for (const profile of incompleteProfiles) {
      const createdAt = new Date(profile.created_date);
      const ageMs = now - createdAt;

      const relanceCount = profile.relance_count || 0;
      const lastRelance = profile.derniere_relance ? new Date(profile.derniere_relance) : null;
      const msSinceLastRelance = lastRelance ? now - lastRelance : ageMs;

      // Trouver la prochaine étape de relance
      const nextStep = RELANCE_STEPS.find(s => s.step === relanceCount + 1);
      if (!nextStep) continue; // Déjà au max des relances

      // Vérifier si le délai est atteint
      const requiredDelay = relanceCount === 0 ? nextStep.delayMs : nextStep.delayMs - (RELANCE_STEPS[relanceCount - 1]?.delayMs || 0);
      if (msSinceLastRelance < (relanceCount === 0 ? nextStep.delayMs : 6 * 60 * 60 * 1000)) continue;

      // Envoyer la notification
      await base44.asServiceRole.entities.Notification.create({
        destinataire_email: profile.user_email,
        destinataire_role: 'livreur',
        titre: `📋 Complétez votre dossier (rappel ${nextStep.step}/4)`,
        message: nextStep.message,
        type: 'warning',
        lue: false,
      });

      await base44.asServiceRole.entities.MessageAdmin.create({
        livreur_email: profile.user_email,
        sender_email: 'system@cdl.app',
        sender_role: 'admin',
        contenu: nextStep.message,
        lu_admin: true,
        lu_livreur: false,
      });

      // Mettre à jour le compteur de relances
      await base44.asServiceRole.entities.UserProfile.update(profile.id, {
        relance_count: nextStep.step,
        derniere_relance: now.toISOString(),
        status: 'incomplet',
      });

      sentCount++;
      results.push({ email: profile.user_email, step: nextStep.step });
    }

    return Response.json({
      success: true,
      checked: incompleteProfiles.length,
      sent: sentCount,
      results,
    });
  } catch (error) {
    console.error('[relanceLivreurs] ERROR:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});