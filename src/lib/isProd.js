/**
 * Utilitaire de garde production
 * En production : masquer tout élément debug, aucune trace technique visible
 */

export const IS_PROD = true; // Toujours true — CDL est en production

/**
 * Composant wrapper qui masque son contenu en production
 * Usage : <DebugOnly>...</DebugOnly>
 */
export function DebugOnly({ children }) {
  if (IS_PROD) return null;
  return children;
}

/**
 * Log conditionnel : silencieux en production
 */
export function devLog(...args) {
  if (!IS_PROD) {
    console.log('[DEV]', ...args);
  }
}

/**
 * Vérification rapide frontend (appelée manuellement ou au boot admin)
 * Retourne une liste d'anomalies détectées dans le DOM
 */
export function runFrontendAudit() {
  const anomalies = [];
  const fixes = [];

  // 1. Détecter textes debug visibles dans le DOM
  const debugPatterns = [
    'PUB COMPONENT ACTIVE',
    'DEBUG',
    'UserId:',
    'Loading...',
    '[object Object]',
    'undefined',
    'null',
    'COMPONENT MOUNTED',
    'TEST MODE',
  ];

  const allText = document.body.innerText || '';
  debugPatterns.forEach(pattern => {
    if (allText.includes(pattern)) {
      anomalies.push(`⚠️ Texte debug détecté dans le DOM : "${pattern}"`);
    }
  });

  // 2. Détecter éléments avec data-debug ou class debug
  const debugEls = document.querySelectorAll('[data-debug], .debug-panel, .debug-overlay, [class*="debug"]');
  if (debugEls.length > 0) {
    anomalies.push(`⚠️ ${debugEls.length} élément(s) avec attribut/classe debug détecté(s)`);
    // Masquer automatiquement
    debugEls.forEach(el => { el.style.display = 'none'; });
    fixes.push(`✅ ${debugEls.length} élément(s) debug masqué(s) automatiquement`);
  }

  // 3. Détecter console.error récents (via compteur)
  const errorCount = window.__cdl_error_count || 0;
  if (errorCount > 0) {
    anomalies.push(`⚠️ ${errorCount} erreur(s) console détectée(s) depuis le démarrage`);
  }

  // 4. Vérifier présence du header CDL
  const header = document.querySelector('header');
  if (!header) {
    anomalies.push('⚠️ Header de navigation absent');
  }

  return {
    timestamp: new Date().toISOString(),
    anomalies,
    fixes,
    status: anomalies.length === 0 ? 'healthy' : 'warning',
  };
}

// Compteur d'erreurs console global (installé au boot)
if (typeof window !== 'undefined') {
  window.__cdl_error_count = 0;
  const origError = console.error.bind(console);
  console.error = (...args) => {
    window.__cdl_error_count = (window.__cdl_error_count || 0) + 1;
    origError(...args);
  };
}