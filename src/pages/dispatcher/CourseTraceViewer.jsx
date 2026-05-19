/**
 * CourseTraceViewer — Page admin /course-trace
 * Visualiser le trace log d'une course en temps réel.
 * Activer/désactiver le mode trace depuis cette page.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, Trash2, Copy, Play, Square } from 'lucide-react';
import CourseTrace from '@/lib/CourseTrace';

const EVENT_COLORS = {
  STATUT_TRANSITION: 'bg-blue-50 border-blue-300 text-blue-900',
  REALTIME_EVENT:    'bg-purple-50 border-purple-300 text-purple-900',
  BACKEND_CALL:      'bg-amber-50 border-amber-300 text-amber-900',
  BACKEND_OK:        'bg-green-50 border-green-300 text-green-900',
  SET_STATE:         'bg-teal-50 border-teal-300 text-teal-900',
  MOUNT:             'bg-gray-50 border-gray-300 text-gray-700',
  REDIRECT:          'bg-orange-50 border-orange-300 text-orange-900',
  ERROR:             'bg-red-50 border-red-300 text-red-900',
  INITIAL_LOAD:      'bg-indigo-50 border-indigo-300 text-indigo-900',
  TRACE_ACTIVATED:   'bg-green-100 border-green-400 text-green-900',
  LIVREE_LOCK_BLOCKED: 'bg-yellow-50 border-yellow-300 text-yellow-800',
  default:           'bg-gray-50 border-gray-200 text-gray-700',
};

export default function CourseTraceViewer() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [courseId, setCourseId] = useState('');
  const [inputId, setInputId] = useState('');
  const [log, setLog] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      // Récupérer l'ID actif si déjà configuré
      const active = CourseTrace.getActiveId();
      if (active) {
        setCourseId(active);
        setInputId(active);
      }
    });
  }, []);

  const refresh = useCallback(() => {
    setLog(CourseTrace.getLog());
  }, []);

  useEffect(() => {
    refresh();
    if (!autoRefresh) return;
    const t = setInterval(refresh, 1000);
    return () => clearInterval(t);
  }, [autoRefresh, refresh]);

  const handleActivate = () => {
    const id = inputId.trim();
    if (!id) return;
    CourseTrace.activate(id);
    setCourseId(id);
    setLog([]);
    setAutoRefresh(true);
  };

  const handleDeactivate = () => {
    CourseTrace.deactivate();
    setCourseId('');
    setAutoRefresh(false);
    setLog([]);
  };

  const handleCopy = () => {
    const text = CourseTrace.exportText();
    try {
      navigator.clipboard.writeText(text);
      alert('Log copié dans le presse-papiers');
    } catch(_) {
      alert(text);
    }
  };

  const isAdmin = user?.role === 'admin';

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Accès réservé aux administrateurs</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">🔍 Course Trace Viewer</h1>
          <p className="text-xs text-muted-foreground">Suivre une course de A→Z avec logs temps réel</p>
        </div>
      </div>

      {/* Contrôle activation */}
      <div className="rounded-xl border p-4 space-y-3 bg-card">
        <p className="text-sm font-semibold">Course à tracer</p>
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
            placeholder="ID de la course (ex: abc123...)"
            value={inputId}
            onChange={e => setInputId(e.target.value)}
          />
          {!courseId ? (
            <Button onClick={handleActivate} className="gap-1.5 bg-green-600 hover:bg-green-700">
              <Play className="w-4 h-4" /> Activer
            </Button>
          ) : (
            <Button onClick={handleDeactivate} variant="destructive" className="gap-1.5">
              <Square className="w-4 h-4" /> Arrêter
            </Button>
          )}
        </div>
        {courseId && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-xs text-green-800">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Trace active — course : <code className="font-mono font-bold">{courseId}</code>
          </div>
        )}
        <div className="flex gap-2 text-xs text-muted-foreground flex-wrap">
          <span>Sur APK :</span>
          <code className="bg-muted px-1 rounded">CDLTrace.activate('{courseId || 'COURSE_ID'}')</code>
          <span>puis</span>
          <code className="bg-muted px-1 rounded">CDLTrace.getLog()</code>
          <span>dans la console Chrome (USB debug)</span>
        </div>
      </div>

      {/* Contrôles log */}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={refresh} className="gap-1.5">
          <RefreshCw className="w-3 h-3" /> Rafraîchir
        </Button>
        <Button
          size="sm"
          variant={autoRefresh ? 'default' : 'outline'}
          onClick={() => setAutoRefresh(v => !v)}
          className="gap-1.5"
        >
          {autoRefresh ? '⏸ Auto-refresh ON' : '▶ Auto-refresh'}
        </Button>
        <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5">
          <Copy className="w-3 h-3" /> Copier
        </Button>
        <Button size="sm" variant="outline" onClick={() => { CourseTrace.clearLog(); setLog([]); }} className="gap-1.5 text-red-600">
          <Trash2 className="w-3 h-3" /> Vider
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{log.length} entrées</span>
      </div>

      {/* Log */}
      {log.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          {courseId ? 'En attente d\'événements... Déclenchez une action sur la course.' : 'Activez la trace pour une course ci-dessus.'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {log.map((entry, i) => {
            const colorClass = EVENT_COLORS[entry.event] || EVENT_COLORS.default;
            return (
              <div key={i} className={`rounded-lg border px-3 py-2 text-xs ${colorClass}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[10px] text-muted-foreground flex-shrink-0">{entry.ts}</span>
                      <span className="font-bold">{entry.source}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/60 border">{entry.event}</span>
                      {entry.from_statut && (
                        <span className="font-mono">
                          {entry.from_statut} → {entry.to_statut || '?'}
                        </span>
                      )}
                      {entry.fn && <span className="text-muted-foreground">fn={entry.fn}</span>}
                      {entry.trigger && <span className="text-muted-foreground">trg={entry.trigger}</span>}
                      {entry.subscription && <span className="text-muted-foreground">sub={entry.subscription}</span>}
                      {entry.event_type && <span className="text-muted-foreground">evt={entry.event_type}</span>}
                    </div>
                    {entry.error && (
                      <p className="mt-1 text-red-700 font-semibold">❌ {entry.error}</p>
                    )}
                    {entry.payload_summary && (
                      <p className="text-muted-foreground mt-0.5">{entry.payload_summary}</p>
                    )}
                    {entry.result_summary && (
                      <p className="text-muted-foreground">{entry.result_summary}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Guide APK */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">Guide APK (USB Debug)</p>
        <ol className="space-y-1 list-decimal list-inside">
          <li>Connecter le téléphone en USB</li>
          <li>Ouvrir <code className="bg-muted px-1 rounded">chrome://inspect</code> sur PC</li>
          <li>Inspecter la WebView CDL</li>
          <li>Dans la console : <code className="bg-muted px-1 rounded">CDLTrace.activate('COURSE_ID')</code></li>
          <li>Déclencher les actions sur l'APK</li>
          <li>Lire les logs <code className="bg-muted px-1 rounded">[TRACE]</code> en temps réel</li>
          <li>Ou copier : <code className="bg-muted px-1 rounded">CDLTrace.exportText()</code></li>
        </ol>
        <p className="pt-1">Filtre adb logcat : <code className="bg-muted px-1 rounded">adb logcat | grep TRACE</code></p>
      </div>
    </div>
  );
}