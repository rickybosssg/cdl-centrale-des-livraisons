/**
 * AdminAuthDiagnostics — Diagnostic FCM pour Admin
 * Lance la fonction fcmDiagnostic et affiche les résultats
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, RefreshCw, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export default function AdminAuthDiagnostics() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const runDiagnostic = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke('fcmDiagnostic', {});
      setResult(res.data);
      if (res.data?.checks?.fcm_api?.status !== 'OK') {
        toast.error('❌ Problème détecté — voir détails ci-dessous');
      } else {
        toast.success('✅ FCM configuré correctement');
      }
    } catch (err) {
      toast.error('Erreur: ' + err.message);
      setResult({ summary: '❌ ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-20 max-w-2xl mx-auto px-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">🔐 Diagnostic FCM Admin</h1>
      </div>

      {/* Description */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800 space-y-2">
        <p className="font-semibold">Cette fonction vérifie :</p>
        <ul className="space-y-1 ml-4 list-disc text-xs">
          <li>Service Account JSON présent et valide</li>
          <li>Project ID extrait</li>
          <li>Access token généré (JWT signing OK)</li>
          <li>FCM API accessible et permissions suffisantes</li>
          <li>Tokens en BDD et prêts à envoyer</li>
        </ul>
      </div>

      {/* Bouton lancer */}
      <Button
        onClick={runDiagnostic}
        disabled={loading}
        className="w-full h-12 text-base font-bold"
      >
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
            Analyse en cours...
          </>
        ) : (
          <>
            <RefreshCw className="h-5 w-5 mr-2" /> Lancer le diagnostic
          </>
        )}
      </Button>

      {/* Résultats */}
      {result && (
        <div className="space-y-4">
          {/* Résumé */}
          <Card className={result.summary.includes('❌') ? 'border-red-400 bg-red-50' : 'border-green-400 bg-green-50'}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{result.summary}</CardTitle>
            </CardHeader>
          </Card>

          {/* Erreurs détaillées */}
          {result.errors && result.errors.length > 0 && (
            <Card className="border-red-300 bg-red-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-red-800">
                  ❌ Problèmes détectés ({result.errors.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-red-700">
                {result.errors.map((err, i) => (
                  <div key={i} className="p-2 rounded bg-white border border-red-200">
                    {err}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Checklist native */}
          {result.native_checklist && result.native_checklist.length > 0 && (
            <Card className="border-amber-300 bg-amber-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-amber-800">
                  📋 Actions requises dans Google Cloud Console
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-amber-800 space-y-1">
                {result.native_checklist.map((step, i) => (
                  <p key={i} className="font-mono">{step}</p>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Checks détaillés */}
          {result.checks && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">📊 Détails des vérifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(result.checks)
                  .filter(([k]) => k !== 'last_tokens')
                  .map(([key, check]) => {
                    const Icon = check.status === 'OK'
                      ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                      : check.status === 'FAIL'
                      ? <XCircle className="h-4 w-4 text-red-600" />
                      : <AlertCircle className="h-4 w-4 text-amber-600" />;

                    return (
                      <div
                        key={key}
                        className={`p-3 rounded border flex items-start gap-2 ${
                          check.status === 'OK'
                            ? 'bg-green-50 border-green-200'
                            : check.status === 'FAIL'
                            ? 'bg-red-50 border-red-200'
                            : 'bg-amber-50 border-amber-200'
                        }`}
                      >
                        {Icon}
                        <div className="flex-1">
                          <p className="font-semibold text-xs capitalize">
                            {key.replace(/_/g, ' ')}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {check.detail}
                          </p>
                        </div>
                      </div>
                    );
                  })}
              </CardContent>
            </Card>
          )}

          {/* Tokens en BDD */}
          {result.last_tokens && result.last_tokens.length > 0 && (
            <Card className="border-green-300 bg-green-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-green-800">
                  ✅ Derniers tokens en BDD ({result.last_tokens.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {result.last_tokens.map((t, i) => (
                  <div key={i} className="p-2 rounded bg-white border border-green-200">
                    <p className="font-semibold">{t.device_type}</p>
                    <p className="text-muted-foreground">{t.user}</p>
                    <p className="font-mono text-[10px] break-all">{t.token}</p>
                    <p className="text-muted-foreground text-[10px] mt-1">
                      {new Date(t.registered_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}