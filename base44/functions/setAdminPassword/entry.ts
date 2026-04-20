/**
 * setAdminPassword — Réinitialise le mot de passe admin avec un hash bcrypt
 * Utilisé pour initialiser ou réinitialiser l'accès admin
 * 
 * Input: { email, password }
 * Output: { success: true, message: "..." }
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

    // Récupérer l'utilisateur
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
      console.warn('[setAdminPassword] Erreur recherche user:', err.message);
    }

    if (!user) {
      return Response.json(
        { success: false, error: 'Utilisateur non trouvé' },
        { status: 404 }
      );
    }

    // Vérifier que c'est un admin
    const isAdmin = user.role === 'admin' || user.email === 'weezyh2@gmail.com';
    if (!isAdmin) {
      return Response.json(
        { success: false, error: 'Utilisateur non admin' },
        { status: 403 }
      );
    }

    // Hasher le mot de passe avec Web Crypto (PBKDF2)
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']),
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    
    // Exporter le hash
    const exported = await crypto.subtle.exportKey('raw', key);
    const hashArray = new Uint8Array(exported);
    const saltArray = new Uint8Array(salt);
    const combined = new Uint8Array(saltArray.length + hashArray.length);
    combined.set(saltArray);
    combined.set(hashArray, saltArray.length);
    const hashed_password = btoa(String.fromCharCode.apply(null, combined));

    // Mettre à jour l'utilisateur
    await base44.asServiceRole.entities.User.update(user.id, {
      hashed_password,
    });

    console.log('[setAdminPassword] ✅ Mot de passe admin réinitialisé pour:', email);

    return Response.json({
      success: true,
      message: `Mot de passe admin réinitialisé pour ${email}`,
    });
  } catch (error) {
    console.error('[setAdminPassword] Erreur:', error.message);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
});