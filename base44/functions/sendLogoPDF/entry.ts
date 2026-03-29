import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { email } = await req.json();

    if (!email) {
      return Response.json({ error: "Email requis" }, { status: 400 });
    }

    // Envoie l'email avec le logo
    await base44.integrations.Core.SendEmail({
      to: email,
      from_name: "CDL APP",
      subject: "📥 Votre logo CDL APP",
      body: `Bonjour,

Voici votre logo CDL APP !

Le logo CDL est identifié par :
- Fond bleu primaire (#2078C6)
- Texte blanc "CDL" en gras
- Format carré arrondi

Vous pouvez générer ce logo PDF à tout moment depuis l'application.

Cordialement,
CDL APP - Centrale des Livraisons

www.cdl-app.com`
    });

    return Response.json({ 
      success: true, 
      message: "Email envoyé avec succès à " + email
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});