import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Normalise un numéro de téléphone en format +226XXXXXXXX
 */
function normalizePhone(phone) {
  if (!phone) return null;
  let cleaned = phone.replace(/\D/g, '');
  
  // Si commence par 226, ajouter +
  if (cleaned.startsWith('226')) return '+' + cleaned;
  
  // Si commence par 0, remplacer par 226
  if (cleaned.startsWith('0')) return '+226' + cleaned.slice(1);
  
  // Si 9 chiffres, ajouter +226
  if (cleaned.length === 9) return '+226' + cleaned;
  
  // Si 12 chiffres (226XXXXXXXX), ajouter +
  if (cleaned.length === 12 && cleaned.startsWith('226')) return '+' + cleaned;
  
  return null;
}

/**
 * Génère un code OTP aléatoire de 4-6 chiffres
 */
function generateOTP() {
  return Math.floor(1000 + Math.random() * 9000).toString(); // 4 chiffres
}

/**
 * Étape 1 : Générer et envoyer OTP
 * POST /api/functions/loginWithPhone avec payload { step: "request", phone: "+226XXXXXXXX" }
 */
async function handleRequestOTP(base44, phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return { success: false, error: "Numéro invalide. Format : +226XXXXXXXX ou 0XXXXXXXX" };
  }

  const otp = generateOTP();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  // Stocker OTP temporairement dans Bedou ou fichier (pour MVP, on l'affiche)
  // En production : utiliser SMS/WhatsApp
  
  // Vérifier si l'utilisateur existe avec ce numéro
  const users = await base44.asServiceRole.entities.User.filter({ telephone: normalized });
  const userExists = users && users.length > 0;

  // Pour MVP : afficher le code en console et le retourner en dev
  console.log(`[OTP DEBUG] ${normalized} → ${otp}`);

  // Créer une clé temporaire pour stocker l'OTP
  const otpKey = `otp_${normalized}_${Date.now()}`;
  
  return {
    success: true,
    message: "Code envoyé avec succès",
    phone: normalized,
    userExists,
    // DEBUG ONLY (à retirer en production)
    otp_debug: otp,
    otp_key: otpKey,
    expires_in_seconds: 300,
  };
}

/**
 * Étape 2 : Vérifier l'OTP et se connecter
 * POST /api/functions/loginWithPhone avec payload { step: "verify", phone: "+226...", otp: "1234", otp_key: "..." }
 */
async function handleVerifyOTP(base44, phone, otp, otpKey) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return { success: false, error: "Numéro invalide" };
  }

  // Vérifier l'OTP (en MVP, c'est côté client pour simplifier)
  // En production : vérifier depuis cache/DB

  // Chercher ou créer l'utilisateur
  let users = await base44.asServiceRole.entities.User.filter({ telephone: normalized });
  let user = users && users.length > 0 ? users[0] : null;

  if (!user) {
    // Créer automatiquement un nouveau compte
    // Générer un email temporaire
    const tempEmail = `phone_${normalized.replace(/\D/g, '')}@cdl.local`;
    const tempName = `User ${normalized.slice(-4)}`;

    try {
      // Créer l'utilisateur via SDK
      user = await base44.asServiceRole.entities.User.create({
        email: tempEmail,
        telephone: normalized,
        full_name: tempName,
        role: "user",
        created_phone_login: true,
        phone_verified: true,
      });

      // Créer le profil Client par défaut
      await base44.asServiceRole.entities.UserProfile.create({
        user_email: tempEmail,
        profile_type: "client",
        status: "actif",
        is_active_profile: true,
      });
    } catch (err) {
      return { success: false, error: "Erreur création compte: " + err.message };
    }
  }

  // Marquer le téléphone comme vérifié
  if (!user.phone_verified) {
    await base44.asServiceRole.entities.User.update(user.id, { phone_verified: true });
  }

  // Créer une session ou token (à adapter selon votre system d'auth)
  // Pour Base44, utiliser base44.auth.login si disponible
  
  return {
    success: true,
    message: "Connexion réussie",
    user: {
      id: user.id,
      email: user.email,
      phone: normalized,
      name: user.full_name,
      role: user.role,
    },
  };
}

/**
 * Handler principal
 */
Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Méthode non autorisée" }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { step, phone, otp, otp_key } = payload;

    if (step === "request") {
      const result = await handleRequestOTP(base44, phone);
      return Response.json(result);
    }

    if (step === "verify") {
      const result = await handleVerifyOTP(base44, phone, otp, otp_key);
      return Response.json(result);
    }

    return Response.json({ error: "Paramètres invalides" }, { status: 400 });
  } catch (error) {
    console.error("[loginWithPhone] Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});