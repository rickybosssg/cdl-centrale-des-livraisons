import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * AUDIT + CORRECTION AUTOMATIQUE SYSTÈME BEDOU
 * Vérifie cohérence, crée Bedou manquants, corrige calculs, sécurise transactions
 */
Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user?.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const audit = {
      timestamp: new Date().toISOString(),
      checks: [],
      corrections: [],
      issues: [],
      stats: {},
    };

    console.log('[BEDOU AUDIT] Début audit complet...');

    // ========== 1. VÉRIFIER STRUCTURE BEDOU ==========
    audit.checks.push('✓ Vérification structure Bedou par profil');
    const allUsers = await base44.entities.User.list('-created_date', 500);
    const userProfiles = await base44.entities.UserProfile.list('-created_date', 1000);
    const bedouRecords = await base44.entities.Bedou.list('-created_date', 500);

    const bedouMap = new Map(bedouRecords.map(b => [`${b.user_email}_${b.role}`, b]));

    // ========== 2. CRÉER BEDOU MANQUANTS ==========
    audit.checks.push('✓ Création Bedou manquants');
    let createdCount = 0;

    for (const profile of userProfiles) {
      if (profile.deleted || !profile.user_email) continue;

      const key = `${profile.user_email}_${profile.profile_type}`;
      if (!bedouMap.has(key)) {
        // Créer Bedou manquant
        await base44.entities.Bedou.create({
          user_id: profile.user_email.split('@')[0],
          user_email: profile.user_email,
          user_nom: profile.user_email.split('@')[0],
          role: profile.profile_type,
          solde: 0,
          solde_disponible: 0,
          solde_bloque: 0,
          bonus: 0,
          gains_totaux: 0,
          depenses_totales: 0,
          statut_bedou: 'actif',
          date_creation: new Date().toISOString(),
        });
        createdCount++;
        bedouMap.set(key, { user_email: profile.user_email, role: profile.profile_type });
      }
    }

    if (createdCount > 0) {
      audit.corrections.push(`✅ ${createdCount} Bedou créé(s) pour profils orphelins`);
    }

    // ========== 3. VÉRIFIER ET CORRIGER CALCULS SOLDE ==========
    audit.checks.push('✓ Vérification cohérence soldes');
    let soldeErrors = 0;

    for (const bedou of bedouRecords) {
      const allTx = await base44.entities.Transaction.filter({ user_email: bedou.user_email, role: bedou.role }, '-created_date', 1000);
      
      let expectedSolde = 0;
      let expectedDisponible = 0;

      for (const tx of allTx) {
        if (!tx.statut || tx.statut === 'en_attente') continue; // Ignorer en attente
        
        const montant = parseFloat(tx.montant) || 0;
        if (tx.sens === 'credit') {
          expectedSolde += montant;
          expectedDisponible += montant;
        } else if (tx.sens === 'debit') {
          expectedSolde -= montant;
          expectedDisponible -= montant;
        }
      }

      const realSolde = parseFloat(bedou.solde) || 0;
      const realDisponible = parseFloat(bedou.solde_disponible) || 0;

      if (Math.abs(realSolde - expectedSolde) > 1 || Math.abs(realDisponible - expectedDisponible) > 1) {
        soldeErrors++;
        audit.issues.push(`❌ ${bedou.user_email} (${bedou.role}): solde incohérent (${realSolde}F vs ${expectedSolde}F attendu)`);
        
        // Corriger
        await base44.entities.Bedou.update(bedou.id, {
          solde: Math.max(0, expectedSolde),
          solde_disponible: Math.max(0, expectedDisponible),
        });
        audit.corrections.push(`✅ Solde ${bedou.user_email} corrigé`);
      }
    }

    // ========== 4. DÉTECTE TRANSACTIONS EN DOUBLON ==========
    audit.checks.push('✓ Détection transactions en doublon');
    const allTransactions = await base44.entities.Transaction.list('-created_date', 2000);
    const txMap = new Map();
    let duplicateCount = 0;

    for (const tx of allTransactions) {
      const key = `${tx.user_email}_${tx.reference_id}_${tx.montant}_${tx.type}`;
      if (txMap.has(key)) {
        // Possible doublon
        const prev = txMap.get(key);
        if (new Date(tx.created_date) - new Date(prev.created_date) < 5000) { // < 5s = doublon
          duplicateCount++;
          audit.issues.push(`❌ Transaction doublon: ${key}`);
        }
      }
      txMap.set(key, tx);
    }

    // ========== 5. VÉRIFIER TRANSACTIONS ORPHELINES ==========
    audit.checks.push('✓ Vérification transactions sans Bedou');
    let orphanCount = 0;

    for (const tx of allTransactions) {
      const bedou = bedouRecords.find(b => b.user_email === tx.user_email && b.role === tx.role);
      if (!bedou) {
        orphanCount++;
        audit.issues.push(`❌ Transaction orpheline: ${tx.user_email} (${tx.role}) - ID: ${tx.id}`);
      }
    }

    // ========== 6. VÉRIFIER INTÉGRITÉ RETRAITS/RECHARGES ==========
    audit.checks.push('✓ Vérification retraits et recharges');
    const retraits = await base44.entities.DemandeRetrait.list('-created_date', 500);
    const recharges = await base44.entities.DemandeRecharge.list('-created_date', 500);

    let retraitIssues = 0;
    for (const retrait of retraits) {
      if (retrait.statut === 'paye') {
        // Vérifier qu'une transaction débit existe
        const tx = await base44.entities.Transaction.filter({ reference_id: retrait.id, type: 'retrait' });
        if (tx.length === 0) {
          retraitIssues++;
          audit.issues.push(`❌ Retrait ${retrait.id} payé mais pas de transaction de débit`);
        }
      }
    }

    let rechargeIssues = 0;
    for (const recharge of recharges) {
      if (recharge.statut === 'valide') {
        // Vérifier qu'une transaction crédit existe
        const tx = await base44.entities.Transaction.filter({ reference_id: recharge.id, type: 'recharge' });
        if (tx.length === 0) {
          rechargeIssues++;
          audit.issues.push(`❌ Recharge ${recharge.id} validée mais pas de transaction crédit`);
        }
      }
    }

    // ========== 7. VÉRIFIER COMMISSIONS CDL ==========
    audit.checks.push('✓ Vérification commissions CDL');
    const courses = await base44.entities.Course.filter({ statut: 'livree' }, '-created_date', 500);
    let commissionIssues = 0;

    for (const course of courses) {
      if (!course.prix) continue;
      const expectedCommission = Math.round(parseFloat(course.prix) * 0.2);
      const cdlTx = await base44.entities.Transaction.filter({ 
        reference_id: course.id, 
        type: 'commission' 
      });

      if (cdlTx.length === 0 && expectedCommission > 0) {
        commissionIssues++;
        audit.issues.push(`❌ Course ${course.id}: commission CDL non enregistrée (${expectedCommission}F attendu)`);
      }
    }

    // ========== 8. STATS FINALES ==========
    audit.stats = {
      totalUsers: allUsers.length,
      totalProfiles: userProfiles.filter(p => !p.deleted).length,
      totalBedou: bedouRecords.length,
      totalTransactions: allTransactions.length,
      bedouCreated: createdCount,
      soldeErrorsFixed: soldeErrors,
      duplicateFound: duplicateCount,
      orphanTransactions: orphanCount,
      retraitIssues,
      rechargeIssues,
      commissionIssues,
      totalIssuesFound: audit.issues.length,
      totalCorrections: audit.corrections.length,
    };

    audit.status = audit.issues.length === 0 ? 'HEALTHY' : 'ISSUES_FOUND';

    console.log('[BEDOU AUDIT] Résultats:', JSON.stringify(audit.stats, null, 2));

    // Sauvegarder le rapport
    try {
      await base44.entities.SystemHealthReport.create({
        date_check: new Date().toISOString(),
        status: audit.status === 'HEALTHY' ? 'healthy' : 'warning',
        modules_checked: JSON.stringify(['Bedou Structure', 'Solde Calculations', 'Transactions', 'Retraits', 'Recharges', 'Commissions']),
        errors_detected: audit.issues.length,
        errors_fixed: audit.corrections.length,
        errors_critical: 0,
        report_json: JSON.stringify(audit),
        admin_notified: false,
        execution_time_ms: 0,
      });
    } catch (_) {}

    return Response.json({
      success: true,
      audit,
    });
  } catch (error) {
    console.error('[BEDOU AUDIT] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});