import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import moment from "moment";

export default function DispatchModeSettings() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('auto');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [updatedBy, setUpdatedBy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(false);
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);

  // Helper pour ajouter un log
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString('fr-FR', { hour12: false });
    const log = `[${timestamp}] ${message}`;
    console.log(log);
    setLogs(prev => [log, ...prev].slice(0, 50));
  };

  const loadMode = async (source = 'init') => {
    addLog(`📥 loadMode START | source=${source}`);
    try {
      addLog(`🔌 Appel getDispatchMode...`);
      const res = await base44.functions.invoke('getDispatchMode', { _t: Date.now() });
      addLog(`✅ getDispatchMode RESPONSE | mode=${res.data.mode} | status=${res.status}`);
      
      const newMode = res.data.mode || 'auto';
      setMode(newMode);
      setUpdatedAt(res.data.updated_at);
      setUpdatedBy(res.data.updated_by);
      addLog(`📝 STATE UPDATED | mode=${newMode} | par=${res.data.updated_by}`);
    } catch (err) {
      addLog(`❌ loadMode ERROR | ${err.message}`);
      console.error(`[DISPATCH_MODE] loadMode ERROR | source=${source} |`, err.message, err.stack);
      toast.error(`Erreur: ${err.message}`);
    } finally {
      setLoading(false);
      addLog(`⏹️ loadMode END`);
    }
  };

  const handleChangeMode = async (newMode) => {
    if (mode === newMode || changing) {
      addLog(`⏭️ SKIP | déjà ${mode}`);
      return;
    }
    
    addLog(`🔄 ${mode} → ${newMode}`);
    setChanging(true);
    
    try {
      addLog(`📤 Appel setDispatchMode...`);
      const res = await base44.functions.invoke('setDispatchMode', { mode: newMode, _t: Date.now() });
      addLog(`📥 RESPONSE | success=${res.data?.success}`);
      
      if (!res.data?.success) {
        addLog(`❌ FAILED | ${res.data?.error}`);
        throw new Error(res.data?.error || 'Échec du changement de mode');
      }
      
      addLog(`✅ SUCCESS | mise à jour state`);
      setMode(newMode);
      setUpdatedAt(res.data.updated_at);
      setUpdatedBy(res.data.updated_by);
      
      toast.success(`Mode ${newMode === 'auto' ? 'automatique' : 'manuel'} activé`);
      addLog(`🔄 Refresh...`);
      await loadMode('post-change');
    } catch (error) {
      addLog(`❌ ERROR | ${error.message}`);
      console.error(`[DISPATCH_MODE_CHANGE] ERROR |`, error.message, error.stack);
      toast.error(`Erreur: ${error.message}`);
      await loadMode('error-recovery');
    } finally {
      setChanging(false);
      addLog(`⏹️ END`);
    }
  };

  useEffect(() => {
    addLog('📍 useEffect MOUNTED');
    loadMode('init');
    
    addLog('📡 Subscription DispatchModeState...');
    const unsubscribe = base44.entities.DispatchModeState.subscribe((event) => {
      addLog(`🔔 EVENT | ${event.type} | mode=${event.data?.mode}`);
      if (event.data) {
        setMode(event.data.mode);
        setUpdatedAt(event.data.updated_at);
        setUpdatedBy(event.data.updated_by);
      }
    });
    
    return () => {
      addLog('📍 useEffect UNMOUNT');
      unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Mode de Dispatch</h1>
            <p className="text-xs text-muted-foreground">
              {updatedAt && `Modifié ${moment(updatedAt).fromNow()} par ${updatedBy?.split('@')[0]}`}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowLogs(!showLogs)}
          className="text-xs"
        >
          {showLogs ? '🙈 Masquer' : '👁️ Logs'} ({logs.length})
        </Button>
      </div>

      {/* Panneau de logs */}
      {showLogs && (
        <Card className="bg-black text-green-400 font-mono text-xs">
          <CardContent className="p-3 max-h-64 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold">📋 Logs en temps réel</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLogs([])}
                className="h-6 text-xs"
              >
                🗑️ Clear
              </Button>
            </div>
            {logs.length === 0 ? (
              <p className="text-muted-foreground">Aucun log pour le moment</p>
            ) : (
              <div className="space-y-1">
                {logs.map((log, i) => (
                  <div key={i} className="border-l-2 border-green-600 pl-2 py-0.5">
                    {log}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Mode actuel */}
      <div className={`rounded-2xl border-2 p-6 ${mode === 'auto' ? 'bg-green-50 border-green-400' : 'bg-amber-50 border-amber-400'}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`h-3 w-3 rounded-full ${mode === 'auto' ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
          <div>
            <p className={`text-lg font-bold ${mode === 'auto' ? 'text-green-800' : 'text-amber-800'}`}>
              {mode === 'auto' ? '⚡ Dispatch automatique' : '🔧 Dispatch manuel'}
            </p>
            <p className={`text-sm ${mode === 'auto' ? 'text-green-700' : 'text-amber-700'}`}>
              {mode === 'auto' 
                ? 'Les courses sont assignées automatiquement' 
                : 'Assignation manuelle par admin requise'}
            </p>
          </div>
        </div>

        {/* Boutons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleChangeMode('auto')}
            disabled={changing || mode === 'auto'}
            className={`p-4 rounded-xl border-2 transition-all active:scale-95 disabled:opacity-50 ${
              mode === 'auto'
                ? 'border-green-400 bg-green-100'
                : 'border-green-300 bg-white hover:bg-green-50'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              {changing && mode !== 'auto' ? (
                <Loader2 className="h-5 w-5 animate-spin text-green-600" />
              ) : mode === 'auto' ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-green-600" />
              )}
              <span className={`font-bold ${mode === 'auto' ? 'text-green-800' : 'text-green-700'}`}>
                Auto
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Assignation auto</p>
          </button>

          <button
            onClick={() => handleChangeMode('manuel')}
            disabled={changing || mode === 'manuel'}
            className={`p-4 rounded-xl border-2 transition-all active:scale-95 disabled:opacity-50 ${
              mode === 'manuel'
                ? 'border-amber-400 bg-amber-100'
                : 'border-amber-300 bg-white hover:bg-amber-50'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              {changing && mode !== 'manuel' ? (
                <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
              ) : mode === 'manuel' ? (
                <CheckCircle2 className="h-5 w-5 text-amber-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-600" />
              )}
              <span className={`font-bold ${mode === 'manuel' ? 'text-amber-800' : 'text-amber-700'}`}>
                Manuel
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Assignation admin</p>
          </button>
        </div>
      </div>

      {/* Info */}
      <Card className="bg-muted/50">
        <CardContent className="p-4 text-xs text-muted-foreground space-y-2">
          <p className="font-semibold">⚠️ Important:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Seuls les admins peuvent changer le mode</li>
            <li>En mode manuel, aucune course n'est assignée automatiquement</li>
            <li>Changement immédiat et synchronisé en temps réel</li>
            <li>Toutes les modifications sont journalisées</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}