/**
 * ensureSettlement — Cron CDL : settlement automatique des courses livrées bloquées
 *
 * Scan toutes les 15min les courses avec statut=livree + settlement_status=pending
 * et déclenche bedouEngine pour finaliser le paiement.
 *
 * Évite la dépendance à une relance manuelle admin.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Auth : admin uniquement (appelé par cron ou admin)
  let user = null;
  try { user = await base44.auth.me(); } catch (_) {}
  if (user && user.role !== 'admin') {
    return Response.json({ error: 'Admin requis' }, { status: 403 });
  }

  const now = new Date().toISOString();
  console.log(`[ENSURE_SETTLEMENT] start | ts=${now}`);

  // Chercher les courses livrées avec settlement pending
  const pendingCourses = await base44.asServiceRole.entities.Course.filter({
    statut: 'livree',
    settlement_status: 'pending',
  });

  if (!pendingCourses || pendingCourses.length === 0) {
    console.log('[ENSURE_SETTLEMENT] aucune course pending — OK');
    return Response.json({ success: true, processed: 0 });
  }

  console.log(`[ENSURE_SETTLEMENT] ${pendingCourses.length} course(s) pending trouvée(s)`);

  const results = [];

  for (const course of pendingCourses) {
    // Ignorer si pas de client ou pas de livreur
    if (!course.client_email || !course.livreur_email) {
      console.log(`[ENSURE_SETTLEMENT] SKIP course=${course.id} — missing client_email ou livreur_email`);
      results.push({ course_id: course.id, status: 'skipped', reason: 'missing_email' });
      continue;
    }

    // Ignorer les courses annulées ou supprimées mal synchronisées
    if (course.is_deleted) {
      results.push({ course_id: course.id, status: 'skipped', reason: 'is_deleted' });
      continue;
    }

    console.log(`[ENSURE_SETTLEMENT] processing course=${course.id} | client=${course.client_email} | livreur=${course.livreur_email} | montant=${course.prix}`);

    try {
      const bedouRes = await base44.asServiceRole.functions.invoke('bedouEngine', {
        action: 'finaliser_course',
        course_id: course.id,
        client_email: course.client_email,
        client_nom: course.client_name,
        livreur_email: course.livreur_email,
        livreur_nom: course.livreur_name,
        montant: course.prix || 0,
      });

      const data = bedouRes?.data;

      if (data?.success || data?.alreadyDone) {
        const gainLivreur = course.gain_livreur || Math.round((course.prix || 0) * 0.8);
        const commissionCdl = course.commission_cdl || ((course.prix || 0) - gainLivreur);
        const settledAt = new Date().toISOString();

        await base44.asServiceRole.entities.Course.update(course.id, {
          settlement_status: 'completed',
          settled_at: settledAt,
          statut_paiement: 'paye',
          statut_paiement_livreur: 'Payé',
          gain_livreur: gainLivreur,
          commission_cdl: commissionCdl,
          settlement_error: null,
        });

        // Notification livreur (fire-and-forget)
        base44.asServiceRole.entities.Notification.create({
          destinataire_email: course.livreur_email,
          destinataire_role: 'livreur',
          titre: '💰 Paiement reçu',
          message: `Course ${course.quartier_depart}→${course.quartier_arrivee} : +${gainLivreur?.toLocaleString()} FCFA crédités sur votre Bedou.`,
          type: 'success',
          lue: false,
          course_id: course.id,
          target_screen: '/mon-bedou',
          notification_key: `${course.livreur_email}__settlement__${course.id}`,
        }).catch(() => {});

        console.log(`[ENSURE_SETTLEMENT] OK | course=${course.id} | gain=${gainLivreur}`);
        results.push({ course_id: course.id, status: 'settled', gain_livreur: gainLivreur });
      } else {
        // Marquer l'erreur sur la course sans bloquer le reste
        const errMsg = data?.error || 'bedouEngine returned non-success';
        await base44.asServiceRole.entities.Course.update(course.id, {
          settlement_error: errMsg,
          settlement_status: data?.insuffisant ? 'failed' : 'pending',
        }).catch(() => {});

        // Notifier l'admin si solde insuffisant
        if (data?.insuffisant) {
          base44.asServiceRole.entities.Notification.create({
            destinataire_email: Deno.env.get('CDL_ADMIN_EMAIL') || 'weezyh2@gmail.com',
            destinataire_role: 'admin',
            titre: '⚠️ Settlement échoué — solde insuffisant',
            message: `Course ${course.id.slice(0, 8)} (${course.client_email}) : solde Bedou insuffisant pour régler ${course.prix} FCFA.`,
            type: 'danger',
            lue: false,
            course_id: course.id,
            target_screen: `/admin/profil/${course.client_email}`,
          }).catch(() => {});
        }

        console.error(`[ENSURE_SETTLEMENT] FAILED course=${course.id} | error=${errMsg}`);
        results.push({ course_id: course.id, status: 'failed', error: errMsg });
      }
    } catch (err) {
      console.error(`[ENSURE_SETTLEMENT] EXCEPTION course=${course.id} | ${err.message}`);
      await base44.asServiceRole.entities.Course.update(course.id, {
        settlement_error: err.message,
      }).catch(() => {});
      results.push({ course_id: course.id, status: 'exception', error: err.message });
    }
  }

  const settled = results.filter(r => r.status === 'settled').length;
  const failed = results.filter(r => r.status === 'failed' || r.status === 'exception').length;

  console.log(`[ENSURE_SETTLEMENT] done | settled=${settled} | failed=${failed} | total=${pendingCourses.length}`);
  return Response.json({ success: true, processed: pendingCourses.length, settled, failed, results });
});