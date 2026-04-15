import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, PlayCircle, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export default function BedouAudit() {
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleAudit = async () => {
    setRunning(true);
    setLoading(true);
    try {
      const res = await base44.functions.invoke('bedouAuditFix', {});
      if (res.data?.success) {
        setResult(res.data.audit);
        toast.success(`✅ Audit complet: ${res.data.audit.stats.totalIssuesFound} problème(s) trouvé(s)`);
      } else {
        toast.error(res.data?.error || 'Erreur audit');
      }
    } catch (err) {
      toast.error(`Erreur: ${err.message}`);
    } finally {
      setLoading(false);
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-bold">Audit + Correction Bedou</h1>
      </div>

      {/* Bouton lancer audit */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-6">
          <p className="text-sm text-foreground mb-4">
            Cet outil vérifie l'intégrité complète du système Bedou et corrige automatiquement les incohérences :
          </p>
          <ul className="text-xs text-muted-foreground space-y-1 mb-4 ml-4">
            <li>✓ Structure Bedou pour chaque profil</li>
            <li>✓ Cohérence des soldes</li>
            <li>✓ Transactions orphelines/en doublon</li>
            <li>✓ Retraits et recharges</li>
            <li>✓ Commissions CDL</li>
          </ul>
          <Button
            onClick={handleAudit}
            disabled={running}
            className="w-full bg-primary hover:bg-primary/90"
          >
            <PlayCircle className="h-4 w-4 mr-2" />
            {running ? 'Audit en cours...' : 'Lancer audit complet'}
          </Button>
        </CardContent>
      </Card>

      {/* État audit en cours */}
      {running && (
        <Card className="border-blue-200 bg-blue-50 animate-pulse">
          <CardContent className="p-4 flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
            <div>
              <p className="font-semibold text-sm text-blue-700">🔄 Audit en cours...</p>
              <p className="text-xs text-blue-600">Vérification des wallets et transactions</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Résultats */}
      {result && (
        <div className="space-y-4">
          {/* Status */}
          <Card className={result.status === 'HEALTHY' ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}>
            <CardContent className="p-4 flex items-center gap-3">
              {result.status === 'HEALTHY' ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : (
                <AlertCircle className="h-6 w-6 text-amber-600" />
              )}
              <div>
                <p className="font-semibold text-sm">{result.status === 'HEALTHY' ? '✅ Système sain' : '⚠️ Problèmes détectés'}</p>
                <p className="text-xs text-muted-foreground">{result.stats.totalIssuesFound} problème(s), {result.stats.totalCorrections} correction(s)</p>
              </div>
            </CardContent>
          </Card>

          {/* Stats principales */}
          <div className="grid grid-cols-2 gap-2">
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">{result.stats.totalBedou}</p>
                <p className="text-[10px] text-muted-foreground">Wallets vérifiés</p>
              </CardContent>
            </Card>
            <Card className="border-purple-200 bg-purple-50">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-purple-600">{result.stats.totalTransactions}</p>
                <p className="text-[10px] text-muted-foreground">Transactions</p>
              </CardContent>
            </Card>
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{result.stats.bedouCreated || 0}</p>
                <p className="text-[10px] text-muted-foreground">Bedou créés</p>
              </CardContent>
            </Card>
            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-orange-600">{result.stats.soldeErrorsFixed || 0}</p>
                <p className="text-[10px] text-muted-foreground">Soldes recalculés</p>
              </CardContent>
            </Card>
          </div>

          {/* Stats détaillées */}
          <div className="grid grid-cols-2 gap-2">
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-lg font-bold text-red-600">{result.stats.duplicates || 0}</p>
                <p className="text-[10px] text-muted-foreground">Doublons</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-lg font-bold text-red-500">{result.stats.orphanedTransactions || 0}</p>
                <p className="text-[10px] text-muted-foreground">Transactions orphelines</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-lg font-bold text-amber-600">{result.stats.totalIssuesFound || 0}</p>
                <p className="text-[10px] text-muted-foreground">Incohérences trouvées</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-lg font-bold text-red-700">{result.stats.errorsRemaining || 0}</p>
                <p className="text-[10px] text-muted-foreground">Erreurs restantes</p>
              </CardContent>
            </Card>
          </div>

          {/* Corrections */}
          {result.corrections.length > 0 && (
            <Card className="border-green-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">✅ Corrections appliquées ({result.corrections.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {result.corrections.map((corr, i) => (
                  <p key={i} className="text-xs text-green-700">{corr}</p>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Problèmes */}
          {result.issues.length > 0 && (
            <Card className="border-amber-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">❌ Problèmes détectés ({result.issues.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 max-h-[300px] overflow-y-auto">
                {result.issues.map((issue, i) => (
                  <p key={i} className="text-xs text-amber-700">{issue}</p>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Checks */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">📋 Vérifications effectuées</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {result.checks.map((check, i) => (
                <p key={i} className="text-xs text-muted-foreground">{check}</p>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}