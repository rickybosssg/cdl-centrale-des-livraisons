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
    const users = await base44.asServiceRole.entities.User.filter(
      { email: email.trim().toLowerCase() },
      null,
      1
    );

    if (!users || users.length === 0) {
      return Response.json(
        { success: false, error: 'Email ou mot de passe incorrect' },
        { status: 401 }
      );
    }

    const user = users[0];

    // Vérifier le rôle admin
    const ADMIN_EMAILS = ['weezyh2@gmail.com'];
    const isAdmin = user.role === 'admin' || ADMIN_EMAILS.includes(user.email);

    if (!isAdmin) {
      return Response.json(
        { success: false, error: 'Accès administrateur refusé' },
        { status: 403 }
      );
    }

    // Validation mot de passe hashé avec Web Crypto
    if (!user.hashed_password) {
      return Response.json(
        { success: false, error: 'Aucun mot de passe configuré' },
        { status: 500 }
      );
    }

    // Décoder le hash stocké (salt + hash)
    const combined = new Uint8Array(atob(user.hashed_password).split('').map(c => c.charCodeAt(0)));
    const salt = combined.slice(0, 16);
    const storedHash = combined.slice(16);
    
    // Dériver la clé du mot de passe fourni
    const encoder = new TextEncoder();
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
    
    // Exporter et comparer
    const exported = await crypto.subtle.exportKey('raw', key);
    const derivedHash = new Uint8Array(exported);
    
    const isValid = derivedHash.every((val, idx) => val === storedHash[idx]);
    if (!isValid) {
      return Response.json(
        { success: false, error: 'Email ou mot de passe incorrect' },
        { status: 401 }
      );
    }

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
    return Response.json(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    );
  }
});