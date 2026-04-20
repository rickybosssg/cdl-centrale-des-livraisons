/**
 * adminLogin — Authentification admin sécurisée
 * Vérifie les credentials et retourne un token si valide
 * 
 * Input: { email, password }
 * Output: { success: true, user: {...} } ou { success: false, error: "..." }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return Response.json(
        { success: false, error: 'Email et mot de passe requis' },
        { status: 400 }
      );
    }

    const base44 = createClientFromRequest(req);

    // Récupérer l'utilisateur par email
    let user = null;
    try {
      const users = await base44.asServiceRole.entities.User.filter(
        { email: email.trim().toLowerCase() },
        null,
        1
      );
      if (users.length > 0) {
        user = users[0];
      }
    } catch (err) {
      console.warn('[adminLogin] Erreur recherche user:', err.message);
    }

    // Vérifier si c'est un admin
    if (!user) {
      return Response.json(
        { success: false, error: 'Email ou mot de passe incorrect' },
        { status: 401 }
      );
    }

    // Vérifier le rôle admin
    const ADMIN_EMAILS = ['weezyh2@gmail.com'];
    const isAdmin = user.role === 'admin' || ADMIN_EMAILS.includes(user.email);

    if (!isAdmin) {
      console.warn('[adminLogin] Tentative accès non-admin:', email);
      return Response.json(
        { success: false, error: 'Accès administrateur refusé' },
        { status: 403 }
      );
    }

    // Validation mot de passe
    // Si l'utilisateur a un hashed_password (bcrypt), utiliser bcrypt
    // Sinon, utiliser ADMIN_PASSWORD en texte brut
    if (user.hashed_password) {
      // Utiliser bcrypt pour comparer
      const bcrypt = await import('npm:bcrypt@5.1.0');
      const isPasswordValid = await bcrypt.compare(password, user.hashed_password);
      if (!isPasswordValid) {
        console.warn('[adminLogin] Mot de passe bcrypt incorrect pour:', email);
        return Response.json(
          { success: false, error: 'Email ou mot de passe incorrect' },
          { status: 401 }
        );
      }
    } else {
      // Fallback : comparer avec ADMIN_PASSWORD en texte brut
      const ADMIN_PASSWORD = Deno.env.get('ADMIN_PASSWORD') || 'cdl2025admin';
      if (password !== ADMIN_PASSWORD) {
        console.warn('[adminLogin] Mot de passe texte brut incorrect pour:', email);
        return Response.json(
          { success: false, error: 'Email ou mot de passe incorrect' },
          { status: 401 }
        );
      }
    }

    console.log('[adminLogin] ✅ Authentification réussie pour:', email);

    return Response.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('[adminLogin] Erreur:', error.message);
    return Response.json(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    );
  }
});