/**
 * Vérification identifiants admin — ADMIN_PANEL_EMAIL / ADMIN_PANEL_PASSWORD (env).
 */
function adminCredentialsOk(email: string | undefined, password: string | undefined): boolean {
  const expectedEmail = (Deno.env.get('ADMIN_PANEL_EMAIL') || '').trim().toLowerCase();
  const expectedPassword = Deno.env.get('ADMIN_PANEL_PASSWORD') || '';
  if (!expectedEmail || !expectedPassword) {
    console.warn('[checkAdminCreds] ADMIN_PANEL_EMAIL / ADMIN_PANEL_PASSWORD non définis');
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
  } catch (err) {
    const e = err as Error;
    return Response.json({
      success: false,
      error: e.message,
    });
  }
});
