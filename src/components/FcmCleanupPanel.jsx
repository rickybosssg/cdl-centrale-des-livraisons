/**
 * FcmCleanupPanel — Panneau admin de nettoyage des tokens FCM
 * Affiche le rapport + bouton de nettoyage sécurisé
 */
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, Trash2, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function FcmCleanupPanel() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [summary, setSummary] = useState(null);
  const [cleaned, setCleaned] = useState(false);

  const runDryRun = async () => {
    setLoading(true);
    setReport(null);
    setSummary(null);
    setCleaned(false);
    try {
      const res = await base44.functions.invoke('cleanupFcmTokensAdmin', { dry_run: true });
      setReport(res.data?.report);
      toast.success('Rapport généré');
    } catch (e) {
      toast.error('Erreur: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const runCleanup = async () => {
    if (!report) return toast.error('Générer le rapport d\'abord');
    if (!window.confirm(`Supprimer ${report.total_to_delete} tokens ? (${report.protected_last_active} protégés)`)) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke('cleanupFcmTokensAdmin', { dry_run: false });
      setReport(res.data?.report);
      setSummary(res.data?.summary);
      setCleaned(true);
      toast.success(`✅ Nettoyage terminé — ${res.data?.summary?.total_cleaned} tokens nettoyés`);
    } catch (e) {
      toast.error('Erreur: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          🧹 Nettoyage tokens FCM
          <span className="text-xs font-normal text-muted-foreground ml-1">Sécurisé — jamais de suppression du dernier token actif</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={runDryRun} disabled={loading} className="gap-1.5">
            {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Générer rapport
          </Button>
          {report && report.total_to_delete > 0 && !cleaned && (
            <Button variant="destructive" size="sm" onClick={runCleanup} disabled={loading} className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" />
              Nettoyer {report.total_to_delete} tokens
            </Button>
          )}
        </div>

        {report && (
          <div className="space-y-3">
            {/* Stats globales */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { label: 'Total tokens', value: report.total_tokens, color: 'bg-blue-50 text-blue-800' },
                { label: 'Actifs', value: report.active_tokens, color: 'bg-green-50 text-green-800' },
                { label: 'Inactifs', value: report.inactive_tokens, color: 'bg-gray-50 text-gray-600' },
                { label: 'Doublons exacts', value: report.exact_duplicates, color: 'bg-orange-50 text-orange-700' },
                { label: 'Doublons device', value: report.device_duplicates, color: 'bg-amber-50 text-amber-700' },
                { label: 'Inactifs anciens', value: report.old_inactive_to_remove, color: 'bg-red-50 text-red-700' },
              ].map(s => (
                <div key={s.label} className={`p-2.5 rounded-lg text-center ${s.color}`}>
                  <p className="text-xl font-bold">{s.value}</p>
                  <p className="text-[10px] font-medium">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Protection */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-xs text-green-800">
              <ShieldCheck className="h-4 w-4 flex-shrink-0" />
              <span>{report.protected_last_active} utilisateur(s) protégé(s) — dernier token actif conservé</span>
            </div>

            {/* À supprimer */}
            {report.total_to_delete > 0 && !cleaned && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>{report.total_to_delete} token(s) à nettoyer (doublons + inactifs anciens)</span>
              </div>
            )}

            {/* Résultat nettoyage */}
            {summary && cleaned && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-xs text-green-800">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Nettoyage effectué ✅</p>
                  <p>Doublons exacts supprimés: {summary.exact_duplicates_deleted}</p>
                  <p>Doublons device archivés: {summary.device_duplicates_archived}</p>
                  <p>Inactifs anciens supprimés: {summary.old_inactive_deleted}</p>
                  <p className="font-semibold mt-1">Total nettoyé: {summary.total_cleaned} | Protégés: {summary.protected}</p>
                </div>
              </div>
            )}

            {/* Top users */}
            {report.tokens_by_user?.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-2">Tokens par utilisateur (top 10)</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {report.tokens_by_user.slice(0, 10).map(u => (
                    <div key={u.email} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/40">
                      <span className="truncate flex-1 text-muted-foreground">{u.email}</span>
                      <div className="flex gap-2 ml-2 flex-shrink-0">
                        <span className="text-green-700 font-semibold">✅{u.active}</span>
                        <span className="text-gray-500">⬜{u.inactive}</span>
                        <span className="font-bold">{u.total}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}