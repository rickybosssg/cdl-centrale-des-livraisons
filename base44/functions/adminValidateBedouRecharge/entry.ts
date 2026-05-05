/**
 * adminValidateBedouRecharge — Validation Bedou admin principal
 *
 * Auth : email-only (weezyh2@gmail.com) — aucune dépendance au rôle JWT
 * Pas de vérification role, user_type, profils, current_role
 *
 * ⚠️ NE PAS MODIFIER le système push — sendCdlNotification appelé tel quel
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ADMIN_EMAIL = 'weezyh2@gmail.com';
const APP_ID = Deno.env.get('BASE44_APP_ID') || '69c3c74fc4b62396dca61751';

Deno.serve(async (req) => {
  const t0 = Date.now();

  // ── 1. Lire le body EN PREMIER (stream ne peut être lu qu'une fois) ─────────
  let body = {};
  try { body = await req.json(); } catch(_) {}

  const { request_id, action, comment } = body;
  console.log('[ADMIN_VALIDATE_START]', { request_id, action, comment: comment?.slice(0, 40) });

  // ── 2. Auth — lecture manuelle du token + email-only ──────────────────────
  // Sur APK Capacitor, le header Authorization doit être lu AVANT createClientFromRequest
  const rawAuth = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const tokenFromHeader = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7).trim() : rawAuth.trim();

  console.log('[ADMIN_VALIDATE_AUTH]', {
    header_present: !!rawAuth,
    token_length: tokenFromHeader.length,
    token_prefix: tokenFromHeader.slice(0, 20) || 'EMPTY',
  });

  const base44 = createClientFromRequest(req);
  let user = null;
  try {
    user = await base44.auth.me();
  } catch(e) {
    console.error('[ADMIN_VALIDATE_AUTH_ERROR]', {
      message: e.message,
      token_present: !!tokenFromHeader,
      reason_403: 'auth.me() threw — token invalide ou absent',
    });
    return Response.json({ error: 'Non authentifié', detail: e.message, token_present: !!tokenFromHeader }, { status: 401 });
  }

  console.log('[ADMIN_VALIDATE_AUTH]', {
    auth_user: user ? 'found' : 'null',
    auth_email: user?.email || 'null',
    token_valid: !!user,
    request_id,
    reason_403: user ? 'none' : 'user null après auth.me()',
  });

  if (!user) {
    return Response.json({ error: 'Non authentifié', token_present: !!tokenFromHeader }, { status: 401 });
  }

  // ── Vérification email uniquement — COURT-CIRCUIT ABSOLU pour ADMIN_EMAIL ─
  if (user.email === ADMIN_EMAIL) {
    console.log('[ADMIN_VALIDATE_AUTH] ✅ Court-circuit admin email — accès autorisé immédiatement');
    // Continuer sans aucune vérification supplémentaire
  } else {
    console.error('[ADMIN_VALIDATE_DENIED]', { auth_email: user.email, expected: ADMIN_EMAIL, reason_403: 'email ne correspond pas à ADMIN_EMAIL' });
    return Response.json({ error: 'Accès refusé — admin principal requis', user_email: user.email }, { status: 403 });
  }

  // ── 3. Validation des paramètres ──────────────────────────────────────────
  if (!request_id || !action) {
    return Response.json({ error: 'request_id et action requis' }, { status: 400 });
  }
  if (!['validate', 'refuse'].includes(action)) {
    return Response.json({ error: 'action doit être "validate" ou "refuse"' }, { status: 400 });
  }
  if (action === 'refuse' && !comment?.trim()) {
    return Response.json({ error: 'Commentaire obligatoire pour refus' }, { status: 400 });
  }

  // ── 4. Charger la demande (DemandeRecharge uniquement ici) ─────────────────
  let demande = null;
  try {
    demande = await base44.asServiceRole.entities.DemandeRecharge.get(request_id);
  } catch(e) {
    console.warn('[ADMIN_VALIDATE_GET_ERROR]', e.message);
  }

  // Fallback si get() échoue (certains backends renvoient 404 au lieu d'un objet)
  if (!demande) {
    try {
      const list = await base44.asServiceRole.entities.DemandeRecharge.filter({}, null, 500);
      demande = list?.find(d => d.id === request_id) || null;
    } catch(e) {
      console.warn('[ADMIN_VALIDATE_FILTER_ERROR]', e.message);
    }
  }

  console.log('[ADMIN_VALIDATE_DEMANDE]', { found: !!demande, id: demande?.id, statut: demande?.statut });

  if (!demande) {
    return Response.json({ error: 'Demande introuvable', request_id }, { status: 404 });
  }

  if (demande.statut !== 'en_attente') {
    return Response.json({
      error: `Demande déjà traitée (statut: ${demande.statut})`,
      already_processed: true,
      statut: demande.statut,
    }, { status: 409 });
  }

  const originalAuth = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const CDL_NOTIF_URL = `https://cdl.base44.app/api/apps/${APP_ID}/functions/sendCdlNotification`;

  const notify = async (payload) => {
    try {
      const res = await fetch(CDL_NOTIF_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(originalAuth ? { 'Authorization': originalAuth } : {}),
        },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      console.log('[ADMIN_VALIDATE_NOTIFY]', { status: res.status, sent: d.sent, bdd: d.bdd });
      return d;
    } catch(e) {
      console.warn('[ADMIN_VALIDATE_NOTIFY_ERROR]', e.message);
      return {};
    }
  };

  // ── REFUS ──────────────────────────────────────────────────────────────────
  if (action === 'refuse') {
    await base44.asServiceRole.entities.DemandeRecharge.update(request_id, {
      statut: 'refuse',
      motif_refus: comment.trim(),
      date_validation: new Date().toISOString(),
      valide_par: user.email,
    });

    await notify({
      user_email: demande.user_email,
      title: '❌ Recharge Bedou refusée',
      body: `Votre rechargement de ${(demande.montant || 0).toLocaleString()} F CFA a été refusé. Motif : ${comment.trim()}`,
      data: {
        type: 'bedou_recharge_rejected',
        entity_id: request_id,
        entity_type: 'DemandeRecharge',
        notif_route: '/mon-bedou',
      },
    });

    console.log('[ADMIN_VALIDATE_DONE]', { action: 'refuse', request_id, delay_ms: Date.now() - t0 });
    return Response.json({ success: true, action: 'refuse' });
  }

  // ── VALIDATION ─────────────────────────────────────────────────────────────
  const montantCredite = demande.montant_total || demande.montant || 0;
  const bonusAmount = demande.bonus || 0;
  const userName = demande.user_nom || demande.user_name || demande.user_email;

  // Charger ou créer le wallet Bedou
  let bedouList = [];
  try {
    bedouList = await base44.asServiceRole.entities.Bedou.filter({ user_email: demande.user_email });
  } catch(e) {
    console.warn('[ADMIN_VALIDATE_BEDOU_FILTER_ERROR]', e.message);
  }
  let b = bedouList?.[0];

  if (!b) {
    b = await base44.asServiceRole.entities.Bedou.create({
      user_email: demande.user_email,
      user_id: demande.user_id || '',
      user_nom: userName,
      role: 'client',
      solde: 0,
      solde_disponible: 0,
      solde_bloque: 0,
      solde_bonus: 0,
      bonus: 0,
      gains_totaux: 0,
      depenses_totales: 0,
      statut_bedou: 'actif',
      date_creation: new Date().toISOString(),
    });
    console.log('[ADMIN_VALIDATE_BEDOU_CREATED]', b.id);
  }

  const ancienSolde = b.solde || 0;
  const ancienDisponible = b.solde_disponible || 0;
  const nouveauSolde = ancienSolde + montantCredite;
  const nouveauDisponible = ancienDisponible + montantCredite;

  console.log('[ADMIN_VALIDATE_CREDIT]', { ancienSolde, montantCredite, nouveauSolde });

  // Créditer le solde
  await base44.asServiceRole.entities.Bedou.update(b.id, {
    solde: nouveauSolde,
    solde_disponible: nouveauDisponible,
  });

  // Créer la transaction
  await base44.asServiceRole.entities.Transaction.create({
    user_email: demande.user_email,
    user_nom: userName,
    role: 'client',
    type: 'recharge',
    montant: montantCredite,
    sens: 'credit',
    source: 'bedou',
    methode: demande.methode_paiement || 'interne',
    statut: 'valide',
    date_validation: new Date().toISOString(),
    valide_par: user.email,
    reference_id: request_id,
    description: `Recharge Bedou validée par admin`,
    source_validation: 'validation_admin',
  });

  // Marquer la demande comme validée
  await base44.asServiceRole.entities.DemandeRecharge.update(request_id, {
    statut: 'valide',
    date_validation: new Date().toISOString(),
    valide_par: user.email,
  });

  // Notifier le client (non-bloquant)
  const notifResult = await notify({
    user_email: demande.user_email,
    title: '✅ Recharge Bedou validée',
    body: `Votre compte a été crédité de ${montantCredite.toLocaleString()} F CFA.${bonusAmount > 0 ? ` (dont ${bonusAmount.toLocaleString()} F bonus)` : ''}`,
    data: {
      type: 'bedou_recharge_approved',
      entity_id: request_id,
      entity_type: 'DemandeRecharge',
      notif_route: '/mon-bedou',
      amount: String(montantCredite),
      user_id: demande.user_id || demande.user_email,
    },
  });

  const elapsed = Date.now() - t0;
  console.log('[ADMIN_VALIDATE_DONE]', { action: 'validate', request_id, ancien_solde: ancienSolde, nouveau_solde: nouveauSolde, montant_credite: montantCredite, fcm_sent: notifResult.sent || 0, delay_ms: elapsed });

  return Response.json({
    success: true,
    action: 'validate',
    request_id,
    user_email: demande.user_email,
    ancien_solde: ancienSolde,
    nouveau_solde: nouveauSolde,
    montant_credite: montantCredite,
    bonus: bonusAmount,
    fcm_sent: notifResult.sent || 0,
    fcm_failed: notifResult.failed || 0,
    notification_client_sent: (notifResult.sent || 0) > 0,
    delay_ms: elapsed,
  });
});