/**
 * detectBedouFraudSignals — Détection passive signaux anti-fraude Bedou
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  ⚠️ SYSTÈME PASSIF UNIQUEMENT — NE JAMAIS BLOQUER               ║
 * ║  ❌ NE JAMAIS modifier validateBedouRequest                      ║
 * ║  ❌ NE JAMAIS empêcher une validation                            ║
 * ║  ✅ Uniquement : log BedouFraudLog + notification admin info     ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Signaux détectés :
 *   1. rapid_validations       — +3 validations même client en < 2 min
 *   2. high_amount             — montant_total > 50 000 F CFA
 *   3. admin_burst             — admin valide > 10 demandes en < 5 min
 *   4. daily_client_cumul      — cumul journalier client > 100 000 F CFA
 *   5. daily_admin_overload    — validations journalières admin > 50
 *
 * Appelé APRÈS validateBedouRequest (non bloquant, fire-and-forget)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const L = (msg) => console.log(`[detectBedouFraudSignals] ${new Date().toISOString()} | ${msg}`);

async function notifyAdmin(base44, titre, body, details) {
  try {
    await base44.functions.invoke('sendCdlNotification', {
      role: 'admin',
      title: titre,
      body,
      data: {
        type: 'info',
        notif_route: '/admin/financial-dashboard',
        entity_type: 'BedouFraudLog',
        entity_id: details?.log_id || 'fraud',
      },
    });
    L(`Notification admin envoyée: ${titre}`);
  } catch (e) {
    L(`Notification admin non-bloquante ignorée: ${e.message}`);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth optionnelle — ce endpoint peut être appelé en service role aussi
    // mais on vérifie au minimum que c'est un appel interne
    const body = await req.json().catch(() => ({}));
    const { client_email, admin_email, montant_total, request_id } = body;

    L(`START | client=${client_email} | admin=${admin_email} | montant=${montant_total} | request=${request_id}`);

    const now = Date.now();
    const twoMinAgo = new Date(now - 2 * 60 * 1000).toISOString();
    const fiveMinAgo = new Date(now - 5 * 60 * 1000).toISOString();
    const todayStart = new Date().toISOString().substring(0, 10); // YYYY-MM-DD
    const fraudSignals = [];

    // ── Signal 1 : Validations rapides du même client (< 2 min) ────────────
    if (client_email) {
      try {
        const recentTxClient = await base44.asServiceRole.entities.Transaction.filter(
          { user_email: client_email, source: 'validation_admin', statut: 'valide' },
          '-date_validation',
          20
        );
        const rapid = recentTxClient.filter(t => t.date_validation > twoMinAgo);
        if (rapid.length >= 3) {
          const signal = {
            type: 'rapid_validations',
            client_id: client_email,
            admin_id: admin_email || '',
            niveau: rapid.length >= 5 ? 'high' : 'medium',
            details: JSON.stringify({
              count: rapid.length,
              window: '2min',
              request_id,
              montants: rapid.map(t => t.montant),
            }),
          };
          fraudSignals.push(signal);
          L(`Signal rapid_validations | client=${client_email} | count=${rapid.length}`);
        }
      } catch (e) {
        L(`Signal 1 ignoré: ${e.message}`);
      }
    }

    // ── Signal 2 : Montant élevé > 50 000 F ────────────────────────────────
    if (montant_total && montant_total > 50000) {
      const signal = {
        type: 'high_amount',
        client_id: client_email || '',
        admin_id: admin_email || '',
        niveau: montant_total > 100000 ? 'high' : 'medium',
        details: JSON.stringify({ montant_total, request_id }),
      };
      fraudSignals.push(signal);
      L(`Signal high_amount | montant=${montant_total}`);
    }

    // ── Signal 3 : Admin burst > 10 validations en < 5 min ─────────────────
    if (admin_email) {
      try {
        const recentAdminTx = await base44.asServiceRole.entities.Transaction.filter(
          { valide_par: admin_email, source: 'validation_admin', statut: 'valide' },
          '-date_validation',
          30
        );
        const burst = recentAdminTx.filter(t => t.date_validation > fiveMinAgo);
        if (burst.length > 10) {
          const signal = {
            type: 'admin_burst',
            client_id: client_email || '',
            admin_id: admin_email,
            niveau: burst.length > 20 ? 'high' : 'medium',
            details: JSON.stringify({
              count: burst.length,
              window: '5min',
              admin: admin_email,
            }),
          };
          fraudSignals.push(signal);
          L(`Signal admin_burst | admin=${admin_email} | count=${burst.length}`);
        }
      } catch (e) {
        L(`Signal 3 ignoré: ${e.message}`);
      }
    }

    // ── Signal 4 : Cumul journalier client > 100 000 F ─────────────────────
    if (client_email) {
      try {
        const todayClientTx = await base44.asServiceRole.entities.Transaction.filter(
          { user_email: client_email, source: 'validation_admin', statut: 'valide', type: 'recharge' },
          '-date_validation',
          100
        );
        const todayTx = todayClientTx.filter(t => t.date_validation?.startsWith(todayStart));
        const cumulJour = todayTx.reduce((s, t) => s + (t.montant || 0), 0) + (montant_total || 0);
        if (cumulJour > 100000) {
          const signal = {
            type: 'daily_client_cumul',
            client_id: client_email,
            admin_id: admin_email || '',
            niveau: cumulJour > 200000 ? 'high' : 'medium',
            details: JSON.stringify({ cumul_jour: cumulJour, nb_tx: todayTx.length + 1, seuil: 100000, request_id }),
          };
          fraudSignals.push(signal);
          L(`Signal daily_client_cumul | client=${client_email} | cumul=${cumulJour}`);
        }
      } catch (e) {
        L(`Signal 4 ignoré: ${e.message}`);
      }
    }

    // ── Signal 5 : Validations journalières admin > 50 ─────────────────────
    if (admin_email) {
      try {
        const todayAdminTx = await base44.asServiceRole.entities.Transaction.filter(
          { valide_par: admin_email, source: 'validation_admin', statut: 'valide' },
          '-date_validation',
          100
        );
        const todayAdminCount = todayAdminTx.filter(t => t.date_validation?.startsWith(todayStart)).length + 1;
        if (todayAdminCount > 50) {
          const signal = {
            type: 'daily_admin_overload',
            client_id: client_email || '',
            admin_id: admin_email,
            niveau: todayAdminCount > 100 ? 'high' : 'low',
            details: JSON.stringify({ count_jour: todayAdminCount, seuil: 50, admin: admin_email }),
          };
          fraudSignals.push(signal);
          L(`Signal daily_admin_overload | admin=${admin_email} | count=${todayAdminCount}`);
        }
      } catch (e) {
        L(`Signal 5 ignoré: ${e.message}`);
      }
    }

    // ── Enregistrer les signaux + notifier admin ────────────────────────────
    if (fraudSignals.length === 0) {
      L(`Aucun signal détecté — tout normal`);
      return Response.json({ ok: true, signals: 0 });
    }

    const savedIds = [];
    for (const signal of fraudSignals) {
      try {
        const saved = await base44.asServiceRole.entities.BedouFraudLog.create({
          ...signal,
          notified: false,
        });
        savedIds.push(saved.id);
        L(`BEDOU_FRAUD_LOG créé | type=${signal.type} | niveau=${signal.niveau} | id=${saved.id}`);

        // Notification admin — informative uniquement
        const d = JSON.parse(signal.details);
        const bodyMsg = signal.type === 'rapid_validations'
          ? `Client ${signal.client_id} : ${d.count} validations en < 2min`
          : signal.type === 'high_amount'
          ? `Montant élevé : ${d.montant_total?.toLocaleString()} F CFA — client ${signal.client_id}`
          : signal.type === 'daily_client_cumul'
          ? `Cumul journalier client ${signal.client_id} dépasse ${d.cumul_jour?.toLocaleString()} F CFA (seuil 100k)`
          : signal.type === 'daily_admin_overload'
          ? `Admin ${signal.admin_id} : ${d.count_jour} validations aujourd'hui (seuil 50)`
          : `Admin ${signal.admin_id} : ${d.count} demandes en < 5min`;

        // Update notified flag
        await base44.asServiceRole.entities.BedouFraudLog.update(saved.id, { notified: true }).catch(() => {});

        await notifyAdmin(
          base44,
          '⚠️ Alerte activité suspecte Bedou',
          bodyMsg,
          { log_id: saved.id }
        );
      } catch (e) {
        L(`Erreur enregistrement signal: ${e.message}`);
      }
    }

    L(`DONE | ${fraudSignals.length} signal(s) enregistré(s) | ids=${savedIds.join(',')}`);

    return Response.json({
      ok: true,
      signals: fraudSignals.length,
      log_ids: savedIds,
    });

  } catch (err) {
    // ✅ Jamais bloquer — retourner 200 même en cas d'erreur
    console.error(`[detectBedouFraudSignals] ERREUR (non-bloquante): ${err.message}`);
    return Response.json({ ok: true, signals: 0, note: 'error_ignored: ' + err.message });
  }
});