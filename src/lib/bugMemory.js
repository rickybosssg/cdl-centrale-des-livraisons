/**
 * BUG MEMORY — Système de mémoire permanente des corrections
 * 
 * But : éviter de recorriger le même bug, consommer des crédits inutilement,
 * et permettre à Base44 de détecter automatiquement les régressions connues.
 * 
 * Usage :
 *   import { BugMemory } from '@/lib/bugMemory';
 *   BugMemory.check('cancel_course_403')  // retourne l'historique complet
 *   BugMemory.log()                       // affiche le rapport dans la console
 */

export const BUG_MEMORY = {

  // ─────────────────────────────────────────────────────────────────────────
  // BUG #1 — Annulation de course (client + admin)
  // ─────────────────────────────────────────────────────────────────────────
  cancel_course: {
    id: 'cancel_course',
    titre: 'Impossibilité d\'annuler une course (client ou admin) / Erreur 403',
    total_corrections: 7,
    statut: 'RESOLVED',
    derniere_correction: '2026-05-18',
    
    corrections: [
      {
        numero: 1,
        date: '2025 (early)',
        cause: 'Fonction cancelCourseAction inexistante — 404',
        fichiers: ['functions/cancelCourseAction.js'],
        solution: 'Création de la fonction unifiée',
        regression_cause: 'user.role non vérifié correctement → 403 pour certains admins',
      },
      {
        numero: 2,
        date: '2025',
        cause: 'Admin APK avait user_type="admin" mais role="user" → 403',
        fichiers: ['functions/cancelCourseAction.js'],
        solution: 'Ajout user.user_type === "admin" dans le check isAdmin',
        regression_cause: 'Comparaison email case-sensitive → faux 403 client',
      },
      {
        numero: 3,
        date: '2025',
        cause: 'user.email APK parfois en majuscules vs BDD minuscules → 403 client',
        fichiers: ['functions/cancelCourseAction.js'],
        solution: 'Normalisation .toLowerCase().trim() sur les deux emails avant comparaison',
        regression_cause: 'Subscription realtime réinjectait la course annulée dans les listes UI',
      },
      {
        numero: 4,
        date: '2025-2026',
        cause: 'UI GererCourses ne retirait pas la course après annulation admin',
        fichiers: ['components/AdminCourseActions.jsx', 'pages/dispatcher/GererCourses.jsx'],
        solution: 'Callback onDone avec mise à jour optimiste immédiate + pattern standardisé',
        regression_cause: 'GererCourses subscription update remplaçait (map) sans vérifier is_deleted',
      },
      {
        numero: 5,
        date: '2026 (session précédente)',
        cause: 'Event update post-delete réinjectait le fantôme dans GererCourses',
        fichiers: ['pages/dispatcher/GererCourses.jsx'],
        solution: 'Guard is_deleted dans subscription update → filter au lieu de map',
        regression_cause: 'ActiveCourseSummary subscription sans guard is_deleted',
      },
      {
        numero: 6,
        date: '2026 (session précédente)',
        cause: 'ActiveCourseSummary subscription create+update sans vérification is_deleted',
        fichiers: ['components/dashboard/ActiveCourseSummary.jsx'],
        solution: 'Ajout !ev.data.is_deleted dans les deux branches create et update',
        regression_cause: 'useDriverCourseAlert fallback Notification fetch sans garde statut',
      },
      {
        numero: 7,
        date: '2026-05-18',
        cause: 'useDriverCourseAlert fallback Notification pouvait réafficher une course annulée. useManualDispatchAlert update sans check is_deleted.',
        fichiers: [
          'hooks/useDriverCourseAlert.js',
          'hooks/useManualDispatchAlert.js',
        ],
        solution: 'Guard STATUTS_INVALIDES dans fallback Notification + effacement alerte sur update statut terminal',
        regression_cause: null, // Correction active — pas encore de régression connue
      },
    ],

    // ── Fichiers TOUS modifiés pour ce bug ────────────────────────────────
    fichiers_touches: [
      'functions/cancelCourseAction.js',
      'components/AdminCourseActions.jsx',
      'components/CancelCourseDialog.jsx',
      'pages/dispatcher/GererCourses.jsx',
      'components/dashboard/ActiveCourseSummary.jsx',
      'hooks/useDriverCourseAlert.js',
      'hooks/useManualDispatchAlert.js',
    ],

    // ── Scan global 2026-05-18 — toutes les subscriptions auditées ──────
    scan_global_2026_05_18: {
      date: '2026-05-18',
      total_subscriptions_scannees: 9,
      statut: 'COMPLET',
      vulnerables_trouvees: 5,
      vulnerables_corrigees: 5,
      fichiers_verouilles: [
        'pages/livreur/CoursesDisponibles.jsx',
        'pages/livreur/MesLivraisons.jsx',
        'pages/client/MesCourses.jsx',
        'pages/dispatcher/DispatchMonitor.jsx',
        'pages/staff/ManualDispatch.jsx',
      ],
    },

    // ── Subscriptions/hooks à vérifier en priorité si régression ─────────
    subscriptions_a_surveiller: [
      { fichier: 'pages/dispatcher/GererCourses.jsx',       description: 'Course.subscribe update — doit filter si is_deleted' },
      { fichier: 'components/dashboard/ActiveCourseSummary.jsx', description: 'Course.subscribe create+update — doit check !is_deleted' },
      { fichier: 'hooks/useDriverCourseAlert.js',            description: 'Course.subscribe + Notification.subscribe — doit ignorer statuts terminaux' },
      { fichier: 'hooks/useManualDispatchAlert.js',          description: 'Course.subscribe update — doit filter si is_deleted ou statut != en_attente' },
      { fichier: 'pages/livreur/CoursesDisponibles.jsx',     description: 'Course.subscribe create — vérifier !is_deleted (risque faible)' },
    ],

    // ── Pattern de détection de régression ───────────────────────────────
    detection_regression: {
      symptomes: [
        '403 Forbidden sur cancelCourseAction',
        'La course réapparaît dans GererCourses après annulation',
        'Course annulée toujours visible dans ActiveCourseSummary',
        'Alerte livreur affichée pour une course déjà annulée',
        'Bloc admin ManualDispatch affiche une course is_deleted=true',
      ],
      logs_a_chercher: [
        '[CANCEL_ACTION_ERROR] 403',
        '[CANCEL_ACTION_ERROR] not owner',
        '[REALTIME_PROPAGATED] subscription update',
        '[DRIVER_ALERT] Notification fallback showing course',
      ],
      checklist_verification: [
        '1. Vérifier functions/cancelCourseAction.js : isAdmin check inclut user.user_type',
        '2. Vérifier comparaison email toLowerCase dans cancel_client',
        '3. Vérifier GererCourses subscription : if is_deleted → filter, sinon map',
        '4. Vérifier ActiveCourseSummary : !ev.data.is_deleted dans create et update',
        '5. Vérifier useDriverCourseAlert : STATUTS_INVALIDES dans fallback + update',
        '6. Vérifier useManualDispatchAlert : || ev.data.is_deleted dans update',
      ],
    },
  },

};

// ─────────────────────────────────────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────────────────────────────────────

export const BugMemory = {

  /** Retourne l'historique complet d'un bug par son id */
  check(bugId) {
    const bug = BUG_MEMORY[bugId];
    if (!bug) {
      console.warn(`[BUG_MEMORY] Aucun historique pour le bug : "${bugId}"`);
      return null;
    }
    return bug;
  },

  /** Affiche un rapport lisible dans la console */
  log(bugId = null) {
    const bugs = bugId ? { [bugId]: BUG_MEMORY[bugId] } : BUG_MEMORY;
    console.group('📋 BUG MEMORY — Historique des corrections CDL');
    Object.values(bugs).forEach(bug => {
      if (!bug) return;
      console.group(`🐛 [${bug.id}] ${bug.titre}`);
      console.log(`   Statut         : ${bug.statut}`);
      console.log(`   Total corrections : ${bug.total_corrections}`);
      console.log(`   Dernière correction : ${bug.derniere_correction}`);
      console.log(`   Fichiers touchés :`, bug.fichiers_touches);
      console.group('   Corrections :');
      bug.corrections.forEach(c => {
        console.log(`   #${c.numero} [${c.date}] ${c.cause}`);
        console.log(`          → Solution : ${c.solution}`);
        if (c.regression_cause) console.log(`          → Régression car : ${c.regression_cause}`);
      });
      console.groupEnd();
      console.group('   Détection de régression :');
      console.log('   Symptômes :', bug.detection_regression.symptomes);
      console.log('   Checklist :', bug.detection_regression.checklist_verification);
      console.groupEnd();
      console.groupEnd();
    });
    console.groupEnd();
  },

  /** Vérifie si un symptôme correspond à un bug connu */
  detectFromSymptom(symptome) {
    const results = [];
    Object.values(BUG_MEMORY).forEach(bug => {
      const match = bug.detection_regression.symptomes.some(s =>
        symptome.toLowerCase().includes(s.toLowerCase()) ||
        s.toLowerCase().includes(symptome.toLowerCase())
      );
      if (match) results.push(bug);
    });
    if (results.length > 0) {
      console.warn(`[BUG_MEMORY] ⚠️ Ce symptôme correspond à ${results.length} bug(s) déjà corrigé(s) :`);
      results.forEach(b => console.warn(`  → [${b.id}] corrigé ${b.total_corrections}x — dernière correction : ${b.derniere_correction}`));
    }
    return results;
  },
};

// Auto-log au démarrage (développement uniquement)
if (import.meta.env?.DEV) {
  BugMemory.log();
}