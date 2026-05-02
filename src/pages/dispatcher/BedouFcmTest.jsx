/**
 * BedouFcmTest — Test direct FCM pour diagnostiquer les problèmes push Bedou
 * 
 * Affiche :
 * 1. Diagnostic complet (admins, tokens, test FCM)
 * 2. Bouton "Envoyer push test" pour vérifier la réception directe
 * 3. Logs en temps réel du diagnostic
 */

import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, RefreshCw, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function BedouFcmTest() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [result, setResult] = useState(null);

  const runDiagnostic = async () => {
    setLoading(true);
    setLogs([]);
    setResult(null);

    try {
      const res = await base44.functions.invoke('bedouFcmDiagnostic', {});
      setResult(res.data);
      if (res.data.logs) {
        setLogs(res.data.logs);
      }
      toast.success('Diagnostic complété');
    } catch (err) {
      toast.error('Erreur diagnostic: ' + err.message);
      setLogs([`ERROR: ${err.message}`]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Test FCM Bedou</h1>
      </div>

      {/* Bouton diagnostic */}
      <Button
        onClick={runDiagnostic}
        disabled={loading}
        className="w-full"
        size="lg"
      >
        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
        {loading ? 'Diagnostic en cours...' : 'Lancer diagnostic FCM complet'}
      </Button>

      {/* Résumé */}
      {result && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-blue-600">{result.admins_count}</p>
              <p className="text-xs text-muted-foreground mt-1">Admins trouvés</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-green-600">{result.admin_tokens_found}</p>
              <p className="text-xs text-muted-foreground mt-1">Tokens admin</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-purple-600">{result.tokens_total}</p>
              <p className="text-xs text-muted-foreground mt-1">Tokens total</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Logs */}
      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Logs Diagnostic</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-xs space-y-1 max-h-96 overflow-y-auto">
              {logs.map((log, idx) => (
                <div key={idx} className="text-slate-300">
                  {log}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <span>ℹ️ Comment lire le diagnostic</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-700">
          <p><strong>admins_trouvés=X</strong> → nombre d'admins enregistrés</p>
          <p><strong>tokens_admin_trouvés=Y</strong> → tokens FCM actifs pour les admins</p>
          <p><strong>fcm_test result</strong> → test push direct</p>
          <ul className="list-disc ml-4 space-y-1">
            <li><strong>ok=true</strong> → FCM fonctionne parfaitement ✅</li>
            <li><strong>ok=false status=404</strong> → token invalide (sera désactivé)</li>
            <li><strong>ok=false status=400</strong> → problème Firebase config</li>
          </ul>
          <p className="mt-3 font-semibold">
            Si test réussit (ok=true) → problème est dans flux Bedou
            <br />
            Si test échoue (ok=false) → problème est token/Firebase/Android
          </p>
        </CardContent>
      </Card>
    </div>
  );
}