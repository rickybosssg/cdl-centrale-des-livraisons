/**
 * adminLogin — Authentification admin
 * Vérification simple basée sur email/mot de passe en clair pour les tests
 * 
 * Input: { email, password }
 * Output: { success: true, user: {...} } ou { success: false, error: "..." }
 */

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST required' }, { status: 405 });
  }

  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return Response.json(
        { success: false, error: 'Email et mot de passe requis' },
        { status: 400 }
      );
    }

    // Vérification simple pour les tests (email + password en dur)
    const ADMIN_CREDENTIALS = {
      'weezyh2@gmail.com': 'cdl2025admin',
    };

    const ADMIN_EMAILS = ['weezyh2@gmail.com'];
    const normalizedEmail = email.trim().toLowerCase();

    // Vérifier email
    if (!ADMIN_EMAILS.includes(normalizedEmail)) {
      return Response.json(
        { success: false, error: 'Email ou mot de passe incorrect' },
        { status: 401 }
      );
    }

    // Vérifier mot de passe
    if (ADMIN_CREDENTIALS[normalizedEmail] !== password) {
      return Response.json(
        { success: false, error: 'Email ou mot de passe incorrect' },
        { status: 401 }
      );
    }

    // Authentification réussie
    return Response.json({
      success: true,
      user: {
        email: normalizedEmail,
        full_name: 'Administrator',
        role: 'admin',
      },
    });

  } catch (error) {
    return Response.json(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    );
  }
});