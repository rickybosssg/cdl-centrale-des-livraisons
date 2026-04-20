/**
 * adminLogin — Authentification admin 100% local
 * Pas de dépendances, validation hardcoded uniquement
 */

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (email === 'weezyh2@gmail.com' && password === 'cdl2025admin') {
      return Response.json({
        success: true,
        role: 'admin',
        source: 'hardcoded-test',
      });
    }

    return Response.json({
      success: false,
      source: 'hardcoded-test',
    });
  } catch {
    return Response.json({
      success: false,
      source: 'hardcoded-test',
    });
  }
});