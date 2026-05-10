/**
 * BedouFcmTest — Diagnostic FCM + Push test à soi-même
 */
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, RefreshCw, Send, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function BedouFcmTest() {
  const navigate = useNavigate();
  const [diagLoading, setDiagLoading] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [diagResult, setDiagResult] = useState(null);
  const [diagLogs, setDiagLogs] = useState([]);
  const [pushResult, setPushResult] = useState(null);
  const [targetEmail, setTargetEmail] = useState('');

  const runDiagnostic = async () => {
    setDiagLoading(true);
    setDiagLogs([]);
    setDiagResult(null);
    try {
      const res = await base44.functions.invoke('bedouFcmDiagnostic', {});
      setDiagResult(res.data);
      if (res.data?.logs) setDiagLogs(res.data.logs);
      toast.success('Diagnostic complété');
    } catch (err) {
      toast.error('Erreur diagnostic: ' + err.message);
      setDiagLogs([`ERROR: ${err.message}`]);
    } finally {
      setDiagLoading(false);
    }
  };

  const sendTestPush = async () => {
    setPushLoading(true);
    setPushResult(null);
    try {
      const payload = targetEmail.trim() ? { target_email: targetEmail.trim() } : {};
      const res = await base44.functions.invoke('sendTestPush', payload);
      const d = res.data;
      setPushResult(d);
      if (d?.fcm_sent > 0) {
        toast.success(`✅ Push envoyé à ${d.target_email} !`);
      } else if (!d?.token_info?.token_found) {
        toast.error(`❌ Aucun token FCM pour ${d?.target_email} — ouvrir l'APK d'abord`);
      } else {
        toast.error(`❌ Push échoué — voir résultat ci-dessous`);
      }
    } catch (err) {
      toast.error('Erreur: ' + err.message);
      setPushResult({ error: err.message });
    } finally {
      setPushLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Diagnostic FCM</h1>
      </div>

      {/* ── Push test à soi-même ── */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4 text-blue-600" />
            Push test à soi-même
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Email cible (vide = moi-même)"
              value={targetEmail}
              onChange={e => setTargetEmail(e.target.value)}
              className="flex-1 text-sm"
            />
            <Button onClick={sendTestPush} disabled={pushLoading} size="sm" className="gap-1.5">
              {pushLoading
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <Send className="h-4 w-4" />}
              Envoyer
            </Button>
          </div>

          {/* Résultat push */}
          {pushResult && (
            <div className={`rounded-xl p-3 text-sm space-y-1.5 font-mono ${pushResult.fcm_sent > 0 ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'}`}>
              <div className="flex items-center gap-2 font-bold text-base mb-2">
                {pushResult.fcm_sent > 0
                  ? <CheckCircle2 className="h-5 w-5 text-green-400" />
                  : <XCircle className="h-5 w-5 text-red-400" />}
                {pushResult.fcm_sent > 0 ? 'Push envoyé ✅' : 'Push échoué ❌'}
              </div>
              <p><span className="opacity-60">target_email = </span>{pushResult.target_email}</p>
              <p><span className="opacity-60">token_found = </span>
                <span className={pushResult.token_info?.token_found ? 'text-green-300' : 'text-red-300'}>
                  {String(pushResult.token_info?.token_found)}
                </span>
              </p>
              <p><span className="opacity-60">token_count = </span>{pushResult.token_info?.token_count ?? 0}</p>
              <p><span className="opacity-60">token_preview = </span>{pushResult.token_info?.token_preview}</p>
              <p><span className="opacity-60">device_type = </span>{pushResult.token_info?.device_type}</p>
              <p><span className="opacity-60">last_used = </span>{pushResult.token_info?.last_used}</p>
              <p><span className="opacity-60">fcm_sent = </span>
                <span className={pushResult.fcm_sent > 0 ? 'text-green-300' : 'text-red-300'}>{pushResult.fcm_sent}</span>
              </p>
              <p><span className="opacity-60">fcm_failed = </span>{pushResult.fcm_failed}</p>
              {pushResult.firebase_message_id && (
                <p><span className="opacity-60">firebase_msg_id = </span>{pushResult.firebase_message_id}</p>
              )}
              {pushResult.note && (
                <p className="text-amber-300"><span className="opacity-60">note = </span>{pushResult.note}</p>
              )}
              {pushResult.error && (
                <p className="text-red-300"><span className="opacity-60">error = </span>{pushResult.error}</p>
              )}
              {!pushResult.token_info?.token_found && (
                <div className="mt-2 p-2 rounded bg-amber-900/60 text-amber-200 text-xs">
                  ⚠️ Aucun token → l'utilisateur doit ouvrir l'APK pour enregistrer son token FCM
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Diagnostic complet ── */}
      <Button onClick={runDiagnostic} disabled={diagLoading} className="w-full" size="lg">
        <RefreshCw className={`h-4 w-4 mr-2 ${diagLoading ? 'animate-spin' : ''}`} />
        {diagLoading ? 'Diagnostic en cours...' : 'Diagnostic FCM complet'}
      </Button>

      {/* Résumé diagnostic */}
      {diagResult && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-blue-600">{diagResult.admins_count ?? '?'}</p>
              <p className="text-xs text-muted-foreground mt-1">Admins</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-green-600">{diagResult.admin_tokens_found ?? '?'}</p>
              <p className="text-xs text-muted-foreground mt-1">Tokens admin</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-purple-600">{diagResult.tokens_total ?? '?'}</p>
              <p className="text-xs text-muted-foreground mt-1">Tokens total</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Logs diagnostic */}
      {diagLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Logs Diagnostic</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-xs space-y-1 max-h-80 overflow-y-auto">
              {diagLogs.map((log, idx) => (
                <div key={idx} className={`${log.includes('ERROR') || log.includes('❌') ? 'text-red-400' : log.includes('✅') ? 'text-green-400' : 'text-slate-300'}`}>
                  {log}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Aide lecture */}
      <Card className="bg-amber-50 border-amber-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            Causes possibles d'échec push
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-slate-700 space-y-1">
          <p>• <strong>token_found=false</strong> → APK jamais ouvert ou token non enregistré</p>
          <p>• <strong>UNREGISTERED</strong> → token expiré, réinstallation APK nécessaire</p>
          <p>• <strong>INVALID_ARGUMENT</strong> → token corrompu en BDD</p>
          <p>• <strong>fcm_sent=0 token_found=true</strong> → Firebase a rejeté l'envoi (voir error_code)</p>
          <p>• <strong>Batterie/Doze</strong> → Android bloque les push en économie d'énergie</p>
        </CardContent>
      </Card>
    </div>
  );
}