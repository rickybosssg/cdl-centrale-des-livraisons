import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// In-memory cache pour anti-brute-force (à adapter pour production)
const otpStore = new Map();
const attemptStore = new Map();

/**
 * Normalise un numéro de téléphone en format +226XXXXXXXX
 */
function normalizePhone(phone) {
  if (!phone) return null;
  let cleaned = phone.replace(/\D/g, '');

  // 8 chiffres BF → +226XXXXXXXX (format principal CDL)
  if (cleaned.length === 8) return '+226' + cleaned;

  // Si commence par 226, ajouter +
  if (cleaned.startsWith('226') && cleaned.length === 11) return '+' + cleaned;

  // Si commence par 0, remplacer par 226
  if (cleaned.startsWith('0') && cleaned.length === 9) return '+226' + cleaned.slice(1);

  // Si 9 chiffres sans 0, ajouter +226
  if (cleaned.length === 9) return '+226' + cleaned;

  // 12 chiffres (226XXXXXXXX), ajouter +
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
 * Anti-brute-force : vérifier et limiter tentatives
 */
function checkAttempts(phone) {
  const key = `attempts_${phone}`;
  const now = Date.now();
  const data = attemptStore.get(key);
  
  if (!data) {
    attemptStore.set(key, { count: 0, resetAt: now + 15 * 60 * 1000 }); // 15 min
    return { allowed: true, remaining: 5 };
  }
  
  if (now > data.resetAt) {
    data.count = 0;
    data.resetAt = now + 15 * 60 * 1000;
  }
  
  if (data.count >= 5) {
    return { allowed: false, remaining: 0, message: "Trop de tentatives. Réessayez dans 15 minutes." };
  }
  
  return { allowed: true, remaining: 5 - data.count };
}

/**
 * Envoyer OTP via WhatsApp
 */
async function sendOTPViaWhatsApp(phone, otp) {
  try {
    // Utiliser Twilio WhatsApp Business ou service local
    // Pour MVP : appel HTTP simple à un service WhatsApp
    const message = `CDL: Votre code de vérification est: ${otp}\nValide 5 minutes.`;
    
    // Option 1: Twilio WhatsApp (si clé TWILIO_AUTH_TOKEN disponible)
    const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioAccount = Deno.env.get('TWILIO_ACCOUNT_SID');
    
    if (twilioToken && twilioAccount) {
      const formData = new FormData();
      formData.append('From', 'whatsapp:+226XXXXXXXX'); // Remplacer par votre numéro Twilio
      formData.append('To', `whatsapp:${phone}`);
      formData.append('Body', message);
      
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioAccount}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${twilioAccount}:${twilioToken}`),
          },
          body: formData,
        }
      );
      
      return response.ok;
    }
    
    // Option 2: Service local (dev mode)
    console.log(`[WhatsApp] ${phone}: ${message}`);
    return true;
  } catch (err) {
    console.error('[WhatsApp Error]', err);
    return false; // Continuer même si WhatsApp échoue
  }
}

/**
 * Étape 1 : Générer et envoyer OTP
 */
async function handleRequestOTP(base44, phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return { success: false, error: "Numéro invalide. Format : +226XXXXXXXX ou 0XXXXXXXX" };
  }

  // Vérifier anti-brute-force
  const attempts = checkAttempts(normalized);
  if (!attempts.allowed) {
    return { success: false, error: attempts.message };
  }

  const otp = generateOTP();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  // Stocker OTP en mémoire
  const otpKey = `otp_${normalized}_${Date.now()}`;
  otpStore.set(otpKey, { otp, expiresAt, phone: normalized });
  
  // Nettoyer les OTP expirés
  for (const [key, data] of otpStore.entries()) {
    if (Date.now() > data.expiresAt) otpStore.delete(key);
  }
  
  // Vérifier si l'utilisateur existe
  const users = await base44.asServiceRole.entities.User.filter({ telephone: normalized });
  const userExists = users && users.length > 0;

  // Envoyer via WhatsApp
  const sent = await sendOTPViaWhatsApp(normalized, otp);
  
  console.log(`[OTP] ${normalized} → ${otp} (WhatsApp: ${sent ? 'OK' : 'RETRY'})`);

  return {
    success: true,
    message: sent ? "Code envoyé via WhatsApp" : "Code généré (WhatsApp indisponible)",
    phone: normalized,
    userExists,
    otp_debug: otp, // DEBUG
    otp_key: otpKey,
    expires_in_seconds: 300,
  };
}

/**
 * Étape 2 : Vérifier l'OTP et se connecter
 */
async function handleVerifyOTP(base44, phone, otp, otpKey) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return { success: false, error: "Numéro invalide" };
  }

  // Vérifier anti-brute-force
  const attempts = checkAttempts(normalized);
  if (!attempts.allowed) {
    return { success: false, error: attempts.message };
  }

  // Vérifier l'OTP depuis le store
  const otpData = otpStore.get(otpKey);
  if (!otpData || Date.now() > otpData.expiresAt) {
    // Incrémenter tentatives échouées
    const key = `attempts_${normalized}`;
    const data = attemptStore.get(key);
    if (data) data.count++;
    return { success: false, error: "Code expiré ou invalide" };
  }

  if (otpData.otp !== otp) {
    // Incrémenter tentatives échouées
    const key = `attempts_${normalized}`;
    const data = attemptStore.get(key);
    if (data) data.count++;
    return { success: false, error: "Code incorrect" };
  }

  // Nettoyer l'OTP utilisé
  otpStore.delete(otpKey);

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
    const normalized = phone ? normalizePhone(phone) : null;

    // Log chaque tentative
    const auditLog = {
      step,
      method: 'phone',
      identifier: normalized || phone,
      timestamp: new Date().toISOString(),
    };

    if (step === "request") {
      const result = await handleRequestOTP(base44, phone);
      
      // Enregistrer la tentative
      try {
        await base44.asServiceRole.functions.invoke('auditLoginAttempt', {
          ...auditLog,
          error_code: result.success ? null : 'invalid_format',
          error_message: result.error || null,
        });
      } catch (_) {}
      
      return Response.json(result);
    }

    if (step === "verify") {
      const result = await handleVerifyOTP(base44, phone, otp, otp_key);
      
      // Enregistrer la tentative
      try {
        let errorCode = null;
        if (!result.success) {
          if (result.error.includes('Code expiré')) errorCode = 'expired_code';
          else if (result.error.includes('Code incorrect')) errorCode = 'wrong_code';
          else if (result.error.includes('Trop de tentatives')) errorCode = 'too_many_attempts';
        }
        
        await base44.asServiceRole.functions.invoke('auditLoginAttempt', {
          ...auditLog,
          step: 'verify',
          error_code: errorCode,
          error_message: result.error || null,
          user_id: result.user?.id,
          user_email: result.user?.email,
          user_phone: normalized,
        });
      } catch (_) {}
      
      return Response.json(result);
    }

    return Response.json({ error: "Paramètres invalides" }, { status: 400 });
  } catch (error) {
    console.error("[loginWithPhone] Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});