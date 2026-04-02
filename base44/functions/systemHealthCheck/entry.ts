import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const startTime = Date.now();
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();

  if (user?.role !== 'admin') {
    return Response.json({ error: 'Admin only' }, { status: 403 });
  }

  const report = {
    date_check: new Date().toISOString(),
    modules_checked: [],
    errors: [],
    fixed: [],
    critical: [],
  };

  try {
    // 1. AUTHENTICATION & ACCOUNTS
    console.log('[HealthCheck] 1. Vérification comptes...');
    try {
      const users = await base44.entities.User.list('-created_date', 1000);
      const admins = users.filter(u => u.role === 'admin').length;
      
      // Vérifier doublons d'email
      const emailMap = new Map();
      users.forEach(u => {
        if (emailMap.has(u.email)) {
          report.errors.push(`❌ Doublon email: ${u.email}`);
        }
        emailMap.set(u.email, u);
      });

      report.modules_checked.push('authentication');
    } catch (err) {
      report.critical.push(`Auth check failed: ${err.message}`);
    }

    // 2. DATABASE INTEGRITY
    console.log('[HealthCheck] 2. Vérification intégrité DB...');
    try {
      const profiles = await base44.entities.UserProfile.list('-created_date', 1000);
      const users = await base44.entities.User.list('-created_date', 1000);

      // Profils orphelins
      const userEmails = new Set(users.map(u => u.email));
      const orphanedProfiles = profiles.filter(p => !userEmails.has(p.user_email));
      if (orphanedProfiles.length > 0) {
        report.errors.push(`⚠️ ${orphanedProfiles.length} profils orphelins détectés`);
        // Corriger les profils orphelins
        for (const p of orphanedProfiles) {
          try {
            await base44.entities.UserProfile.delete(p.id);
            report.fixed.push(`✅ Profil orphelin supprimé: ${p.id}`);
          } catch (_) {}
        }
      }

      report.modules_checked.push('database');
    } catch (err) {
      report.critical.push(`DB check failed: ${err.message}`);
    }

    // 3. COURSES MODULE
    console.log('[HealthCheck] 3. Vérification courses...');
    try {
      const courses = await base44.entities.Course.list('-created_date', 500);
      const blockedCourses = courses.filter(c => 
        c.statut === 'en_attente' && 
        new Date(c.created_date) < new Date(Date.now() - 24*60*60*1000)
      );

      if (blockedCourses.length > 0) {
        report.errors.push(`⚠️ ${blockedCourses.length} courses en attente > 24h`);
        // Marquer comme annulées
        for (const c of blockedCourses.slice(0, 10)) {
          try {
            await base44.entities.Course.update(c.id, { statut: 'annulee' });
            report.fixed.push(`✅ Course annulée (timeout): ${c.id}`);
          } catch (_) {}
        }
      }

      report.modules_checked.push('courses');
    } catch (err) {
      report.critical.push(`Courses check failed: ${err.message}`);
    }

    // 4. NOTIFICATIONS
    console.log('[HealthCheck] 4. Vérification notifications...');
    try {
      const notifs = await base44.entities.Notification.list('-created_date', 200);
      const unreadCount = notifs.filter(n => !n.lue).length;
      
      // Détecter doublons
      const msgMap = new Map();
      const duplicates = [];
      notifs.forEach(n => {
        const key = `${n.destinataire_email}-${n.titre}`;
        if (msgMap.has(key)) duplicates.push(n);
        msgMap.set(key, n);
      });

      if (duplicates.length > 0) {
        report.errors.push(`⚠️ ${duplicates.length} notifications dupliquées`);
        // Supprimer les doublons
        for (const dup of duplicates.slice(0, 5)) {
          try {
            await base44.entities.Notification.delete(dup.id);
            report.fixed.push(`✅ Notification dupliquée supprimée: ${dup.id}`);
          } catch (_) {}
        }
      }

      report.modules_checked.push('notifications');
    } catch (err) {
      report.critical.push(`Notifications check failed: ${err.message}`);
    }

    // 5. PROFILES & VALIDATION
    console.log('[HealthCheck] 5. Vérification profils...');
    try {
      const profiles = await base44.entities.UserProfile.list('-created_date', 500);
      const incompleteProfiles = profiles.filter(p => 
        p.status === 'incomplet' && 
        new Date(p.created_date) < new Date(Date.now() - 7*24*60*60*1000)
      );

      if (incompleteProfiles.length > 0) {
        report.errors.push(`⚠️ ${incompleteProfiles.length} profils incomplets > 7 jours`);
      }

      report.modules_checked.push('profiles');
    } catch (err) {
      report.critical.push(`Profiles check failed: ${err.message}`);
    }

    // 6. WALLETS & TRANSACTIONS
    console.log('[HealthCheck] 6. Vérification portefeuilles...');
    try {
      const bedous = await base44.entities.Bedou.list('-created_date', 500);
      const negative = bedous.filter(b => (b.solde || 0) < 0);

      if (negative.length > 0) {
        report.critical.push(`❌ ${negative.length} portefeuilles avec solde négatif`);
      }

      // Vérifier incohérences
      const txs = await base44.entities.Transaction.list('-created_date', 200);
      const blocked = txs.filter(t => t.statut === 'en_attente' && 
        new Date(t.created_date) < new Date(Date.now() - 48*60*60*1000)
      );

      if (blocked.length > 0) {
        report.errors.push(`⚠️ ${blocked.length} transactions bloquées > 48h`);
      }

      report.modules_checked.push('wallets');
    } catch (err) {
      report.critical.push(`Wallets check failed: ${err.message}`);
    }

    // 7. FCM TOKENS
    console.log('[HealthCheck] 7. Vérification FCM...');
    try {
      const tokens = await base44.entities.FcmToken.list('-created_date', 500);
      const stale = tokens.filter(t => 
        new Date(t.last_seen) < new Date(Date.now() - 30*24*60*60*1000)
      );

      if (stale.length > 0) {
        report.errors.push(`⚠️ ${stale.length} tokens FCM inactifs > 30 jours`);
        // Nettoyer les anciens
        for (const token of stale.slice(0, 20)) {
          try {
            await base44.entities.FcmToken.delete(token.id);
            report.fixed.push(`✅ Token FCM stale supprimé: ${token.id}`);
          } catch (_) {}
        }
      }

      report.modules_checked.push('fcm_tokens');
    } catch (err) {
      report.critical.push(`FCM check failed: ${err.message}`);
    }

  } catch (err) {
    console.error('[HealthCheck] Fatal error:', err);
    report.critical.push(`Fatal error: ${err.message}`);
  }

  // Déterminer le statut
  let status = 'healthy';
  if (report.critical.length > 0) status = 'critical';
  else if (report.errors.length > 0) status = 'warning';

  // Sauvegarder le rapport
  try {
    const reportRecord = await base44.entities.SystemHealthReport.create({
      date_check: report.date_check,
      status,
      modules_checked: JSON.stringify(report.modules_checked),
      errors_detected: report.errors.length,
      errors_fixed: report.fixed.length,
      errors_critical: report.critical.length,
      report_json: JSON.stringify(report),
      execution_time_ms: Date.now() - startTime,
    });

    // Notifier admin si critique
    if (status === 'critical') {
      try {
        await base44.entities.Notification.create({
          destinataire_email: user.email,
          destinataire_role: 'admin',
          titre: '🚨 ALERTE SYSTÈME - Problèmes détectés',
          message: `${report.critical.length} problème(s) critique(s) détecté(s). ${report.errors.length} erreur(s) en attente. ${report.fixed.length} correction(s) automatique(s).`,
          type: 'danger',
          lue: false,
        });
      } catch (_) {}
    }

    console.log(`[HealthCheck] ✅ Rapport sauvegardé: ${status}`);
  } catch (err) {
    console.error('[HealthCheck] Failed to save report:', err);
  }

  return Response.json({
    success: true,
    status,
    summary: {
      errors_detected: report.errors.length,
      errors_fixed: report.fixed.length,
      critical_issues: report.critical.length,
      modules_checked: report.modules_checked.length,
      execution_time_ms: Date.now() - startTime,
    },
  });
});