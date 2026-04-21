/**
 * verifyOTPWithRedirect — Vérifier OTP, créer/trouver user, retourner credentials
 *
 * Flux :
 * 1. Vérifier le code OTP via Twilio
 * 2. Trouver l'utilisateur par téléphone dans UserProfile ou User
 * 3. Si nouveau → register() via SDK pour créer le compte
 * 4. Retourner login_email + login_password pour que le frontend crée la session
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Mot de passe déterministe basé sur le numéro — stable, jamais visible utilisateur
function derivePassword(phone) {
  const base = phone.replace(/\D/g, '');
  return `CDL_${base}_2025!Secure`;
}

function deriveEmail(phone) {
  const base = phone.replace(/\D/g, '');
  return `phone_${base}@cdl.local`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ success: false, error: 'Method must be POST' }, { status: 405 });
  }

  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN');
  const verifySid  = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

  if (!accountSid || !authToken || !verifySid) {
    return Response.json({ success: false, error: 'Configuration Twilio manquante' }, { status: 500 });
  }

  let body;
  try { body = await req.json(); }
  catch { return Response.json({ success: false, error: 'Invalid JSON body' }, { status: 400 }); }

  let phone = (body?.phone || '').replace(/\s/g, '').trim();
  const code = String(body?.code || '').trim();

  if (!phone) return Response.json({ success: false, error: 'phone requis' }, { status: 400 });
  if (!code)  return Response.json({ success: false, error: 'code requis' }, { status: 400 });

  // Normalisation numéro
  if (/^\d{8}$/.test(phone))          phone = '+226' + phone;
  else if (/^226\d{8}$/.test(phone))  phone = '+' + phone;
  else if (/^0\d{7}$/.test(phone))    phone = '+226' + phone.substring(1);

  if (!/^\+226\d{8}$/.test(phone)) {
    return Response.json({ success: false, error: 'Numéro invalide — format: +226XXXXXXXX' }, { status: 400 });
  }
  if (code.length !== 6) {
    return Response.json({ success: false, error: 'Code OTP doit faire 6 chiffres' }, { status: 400 });
  }

  console.log('[verifyOTP] ════ VERIFY ════ phone:', phone);

  // ─── 1. Vérifier OTP via Twilio ──────────────────────────────────────────
  const twilioUrl  = `https://verify.twilio.com/v2/Services/${verifySid}/VerificationCheck`;
  const twilioAuth = btoa(`${accountSid}:${authToken}`);

  let twilioRes;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${twilioAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: phone, Code: code }).toString(),
      signal: ctrl.signal,
    });
    clearTimeout(t);
  } catch (err) {
    if (err.name === 'AbortError') return Response.json({ success: false, error: 'Timeout Twilio' }, { status: 504 });
    throw err;
  }

  let twilioData;
  try { twilioData = await twilioRes.json(); }
  catch { return Response.json({ success: false, error: 'Réponse Twilio invalide' }, { status: 502 }); }

  if (!twilioRes.ok || twilioData?.status !== 'approved') {
    console.warn('[verifyOTP] ❌ Code refusé:', twilioData?.status);
    return Response.json({ success: false, error: 'Code OTP incorrect ou expiré', twilio_status: twilioData?.status }, { status: 401 });
  }

  console.log('[verifyOTP] ✅ Twilio approuvé pour:', phone);

  const base44 = createClientFromRequest(req);
  const ADMIN_PHONE = '+22655738247';
  const isAdminPhone = phone === ADMIN_PHONE;
  const tempEmail    = deriveEmail(phone);
  const tempPassword = derivePassword(phone);

  // ─── 2. Trouver l'utilisateur existant ───────────────────────────────────
  let existingUser = null;
  let isNewUser    = false;

  // Chercher dans UserProfile par téléphone
  try {
    const profiles = await base44.asServiceRole.entities.UserProfile.filter({ telephone: phone }, null, 1);
    if (profiles.length > 0) {
      const prof = profiles[0];
      // Récupérer le User correspondant
      const users = await base44.asServiceRole.entities.User.filter({ email: prof.user_email }, null, 1);
      if (users.length > 0) existingUser = users[0];
    }
  } catch (err) { console.warn('[verifyOTP] Recherche UserProfile:', err.message); }

  // Chercher dans User par téléphone directement
  if (!existingUser) {
    try {
      const found = await base44.asServiceRole.entities.User.filter({ telephone: phone }, null, 1);
      if (found.length > 0) existingUser = found[0];
    } catch (err) { console.warn('[verifyOTP] Recherche User.telephone:', err.message); }
  }

  // Chercher dans User par email généré (cas où déjà créé via register)
  if (!existingUser) {
    try {
      const found = await base44.asServiceRole.entities.User.filter({ email: tempEmail }, null, 1);
      if (found.length > 0) existingUser = found[0];
    } catch (err) { console.warn('[verifyOTP] Recherche User.email:', err.message); }
  }

  // ─── 3. Créer si nouveau ─────────────────────────────────────────────────
  if (!existingUser) {
    console.log('[verifyOTP] 📝 Nouveau user — register:', tempEmail);
    try {
      // Utiliser auth.register() — méthode plateforme pour créer un compte
      // Note: base44.auth (sans asServiceRole) fonctionne en backend function
      const regResult = await base44.auth.register({
        email: tempEmail,
        password: tempPassword,
      });
      console.log('[verifyOTP] ✅ Register OK:', regResult?.email || tempEmail, '| keys:', Object.keys(regResult || {}));

      // Récupérer le user créé
      const found = await base44.asServiceRole.entities.User.filter({ email: tempEmail }, null, 1);
      if (found.length > 0) {
        existingUser = found[0];
        // Mettre à jour téléphone et rôle
        await base44.asServiceRole.entities.User.update(existingUser.id, {
          telephone: phone,
          full_name: phone,
          role: isAdminPhone ? 'admin' : 'user',
        });
        existingUser.role = isAdminPhone ? 'admin' : 'user';
      }
      isNewUser = true;
    } catch (regErr) {
      console.error('[verifyOTP] ❌ Register échoué:', regErr.message);
      // Peut échouer si l'utilisateur existe déjà (race condition) — chercher à nouveau
      try {
        const found = await base44.asServiceRole.entities.User.filter({ email: tempEmail }, null, 1);
        if (found.length > 0) {
          existingUser = found[0];
          console.log('[verifyOTP] User trouvé après échec register (race condition):', existingUser.email);
        } else {
          return Response.json({ success: false, error: 'Impossible de créer le compte: ' + regErr.message }, { status: 500 });
        }
      } catch (_) {
        return Response.json({ success: false, error: 'Impossible de créer le compte: ' + regErr.message }, { status: 500 });
      }
    }
  } else {
    console.log('[verifyOTP] 👤 User existant trouvé:', existingUser.email, '| role:', existingUser.role);
    // S'assurer que le téléphone est enregistré
    if (!existingUser.telephone) {
      try { await base44.asServiceRole.entities.User.update(existingUser.id, { telephone: phone }); } catch (_) {}
    }
  }

  // Forcer role admin pour numéro admin
  if (isAdminPhone && existingUser?.role !== 'admin') {
    try {
      await base44.asServiceRole.entities.User.update(existingUser.id, { role: 'admin' });
      existingUser.role = 'admin';
    } catch (err) { console.warn('[verifyOTP] Force admin:', err.message); }
  }

  const userEmail = existingUser?.email || tempEmail;
  const userRole  = existingUser?.role  || 'user';

  // ─── 4. Déterminer redirect_url ───────────────────────────────────────────
  let redirectUrl = '/';

  if (isAdminPhone || userRole === 'admin') {
    redirectUrl = '/admin-dashboard';
  } else if (!isNewUser) {
    try {
      const profiles = await base44.asServiceRole.entities.UserProfile.filter(
        { user_email: userEmail, deleted: false }, null, 10
      );
      if (profiles.length > 0) {
        const active = profiles.find(p => p.status === 'actif') || profiles[0];
        const map = { client: '/', livreur: '/courses-disponibles', partenaire: '/dashboard-partenaire', commercial: '/', annonceur: '/dashboard-annonceur' };
        redirectUrl = map[active.profile_type] || '/';
        console.log('[verifyOTP] Profil actif:', active.profile_type, '→', redirectUrl);
      }
    } catch (err) { console.warn('[verifyOTP] Recherche profil:', err.message); }
  }

  console.log('[verifyOTP] ✅ OK | email:', userEmail, '| new:', isNewUser, '| redirect:', redirectUrl);

  return Response.json({
    success: true,
    login_email:    userEmail,
    login_password: tempPassword,
    redirect_url:   redirectUrl,
    user_type: isAdminPhone ? 'admin' : (isNewUser ? 'new' : 'existing'),
    user_id:   existingUser?.id,
    user_role: userRole,
    phone,
  });
});