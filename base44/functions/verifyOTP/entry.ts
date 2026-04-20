/**
 * verifyOTP — Vérifier le code OTP et authentifier l'utilisateur
 * 
 * Input: { phone: "+226XXXXXXXX", code: "123456" }
 * Output: { success: true, user: {...} }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const verifyServiceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

    if (!accountSid || !authToken || !verifyServiceSid) {
      console.error('[verifyOTP] Configuration Twilio manquante');
      return Response.json(
        { error: 'Configuration Twilio manquante' },
        { status: 500 }
      );
    }

    const body = await req.json();
    let phone = body.phone || '';
    const code = body.code || '';

    // Normaliser le numéro
    phone = phone.replace(/\s/g, '');
    if (!phone.startsWith('+')) {
      if (phone.startsWith('226')) {
        phone = '+' + phone;
      } else if (phone.startsWith('0')) {
        phone = '+226' + phone.substring(1);
      } else {
        phone = '+226' + phone;
      }
    }

    // Valider les entrées
    if (!/^\+226\d{8}$/.test(phone)) {
      return Response.json(
        { error: 'Numéro invalide' },
        { status: 400 }
      );
    }

    if (!code || code.length !== 6) {
      return Response.json(
        { error: 'Code OTP invalide' },
        { status: 400 }
      );
    }

    console.log('[verifyOTP] Vérification pour', phone);

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
      console.warn('[verifyOTP] Code incorrect pour', phone);
      return Response.json(
        { error: 'Code OTP incorrect ou expiré' },
        { status: 401 }
      );
    }

    console.log('[verifyOTP] Code correct pour', phone);

    // Code correct — chercher/créer l'utilisateur
    const base44 = createClientFromRequest(req);

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
      console.warn('[verifyOTP] Erreur recherche user:', err.message);
    }

    // Si l'utilisateur n'existe pas, le créer
    if (!user) {
      console.log('[verifyOTP] Création nouvel utilisateur avec téléphone:', phone);
      try {
        const tempEmail = `phone_${phone.replace(/\D/g, '')}@cdl.local`;
        
        await base44.asServiceRole.entities.User.create({
          email: tempEmail,
          telephone: phone,
          full_name: phone,
          role: 'user',
          created_by: 'phone_auth',
        });

        const users = await base44.asServiceRole.entities.User.filter(
          { telephone: phone },
          null,
          1
        );
        user = users[0];
      } catch (err) {
        console.error('[verifyOTP] Erreur création user:', err.message);
        return Response.json(
          { error: 'Erreur lors de la création du compte' },
          { status: 500 }
        );
      }
    }

    console.log('[verifyOTP] Authentification réussie pour:', user.email);

    return Response.json({
      success: true,
      message: 'Code OTP vérifié — Authentification réussie',
      user: {
        id: user.id,
        email: user.email,
        telephone: user.telephone,
        full_name: user.full_name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('[verifyOTP] Erreur:', error.message);
    return Response.json(
      { error: error.message || 'Erreur lors de la vérification' },
      { status: 500 }
    );
  }
});