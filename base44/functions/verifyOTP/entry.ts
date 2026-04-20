/**
 * verifyOTP — Vérifier le code OTP et authentifier l'utilisateur
 * 
 * Input: { phone: "+226XXXXXXXX", code: "123456" }
 * Output: { success: true, token: "...", user: {...} }
 */
import { Twilio } from 'npm:twilio@4.27.0';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const verifyServiceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

    if (!accountSid || !authToken || !verifyServiceSid) {
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

    // Initialiser Twilio
    const client = new Twilio(accountSid, authToken);

    // Vérifier le code via Twilio Verify
    const verificationCheck = await client.verify.v2
      .services(verifyServiceSid)
      .verificationChecks.create({
        to: phone,
        code: code,
      });

    console.log('[verifyOTP] Vérification pour', phone, '- Status:', verificationCheck.status);

    if (verificationCheck.status !== 'approved') {
      return Response.json(
        { error: 'Code OTP incorrect ou expiré' },
        { status: 401 }
      );
    }

    // Code correct — chercher/créer l'utilisateur
    const base44 = createClientFromRequest(req);

    // Chercher un utilisateur avec ce téléphone
    let user = null;
    let users = [];
    try {
      users = await base44.asServiceRole.entities.User.filter(
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
        // Générer un email temporaire basé sur le téléphone
        const tempEmail = `phone_${phone.replace(/\D/g, '')}@cdl.local`;
        
        // Créer l'utilisateur via SDK
        await base44.asServiceRole.entities.User.create({
          email: tempEmail,
          telephone: phone,
          full_name: phone, // nom temporaire
          role: 'user',
          created_by: 'phone_auth',
        });

        users = await base44.asServiceRole.entities.User.filter(
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

    // Générer un token d'authentification
    // NOTE: Base44 gère l'auth automatiquement — on retourne le user
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