import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

/**
 * Bouton admin — Resynchronisation globale des current_role
 * Corrige tous les utilisateurs dont l'interface est désynchronisée du current_role BDD.
 */
export default function SyncRolesButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const runDryRun = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke('syncAllUserRoles', { dry_run: true });
      setResult({ ...res.data, mode: 'dry_run' });
      if (res.data?.corrections_count === 0) {
        toast.success('✅ Tous les rôles sont cohérents, aucune correction nécessaire');
      } else {
        toast.warning(`⚠️ ${res.data.corrections_count} compte(s) désynchronisé(s) détecté(s)`);
      }
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    }
    setLoading(false);
  };

  const runFix = async () => {
    if (!window.confirm(`Corriger les rôles de ${result?.corrections_count || '?'} compte(s) désynchronisé(s) ? Cette action modifiera la base de données.`)) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke('syncAllUserRoles', { dry_run: false });
      setResult({ ...res.data, mode: 'fixed' });
      toast.success(`✅ ${res.data.corrections_count} compte(s) resynchronisé(s) avec succès`);
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        className="w-full border-purple-300 text-purple-700 hover:bg-purple-50"
        onClick={runDryRun}
        disabled={loading}
      >
        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Analyse...' : 'Analyser désynchronisations rôles'}
      </Button>

      {result && (
        <div className={`p-3 rounded-xl border text-xs space-y-1 ${
          result.corrections_count === 0
            ? 'bg-green-50 border-green-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          <div className="flex items-center gap-2 font-semibold">
            {result.corrections_count === 0
              ? <CheckCircle2 className="h-4 w-4 text-green-600" />
              : <AlertCircle className="h-4 w-4 text-amber-600" />
            }
            <span>{result.corrections_count === 0 ? 'Tout est synchronisé' : `${result.corrections_count} correction(s) nécessaire(s)`}</span>
          </div>
          <p className="text-muted-foreground">{result.total_users} utilisateurs analysés · {result.ok_count} OK · {result.corrections_count} à corriger</p>
          {result.corrections?.slice(0, 5).map((c, i) => (
            <p key={i} className="font-mono text-[10px] truncate">
              {c.email} : {c.before?.current_role || 'null'} → {c.after?.current_role}
            </p>
          ))}
          {result.corrections?.length > 5 && (
            <p className="text-muted-foreground">... et {result.corrections.length - 5} autres</p>
          )}
          {result.mode !== 'fixed' && result.corrections_count > 0 && (
            <Button
              size="sm"
              className="w-full mt-2 bg-amber-600 hover:bg-amber-700 text-white text-xs h-8"
              onClick={runFix}
              disabled={loading}
            >
              {loading ? 'Correction...' : `✅ Appliquer les corrections (${result.corrections_count})`}
            </Button>
          )}
          {result.mode === 'fixed' && (
            <p className="text-green-700 font-semibold mt-1">✅ Corrections appliquées en base</p>
          )}
        </div>
      )}
    </div>
  );
}