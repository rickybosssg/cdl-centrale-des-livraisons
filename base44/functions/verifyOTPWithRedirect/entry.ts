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
    // ✅ BLOCKER #1: Vérifier la méthode HTTP
    if (req.method !== 'POST') {
      return Response.json(
        { success: false, error: 'Method must be POST' },
        { status: 405 }
      );
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const verifyServiceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

    if (!accountSid || !authToken || !verifyServiceSid) {
      console.error('[verifyOTPWithRedirect] 🔴 Configuration Twilio manquante');
      return Response.json(
        { success: false, error: 'Configuration Twilio manquante — contacter admin' },
        { status: 500 }
      );
    }

    // ✅ BLOCKER #2: Vérifier le body et les paramètres
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return Response.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'object') {
      return Response.json(
        { success: false, error: 'Body must be JSON object' },
        { status: 400 }
      );
    }

    let phone = body?.phone || '';
    const code = body?.code || '';

    // ✅ BLOCKER #3: Vérifier phone et code présents
    if (!phone || typeof phone !== 'string') {
      return Response.json(
        { success: false, error: 'phone parameter required (string)' },
        { status: 400 }
      );
    }

    if (!code || typeof code !== 'string') {
      return Response.json(
        { success: false, error: 'code parameter required (string)' },
        { status: 400 }
      );
    }

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

    console.log('[verifyOTPWithRedirect] ════ VERIFY OTP WORKFLOW ════');
    console.log('[verifyOTPWithRedirect] Phone (normalized):', phone);
    console.log('[verifyOTPWithRedirect] Code:', code);

    // Appel API REST Twilio Verify
    const url = `https://verify.twilio.com/v2/Services/${verifyServiceSid}/VerificationCheck`;
    const auth = btoa(`${accountSid}:${authToken}`);

    console.log('[verifyOTPWithRedirect] 📞 Twilio API call (timeout 10s)...');

    let response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: phone,
          Code: code,
        }).toString(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
    } catch (fetchErr) {
      // ✅ BLOCKER #4: Timeout ou erreur réseau
      if (fetchErr.name === 'AbortError') {
        console.error('[verifyOTPWithRedirect] ❌ Timeout (>10s) calling Twilio');
        return Response.json(
          { success: false, error: 'Timeout vérification — réessayez' },
          { status: 504 }
        );
      }
      throw fetchErr;
    }

    let data;
    try {
      data = await response.json();
    } catch (parseErr) {
      console.error('[verifyOTPWithRedirect] ❌ Response not valid JSON');
      return Response.json(
        { success: false, error: 'Invalid Twilio response' },
        { status: 502 }
      );
    }

    // Vérifier le statut
    if (!response.ok || data?.status !== 'approved') {
      console.warn('[verifyOTPWithRedirect] ❌ Code incorrect:', { status: data?.status, message: data?.message });
      return Response.json(
        { 
          success: false,
          error: 'Code OTP incorrect ou expiré',
          step: 'verifyOTP',
          twilio_status: data?.status,
          twilio_message: data?.message,
        },
        { status: 401 }
      );
    }

    console.log('[verifyOTPWithRedirect] ✅ Code valide pour:', phone);

    let base44;
    try {
      base44 = createClientFromRequest(req);
      if (!base44) {
        throw new Error('base44 client not initialized');
      }
    } catch (err) {
      console.error('[verifyOTPWithRedirect] ❌ Base44 init failed:', err.message);
      return Response.json(
        { success: false, error: 'System error — contacter admin' },
        { status: 500 }
      );
    }

    const ADMIN_PHONE = '+22655738247';

    // ═══════════════════════════════════════════════════════════════
    // LOGIQUE DE REDIRECTION
    // ═══════════════════════════════════════════════════════════════

    // CAS 1 : Admin
    const isAdmin = phone === ADMIN_PHONE;
    console.log(`[verifyOTPWithRedirect] 🔍 Admin check: ${phone} === ${ADMIN_PHONE} ? ${isAdmin}`);
    
    if (isAdmin) {
      console.log('[verifyOTPWithRedirect] 👨‍💼 ADMIN DÉTECTÉ');
      return Response.json({
        success: true,
        redirect_url: '/admin-dashboard',
        user_type: 'admin',
        phone: phone,
      });
    }
    
    console.log('[verifyOTPWithRedirect] ℹ️ Utilisateur régulier - numéro:', phone);

    // CAS 2 & 3 : Rechercher l'utilisateur
    console.log('[verifyOTPWithRedirect] 🔍 Recherche utilisateur avec téléphone:', phone);
    let user = null;
    try {
      const users = await base44.asServiceRole.entities.User.filter(
        { telephone: phone },
        null,
        1
      );
      if (users.length > 0) {
        user = users[0];
        console.log('[verifyOTPWithRedirect] ✅ Utilisateur trouvé:', user.email);
      } else {
        console.log('[verifyOTPWithRedirect] ℹ️ Aucun utilisateur trouvé');
      }
    } catch (err) {
      console.warn('[verifyOTPWithRedirect] ⚠️ Erreur recherche user:', err.message);
    }

    // CAS 2 : Utilisateur existant
    if (user) {
      console.log('[verifyOTPWithRedirect] 👤 Utilisateur existant:', user.email);

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
          console.log('[verifyOTPWithRedirect] Profil actif:', activeProfile.profile_type);
        } else {
          console.log('[verifyOTPWithRedirect] ⚠️ Pas de profil actif');
        }
      } catch (err) {
        console.warn('[verifyOTPWithRedirect] ⚠️ Erreur recherche profil:', err.message);
      }

      // Déterminer la redirection selon le profil actif
      let redirectUrl = '/';
      if (activeProfile) {
        const profileType = activeProfile.profile_type;
        const redirectMap = {
          client: '/',
          livreur: '/courses-disponibles',
          partenaire: '/dashboard-partenaire',
          commercial: '/',
          annonceur: '/dashboard-annonceur',
        };
        redirectUrl = redirectMap[profileType] || '/';
      }

      console.log('[verifyOTPWithRedirect] 🔄 Redirection utilisateur existant vers:', redirectUrl);
      return Response.json({
        success: true,
        redirect_url: redirectUrl,
        user_type: 'existing',
        phone: phone,
        email: user.email,
      });
    }

    // CAS 3 : Nouvel utilisateur
    console.log('[verifyOTPWithRedirect] 📝 Nouvel utilisateur — création');

    try {
      const tempEmail = `phone_${phone.replace(/\D/g, '')}@cdl.local`;

      const newUser = await base44.asServiceRole.entities.User.create({
        email: tempEmail,
        telephone: phone,
        full_name: phone,
        role: 'user',
        created_by: 'phone_auth',
      });

      console.log('[verifyOTPWithRedirect] ✅ Utilisateur créé:', tempEmail);
    } catch (err) {
      console.error('[verifyOTPWithRedirect] ❌ Erreur création user:', err.message);
      return Response.json(
        { 
          success: false,
          error: 'Erreur création compte',
          step: 'createUser',
          details: err.message,
        },
        { status: 500 }
      );
    }

    console.log('[verifyOTPWithRedirect] 🔄 Redirection nouvel utilisateur vers inscription');
    return Response.json({
      success: true,
      redirect_url: '/complete-profile/new',
      user_type: 'new',
      phone: phone,
    });
  } catch (error) {
    console.error('[verifyOTPWithRedirect] Exception:', error?.message || String(error));
    return Response.json(
      { 
        success: false,
        error: error?.message || 'Erreur inattendue',
        step: 'verify_workflow',
      },
      { status: 500 }
    );
  }
});