/**
 * verifyOTPWithRedirect — Vérifier OTP et déterminer la redirection
 * 
 * Logique :
 * 1. Admin (+22655738247) → /admin-dashboard
 * 2. Utilisateur existant → redirection vers profil actif
 * 3. Nouvel utilisateur → page inscription
 * 
 * Input: { phone: "+226XXXXXXXX", code: "123456" }
 * Output: { success: true, redirect_url: "..." }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const verifyServiceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

    if (!accountSid || !authToken || !verifyServiceSid) {
      console.error('[verifyOTPWithRedirect] Configuration Twilio manquante');
      return Response.json(
        { error: 'Configuration Twilio manquante' },
        { status: 500 }
      );
    }

    const body = await req.json();
    let phone = body.phone || '';
    const code = body.code || '';

    // Normaliser le numéro au format international complet
    phone = phone.replace(/\s/g, '').trim();
    
    // Si c'est juste les 8 chiffres (55738247), ajouter le préfixe
    if (phone.length === 8 && /^\d{8}$/.test(phone)) {
      phone = '+226' + phone;
    }
    
    // Si c'est 226 + 8 chiffres sans le +, ajouter le +
    if (!phone.startsWith('+') && phone.startsWith('226')) {
      phone = '+' + phone;
    }
    
    // Si c'est 0 + 7 chiffres, convertir en +226
    if (phone.startsWith('0') && phone.length === 8) {
      phone = '+226' + phone.substring(1);
    }

    // Valider le format final : doit être +226 + 8 chiffres
    if (!/^\+226\d{8}$/.test(phone)) {
      console.error('[verifyOTPWithRedirect] Format numéro invalide après normalisation:', phone);
      return Response.json(
        { error: 'Numéro invalide. Format attendu: +226XXXXXXXX' },
        { status: 400 }
      );
    }

    if (!code || code.length !== 6) {
      return Response.json(
        { error: 'Code OTP invalide' },
        { status: 400 }
      );
    }

    console.log('[verifyOTPWithRedirect] ========== DEBUG ==========');
    console.log('[verifyOTPWithRedirect] Numéro normalisé:', phone);
    console.log('[verifyOTPWithRedirect] Numéro admin:', '+22655738247');
    console.log('[verifyOTPWithRedirect] Comparaison (===):', phone === '+22655738247');
    console.log('[verifyOTPWithRedirect] ===========================');

    // Appel API REST Twilio Verify
    const url = `https://verify.twilio.com/v2/Services/${verifyServiceSid}/VerificationCheck`;
    const auth = btoa(`${accountSid}:${authToken}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: phone,
        Code: code,
      }).toString(),
    });

    const data = await response.json();

    if (!response.ok || data.status !== 'approved') {
      console.warn('[verifyOTPWithRedirect] Code incorrect pour', phone);
      return Response.json(
        { error: 'Code OTP incorrect ou expiré' },
        { status: 401 }
      );
    }

    console.log('[verifyOTPWithRedirect] Code correct pour', phone);

    const base44 = createClientFromRequest(req);

    // ═══════════════════════════════════════════════════════════════
    // LOGIQUE DE REDIRECTION
    // ═══════════════════════════════════════════════════════════════

    // CAS 1 : Admin
    const isAdmin = phone === '+22655738247';
    console.log('[verifyOTPWithRedirect] DEBUG - isAdmin check:', isAdmin);
    
    if (isAdmin) {
      console.log('[verifyOTPWithRedirect] ✅ ADMIN détecté - numéro:', phone);
      return Response.json({
        success: true,
        redirect_url: '/admin-dashboard',
        user_type: 'admin',
      });
    }
    
    console.log('[verifyOTPWithRedirect] ℹ️ Pas un admin - numéro:', phone);

    // CAS 2 & 3 : Rechercher l'utilisateur
    let user = null;
    try {
      const users = await base44.asServiceRole.entities.User.filter(
        { telephone: phone },
        null,
        1
      );
      if (users.length > 0) {
        user = users[0];
      }
    } catch (err) {
      console.warn('[verifyOTPWithRedirect] Erreur recherche user:', err.message);
    }

    // CAS 2 : Utilisateur existant
    if (user) {
      console.log('[verifyOTPWithRedirect] Utilisateur existant:', user.email);

      // Récupérer le profil actif
      let activeProfile = null;
      try {
        const profiles = await base44.asServiceRole.entities.UserProfile.filter(
          {
            user_email: user.email,
            current_role: true,
          },
          null,
          1
        );
        if (profiles.length > 0) {
          activeProfile = profiles[0];
        }
      } catch (err) {
        console.warn('[verifyOTPWithRedirect] Erreur recherche profil:', err.message);
      }

      // Déterminer la redirection selon le profil actif
      let redirectUrl = '/';
      if (activeProfile) {
        const profileType = activeProfile.profile_type;
        const redirectMap = {
          client: '/',
          livreur: '/courses-disponibles',
          partenaire: '/dashboard-partenaire',
          commercial: '/', // À adapter
          annonceur: '/dashboard-annonceur',
        };
        redirectUrl = redirectMap[profileType] || '/';
      }

      console.log('[verifyOTPWithRedirect] Redirection vers:', redirectUrl);
      return Response.json({
        success: true,
        redirect_url: redirectUrl,
        user_type: 'existing',
      });
    }

    // CAS 3 : Nouvel utilisateur
    console.log('[verifyOTPWithRedirect] Nouvel utilisateur');

    // Créer l'utilisateur
    try {
      const tempEmail = `phone_${phone.replace(/\D/g, '')}@cdl.local`;

      await base44.asServiceRole.entities.User.create({
        email: tempEmail,
        telephone: phone,
        full_name: phone,
        role: 'user',
        created_by: 'phone_auth',
      });

      console.log('[verifyOTPWithRedirect] Utilisateur créé:', tempEmail);
    } catch (err) {
      console.error('[verifyOTPWithRedirect] Erreur création user:', err.message);
      return Response.json(
        { error: 'Erreur création compte' },
        { status: 500 }
      );
    }

    // Rediriger vers inscription + choix de profil
    return Response.json({
      success: true,
      redirect_url: '/complete-profile/new',
      user_type: 'new',
    });
  } catch (error) {
    console.error('[verifyOTPWithRedirect] Erreur:', error.message);
    return Response.json(
      { error: error.message || 'Erreur lors de la vérification' },
      { status: 500 }
    );
  }
});