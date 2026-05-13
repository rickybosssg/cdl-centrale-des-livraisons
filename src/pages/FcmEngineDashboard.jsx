/**
 * FcmEngineDashboard — Dashboard diagnostic FcmTokenEngine
 * Affiche : token local, token BDD, device_id, actif/inactif,
 *           last_seen, last_refresh, last_push, erreur exacte
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import FcmTokenEngine from '@/lib/FcmTokenEngine';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowLeft, RefreshCw, Wrench, CheckCircle2, XCircle,
  AlertTriangle, Smartphone, Send, Copy
} from 'lucide-react';
import { toast } from 'sonner';

function StatusBadge({ ok, label }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}

function InfoRow({ label, value, mono = false }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b last:border-0">
      <span className="text-xs text-muted-foreground flex-shrink-0">{label}</span>
      <span className={`text-xs font-medium text-right break-all ${mono ? 'font-mono' : ''}`}>
        {value ?? <span className="text-muted-foreground">—</span>}
      </span>
    </div>
  );
}

export default function FcmEngineDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [diag, setDiag] = useState(null);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [targetEmail, setTargetEmail] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const me = await base44.auth.me();
      setUser(me);
      setTargetEmail(me.email);
      const data = await FcmTokenEngine.getDiagnostics(me.email);
      setDiag(data);
    } catch (e) {
      toast.error('Erreur chargement: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRepair = async () => {
    if (!user) return;
    setRepairing(true);
    try {
      await FcmTokenEngine.repair(user.email, 'manual_dashboard');
      toast.success('🔧 Réparation déclenchée — attendre 10s puis actualiser');
      setTimeout(load, 12000);
    } catch (e) {
      toast.error('Erreur: ' + e.message);
    } finally {
      setRepairing(false);
    }
  };

  const handleTestPush = async () => {
    if (!targetEmail) return;
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await base44.functions.invoke('sendTestPush', { target_email: targetEmail });
      const d = res.data;
      setTestResult(d);
      if (d?.fcm_sent > 0) {
        toast.success(`✅ Push envoyé à ${targetEmail}`);
      } else {
        toast.error(`❌ Échec: ${d?.note || d?.error || 'Aucun token'}`);
      }
    } catch (e) {
      toast.error('Erreur: ' + e.message);
    } finally {
      setSendingTest(false);
    }
  };

  const copyToken = (token) => {
    navigator.clipboard?.writeText(token).catch(() => {});
    toast.success('Token copié');
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  const hasActiveToken = (diag?.bdd_active || 0) > 0;
  const localMatchesBdd = diag?.local_match_in_bdd;

  return (
    <div className="space-y-4 pb-20">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">🔧 FcmTokenEngine Dashboard</h1>
          <p className="text-xs text-muted-foreground">Source unique de vérité FCM — v{diag?.engine_version}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={load}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Status global */}
      <Card className={`border-2 ${hasActiveToken ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            {hasActiveToken
              ? <CheckCircle2 className="h-8 w-8 text-green-600 flex-shrink-0" />
              : <XCircle className="h-8 w-8 text-red-600 flex-shrink-0" />
            }
            <div>
              <p className={`font-bold text-base ${hasActiveToken ? 'text-green-800' : 'text-red-800'}`}>
                {hasActiveToken ? '✅ Token FCM actif' : '❌ Aucun token actif'}
              </p>
              <p className="text-xs text-muted-foreground">
                {diag?.bdd_active} actif(s) / {diag?.bdd_total} total | Local→BDD: {localMatchesBdd ? '✅ match' : diag?.local_token ? '⚠️ mismatch' : '—'}
              </p>
            </div>
            {!hasActiveToken && (
              <Button size="sm" className="ml-auto bg-red-600 hover:bg-red-700" onClick={handleRepair} disabled={repairing}>
                {repairing ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Wrench className="h-4 w-4" />}
                Réparer
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Token local */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            💾 Token local (localStorage)
            <StatusBadge ok={!!diag?.local_token} label={diag?.local_token ? 'Présent' : 'Absent'} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          {diag?.local_token ? (
            <>
              <InfoRow label="Token (aperçu)" value={diag.local_token} mono />
              <InfoRow label="Dernier save" value={diag.local_last_save ? new Date(diag.local_last_save).toLocaleString() : null} />
              <InfoRow label="Email associé" value={diag.local_user} />
              <InfoRow label="Match en BDD" value={localMatchesBdd ? '✅ Oui' : '⚠️ Non (mismatch)'} />
              <div className="pt-2">
                <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => copyToken(diag.local_token_full)}>
                  <Copy className="h-3 w-3 mr-1" /> Copier token complet
                </Button>
              </div>
            </>
          ) : (
            <p className="text-xs text-red-600 py-2">❌ Aucun token en localStorage — FcmBootstrap n'a pas encore sauvegardé de token pour cet appareil.</p>
          )}
        </CardContent>
      </Card>

      {/* Appareil */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Smartphone className="h-4 w-4" /> Appareil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          <InfoRow label="Platform" value={diag?.device?.platform} />
          <InfoRow label="Device type" value={diag?.device?.device_type} />
          <InfoRow label="Device ID" value={diag?.device?.device_id} mono />
          <InfoRow label="Natif APK" value={diag?.device?.isNative ? '✅ Oui' : '🌐 Non (Web)'} />
        </CardContent>
      </Card>

      {/* Tokens BDD */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            🗄️ Tokens en BDD ({diag?.bdd_total || 0} total — {diag?.bdd_active || 0} actif)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(diag?.bdd_tokens || []).length === 0 ? (
            <p className="text-xs text-red-600">❌ Aucun token en BDD pour {user?.email}</p>
          ) : (
            (diag?.bdd_tokens || []).map((t, i) => (
              <div
                key={t.id}
                className={`p-3 rounded-lg border text-xs space-y-1 ${t.is_active ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`font-bold ${t.is_active ? 'text-green-700' : 'text-gray-500'}`}>
                    {t.is_active ? '✅' : '⬜'} Token #{i + 1} — {t.device_type}
                  </span>
                  {t.is_active && <span className="bg-green-200 text-green-800 px-1.5 py-0.5 rounded text-[10px] font-bold">ACTIF</span>}
                </div>
                <div className="font-mono text-gray-600 break-all">{t.token_preview}</div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                  <span>Enregistré: {t.registered_at ? new Date(t.registered_at).toLocaleString() : '—'}</span>
                  <span>Last used: {t.last_used ? new Date(t.last_used).toLocaleString() : '—'}</span>
                  {t.age_hours != null && <span>Âge: {t.age_hours}h</span>}
                </div>
              </div>
            ))
          )}
          {diag?.bdd_error && (
            <p className="text-xs text-red-600">⚠️ Erreur BDD: {diag.bdd_error}</p>
          )}
        </CardContent>
      </Card>

      {/* Réparation */}
      {diag?.repair_triggered && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Dernière réparation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <InfoRow label="Déclenchée" value={new Date(diag.repair_triggered).toLocaleString()} />
            <InfoRow label="Cause exacte" value={diag.repair_cause} />
          </CardContent>
        </Card>
      )}

      {/* Test push */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Send className="h-4 w-4" /> Test push FCM
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <input
              type="email"
              value={targetEmail}
              onChange={e => setTargetEmail(e.target.value)}
              className="flex-1 px-3 py-2 border rounded-lg text-xs bg-background"
              placeholder="email destinataire"
            />
            <Button size="sm" onClick={handleTestPush} disabled={sendingTest || !targetEmail}>
              {sendingTest ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
          {testResult && (
            <div className={`p-3 rounded-lg border text-xs ${testResult.fcm_sent > 0 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
              <p className="font-bold">{testResult.fcm_sent > 0 ? '✅ Push envoyé' : '❌ Échec'}</p>
              <p>fcm_sent={testResult.fcm_sent} | failed={testResult.fcm_failed} | tokens={testResult.total}</p>
              {testResult.firebase_message_id && <p className="font-mono">msgId: {testResult.firebase_message_id}</p>}
              {testResult.note && <p>Note: {testResult.note}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="text-xs" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Actualiser
        </Button>
        <Button
          variant="outline"
          className="text-xs"
          onClick={handleRepair}
          disabled={repairing}
        >
          <Wrench className="h-3.5 w-3.5 mr-1" />
          {repairing ? 'En cours...' : 'Forcer réparation'}
        </Button>
      </div>
    </div>
  );
}