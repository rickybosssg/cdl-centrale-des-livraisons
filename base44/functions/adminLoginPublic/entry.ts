/**
 * Connexion panneau admin — identifiants lus uniquement côté serveur (secrets Base44).
 * Définir : ADMIN_PANEL_EMAIL et ADMIN_PANEL_PASSWORD dans les variables d'environnement de la fonction.
 */
function adminCredentialsOk(email: string | undefined, password: string | undefined): boolean {
  const expectedEmail = (Deno.env.get('ADMIN_PANEL_EMAIL') || '').trim().toLowerCase();
  const expectedPassword = Deno.env.get('ADMIN_PANEL_PASSWORD') || '';
  if (!expectedEmail || !expectedPassword) {
    console.warn('[adminLoginPublic] ADMIN_PANEL_EMAIL / ADMIN_PANEL_PASSWORD non définis — connexion refusée');
    return false;
  }
  return (email || '').trim().toLowerCase() === expectedEmail && password === expectedPassword;
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (adminCredentialsOk(email, password)) {
      return Response.json({
        success: true,
        role: 'admin',
      });
    }

    return Response.json({
      success: false,
    });
  } catch {
    return Response.json({
      success: false,
    });
  }
});
