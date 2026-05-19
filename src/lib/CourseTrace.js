/**
 * CourseTrace — MODE TRACE COURSE UNIQUE
 *
 * Activation : localStorage.setItem('CDL_TRACE_COURSE_ID', '<course_id>')
 * Désactivation : localStorage.removeItem('CDL_TRACE_COURSE_ID')
 *
 * Tous les logs sont préfixés [TRACE] et horodatés à la ms.
 * Lisible depuis Android Logcat : adb logcat | grep TRACE
 * Lisible depuis Chrome DevTools sur APK (USB debugging).
 *
 * ZÉRO effet sur les performances si la trace est désactivée.
 */

let _traceId = null;
let _log = [];
const MAX_LOG = 200;

function getActiveCourseId() {
  try { return localStorage.getItem('CDL_TRACE_COURSE_ID') || null; } catch(_) { return null; }
}

function ts() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

/**
 * Logguer un événement de trace.
 * Appelé depuis n'importe quel composant / hook / fonction.
 *
 * @param {string} source   — composant ou hook (ex: 'CourseLivreur', 'useDriverCourseAlert')
 * @param {string} event    — type d'événement (ex: 'STATUT_CHANGE', 'SUBSCRIBE_EVENT', 'RENDER')
 * @param {object} data     — données contextuelles (statuts, emails, ids...)
 */
function trace(source, event, data = {}) {
  const activeId = getActiveCourseId();
  if (!activeId) return; // Trace désactivée

  // Filtrer sur la course tracée seulement
  const courseId = data.course_id || data.id || data.courseId || '';
  if (courseId && courseId !== activeId) return;

  const entry = {
    ts: ts(),
    ms: Date.now(),
    source,
    event,
    ...data,
  };

  _log.unshift(entry);
  if (_log.length > MAX_LOG) _log.length = MAX_LOG;

  // Console structurée — visible dans adb logcat + DevTools
  const line = `[TRACE][${entry.ts}] ${source} | ${event}` +
    (data.from_statut || data.old_statut ? ` | ${data.from_statut || data.old_statut} → ${data.to_statut || data.new_statut || '?'}` : '') +
    (data.hook ? ` | hook=${data.hook}` : '') +
    (data.subscription ? ` | sub=${data.subscription}` : '') +
    (data.trigger ? ` | trigger=${data.trigger}` : '') +
    (data.error ? ` | ERROR=${data.error}` : '');

  if (data.error) {
    console.error(line, data);
  } else {
    console.log(line, data);
  }
}

/**
 * Trace spécifique aux transitions de statut — le plus important.
 */
function traceTransition({ course_id, from_statut, to_statut, source, trigger, extra = {} }) {
  trace(source, 'STATUT_TRANSITION', {
    course_id,
    from_statut,
    to_statut,
    trigger,
    ...extra,
  });
}

/**
 * Trace un événement realtime reçu (subscription).
 */
function traceRealtimeEvent({ course_id, event_type, statut, source, subscription, extra = {} }) {
  trace(source, 'REALTIME_EVENT', {
    course_id,
    event_type,
    statut,
    subscription,
    ...extra,
  });
}

/**
 * Trace un setState React (source de render).
 */
function traceSetState({ course_id, source, field, old_value, new_value, trigger }) {
  trace(source, 'SET_STATE', {
    course_id,
    field,
    old_value,
    new_value,
    trigger,
  });
}

/**
 * Trace une erreur.
 */
function traceError({ course_id, source, error, context = {} }) {
  trace(source, 'ERROR', {
    course_id,
    error: error?.message || String(error),
    stack: error?.stack?.slice(0, 200) || '',
    ...context,
  });
}

/**
 * Trace un appel backend.
 */
function traceBackend({ course_id, source, fn, payload_summary, result_summary }) {
  trace(source, 'BACKEND_CALL', {
    course_id,
    fn,
    payload_summary,
    result_summary,
  });
}

/**
 * Retourne le log complet (pour affichage dans l'UI admin ou export).
 */
function getLog() {
  return [..._log];
}

/**
 * Vide le log.
 */
function clearLog() {
  _log = [];
  console.log('[TRACE] Log vidé');
}

/**
 * Activer la trace pour une course.
 */
function activate(courseId) {
  try {
    localStorage.setItem('CDL_TRACE_COURSE_ID', courseId);
    _log = [];
    console.log(`[TRACE] ACTIVÉ pour course=${courseId}`);
    trace('CourseTrace', 'TRACE_ACTIVATED', { course_id: courseId });
  } catch(_) {}
}

/**
 * Désactiver la trace.
 */
function deactivate() {
  try {
    localStorage.removeItem('CDL_TRACE_COURSE_ID');
    console.log('[TRACE] DÉSACTIVÉ');
  } catch(_) {}
}

/**
 * Exporter le log en texte brut (pour copier-coller).
 */
function exportText() {
  return _log.map(e =>
    `[${e.ts}] ${e.source} | ${e.event}` +
    (e.from_statut ? ` | ${e.from_statut}→${e.to_statut}` : '') +
    (e.error ? ` | ERR=${e.error}` : '') +
    (e.trigger ? ` | trg=${e.trigger}` : '')
  ).join('\n');
}

const CourseTrace = {
  trace,
  traceTransition,
  traceRealtimeEvent,
  traceSetState,
  traceError,
  traceBackend,
  getLog,
  clearLog,
  activate,
  deactivate,
  exportText,
  isActive: () => !!getActiveCourseId(),
  getActiveId: getActiveCourseId,
};

// Exposer globalement pour debug depuis la console APK
if (typeof window !== 'undefined') {
  window.CDLTrace = CourseTrace;
  // Commandes rapides console : CDLTrace.activate('xxx'), CDLTrace.getLog(), CDLTrace.exportText()
}

export default CourseTrace;