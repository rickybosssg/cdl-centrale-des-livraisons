/**
 * adminLogin — identifiants via variables d'environnement (ADMIN_PANEL_EMAIL, ADMIN_PANEL_PASSWORD).
 */
function adminCredentialsOk(email: string | undefined, password: string | undefined): boolean {
  const expectedEmail = (Deno.env.get('ADMIN_PANEL_EMAIL') || '').trim().toLowerCase();
  const expectedPassword = Deno.env.get('ADMIN_PANEL_PASSWORD') || '';
  if (!expectedEmail || !expectedPassword) {
    console.warn('[adminLogin] ADMIN_PANEL_EMAIL / ADMIN_PANEL_PASSWORD non définis — connexion refusée');
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
