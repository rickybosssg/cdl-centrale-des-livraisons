import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatchMode } from "@/context/DispatchModeContext";
import { ArrowLeft, Settings, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import moment from "moment";

export default function DispatchModeSettings() {
  const navigate = useNavigate();
  const { mode, loading, setMode, updatedAt, updatedBy, refresh } = useDispatchMode();
  const [changing, setChanging] = useState(false);

  const handleChangeMode = async (newMode) => {
    if (mode === newMode) {
      console.log(`[DISPATCH_MODE_BUTTON_CLICK] SKIP — déjà ${newMode}`);
      return;
    }
    
    console.log(`[DISPATCH_MODE_BUTTON_CLICK] ${mode} → ${newMode}`);
    setChanging(true);
    try {
      console.log(`[DISPATCH_MODE_SET_START] Calling setDispatchMode("${newMode}")`);
      const result = await setMode(newMode);
      console.log(`[DISPATCH_MODE_SET_SUCCESS] Result:`, result);
      console.log(`[DISPATCH_MODE_SET_SUCCESS] Mode ${newMode} activé`);
      toast.success(`✅ Mode ${newMode === 'auto' ? 'automatique' : 'manuel'} activé`);
      await refresh();
    } catch (error) {
      console.error(`[DISPATCH_MODE_SET_ERROR] ${error.message}`);
      toast.error(`❌ Erreur: ${error.message}`);
    } finally {
      setChanging(false);
    }
  };

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
        <Button variant="ghost" size="icon" onClick={refresh}>
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      {/* Bandeau mode actuel */}
      <div className={`rounded-2xl border-2 p-6 ${mode === 'auto' ? 'bg-green-50 border-green-400' : 'bg-amber-50 border-amber-400'}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`h-3 w-3 rounded-full ${mode === 'auto' ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
          <div>
            <p className={`text-lg font-bold ${mode === 'auto' ? 'text-green-800' : 'text-amber-800'}`}>
              {mode === 'auto' ? '⚡ Dispatch automatique' : '🔧 Dispatch manuel'}
            </p>
            <p className={`text-sm ${mode === 'auto' ? 'text-green-700' : 'text-amber-700'}`}>
              {mode === 'auto' 
                ? 'Les courses sont assignées automatiquement aux livreurs éligibles' 
                : 'Toutes les courses nécessitent une assignation manuelle par un admin'}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleChangeMode('auto')}
            disabled={changing || mode === 'auto'}
            className={`p-4 rounded-xl border-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
              mode === 'auto'
                ? 'border-green-400 bg-green-100 cursor-default'
                : 'border-green-300 bg-white hover:bg-green-50'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              {changing && mode !== 'auto' ? (
                <Loader2 className="h-5 w-5 animate-spin text-green-600" />
              ) : mode === 'auto' ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <Settings className="h-5 w-5 text-green-600" />
              )}
              <span className={`font-bold ${mode === 'auto' ? 'text-green-800' : 'text-green-700'}`}>
                {changing && mode !== 'auto' ? 'Activation...' : 'Mode automatique'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Assignation automatique selon la proximité et les performances
            </p>
          </button>

          <button
            onClick={() => handleChangeMode('manuel')}
            disabled={changing || mode === 'manuel'}
            className={`p-4 rounded-xl border-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
              mode === 'manuel'
                ? 'border-amber-400 bg-amber-100 cursor-default'
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
                {changing && mode !== 'manuel' ? 'Passage en manuel...' : 'Mode manuel'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Un admin doit assigner manuellement chaque course
            </p>
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
            <li>Le changement de mode est immédiat et synchronisé en temps réel</li>
            <li>Toutes les modifications sont journalisées</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}