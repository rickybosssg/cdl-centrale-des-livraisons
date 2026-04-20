/**
 * createAdminUser — Crée un utilisateur admin de démarrage
 * Pour initialisation uniquement — non sécurisé pour production
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Vérifier si on est en requête POST
    if (req.method !== 'POST') {
      return Response.json({ error: 'Méthode non autorisée' }, { status: 405 });
    }

    const body = await req.json();
    const { email, telephone, full_name, password } = body;

    if (!email || !telephone) {
      return Response.json(
        { error: 'Email et téléphone requis' },
        { status: 400 }
      );
    }

    // Chercher si l'utilisateur existe déjà
    let user = null;
    try {
      const users = await base44.asServiceRole.entities.User.filter(
        { email: email.toLowerCase().trim() },
        null,
        1
      );
      if (users.length > 0) {
        user = users[0];
      }
    } catch (err) {
      console.warn('[createAdminUser] Erreur recherche user:', err.message);
    }

    // Si n'existe pas, créer
    if (!user) {
      console.log('[createAdminUser] Création nouvel admin:', email);
      try {
        const newUser = await base44.asServiceRole.entities.User.create({
          email: email.toLowerCase().trim(),
          telephone: telephone.trim(),
          full_name: full_name || email.split('@')[0],
          role: 'admin',
        });
        user = newUser;
        console.log('[createAdminUser] ✅ Admin créé:', email);
      } catch (createErr) {
        console.error('[createAdminUser] Erreur création:', createErr.message);
        return Response.json(
          { error: 'Erreur création utilisateur: ' + createErr.message },
          { status: 500 }
        );
      }
    } else {
      // L'utilisateur existe — promouvoir en admin
      console.log('[createAdminUser] Utilisateur existe — promotion en admin:', email);
      try {
        await base44.asServiceRole.entities.User.update(user.id, {
          role: 'admin',
        });
        console.log('[createAdminUser] ✅ Admin promu:', email);
      } catch (updateErr) {
        console.error('[createAdminUser] Erreur promotion:', updateErr.message);
        return Response.json(
          { error: 'Erreur promotion: ' + updateErr.message },
          { status: 500 }
        );
      }
    }

    return Response.json({
      success: true,
      message: `✅ Admin créé/promu: ${email}`,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('[createAdminUser] Erreur:', error.message);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
});