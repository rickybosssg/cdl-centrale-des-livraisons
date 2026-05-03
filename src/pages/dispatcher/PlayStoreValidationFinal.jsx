/**
 * PlayStoreValidationFinal — Checklist pré-publication APK
 * Tests obligatoires avant tout build Play Store
 * 🔒 FCM verrouillé — channel: cdl_critical_alerts_v2
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Shield, Smartphone, Send, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const CHECKS = [
  { id: 'push_open',      label: 'App ouverte → push visible (toast + barre)',        category: 'push' },
  { id: 'push_bg',        label: 'App arrière-plan → notification barre système',     category: 'push' },
  { id: 'push_closed',    label: 'App fermée → notification barre système',           category: 'push' },
  { id: 'push_tap',       label: 'Tap notification → deep link correct',              category: 'push' },
  { id: 'notif_admin',    label: 'Notification admin (nouvelle course)',               category: 'notif' },
  { id: 'notif_client',   label: 'Notification client (course créée)',                category: 'notif' },
  { id: 'notif_bedou',    label: 'Recharge Bedou validée → client notifié',           category: 'notif' },
  { id: 'notif_livreur',  label: 'Nouvelle course → livreur notifié',                category: 'notif' },
  { id: 'notif_accepted', label: 'Course acceptée → client notifié',                 category: 'notif' },
  { id: 'notif_message',  label: 'Nouveau message → destinataire notifié',           category: 'notif' },
  { id: 'channel_lock',   label: 'channel_id = cdl_critical_alerts_v2 dans logs',    category: 'tech' },
  { id: 'sent_gt0',       label: 'sent > 0 (au moins 1 token reçu)',                 category: 'tech' },
  { id: 'failed_0',       label: 'failed = 0 (aucun échec)',                         category: 'tech' },
  { id: 'delay_ok',       label: 'delay_ms < 3000 (performance OK)',                 category: 'tech' },
  { id: 'bdd_fallback',   label: 'Notification BDD créée même si FCM fail',          category: 'tech' },
];

const CATEGORY_LABELS = {
  push: { label: '📱 Push Système Android', color: 'text-blue-700' },
  notif: { label: '🔔 Notifications Métier', color: 'text-purple-700' },
  tech: { label: '🔧 Métriques Techniques', color: 'text-slate-700' },
};

export default function PlayStoreValidationFinal() {
  const navigate = useNavigate();
  const [checks, setChecks] = useState(() => Object.fromEntries(CHECKS.map(c => [c.id, null]))); // null=pending, true=ok, false=fail
  const [sending, setSending] = useState(false);
  const [fcmResult, setFcmResult] = useState(null);
  const [notes, setNotes] = useState('');

  const toggle = (id, value) => setChecks(prev => ({ ...prev, [id]: prev[id] === value ? null : value }));

  const passed = Object.values(checks).filter(v => v === true).length;
  const failed = Object.values(checks).filter(v => v === false).length;
  const total = CHECKS.length;
  const allPassed = passed === total && failed === 0;

  const runFcmTest = async () => {
    setSending(true);
    setFcmResult(null);
    try {
      const me = await base44.auth.me();
      const res = await base44.functions.invoke('sendCdlNotification', {
        user_email: me.email,
        title: '✅ Test pré-publication CDL',
        body: `Checklist Play Store — ${new Date().toLocaleTimeString('fr-FR')} — canal cdl_critical_alerts_v2`,
        data: {
          type: 'bedou_recharge_approved',
          notif_route: '/mes-notifications',
          entity_id: 'playstore_checklist',
          entity_type: 'Course',
        },
      });
      const d = res.data;
      setFcmResult(d);
      if (d?.sent > 0 && d?.failed === 0) {
        toast.success(`✅ Test OK — sent=${d.sent} failed=${d.failed} elapsed=${d.elapsed_ms}ms`);
        setChecks(prev => ({ ...prev, sent_gt0: true, failed_0: true, channel_lock: true }));
        if (d.elapsed_ms < 3000) setChecks(prev => ({ ...prev, delay_ok: true }));
      } else {
        toast.error(`⚠️ Test partiel — sent=${d?.sent ?? 0} failed=${d?.failed ?? 0}`);
        if ((d?.sent ?? 0) === 0) setChecks(prev => ({ ...prev, sent_gt0: false }));
        if ((d?.failed ?? 0) > 0) setChecks(prev => ({ ...prev, failed_0: false }));
      }
    } catch (err) {
      toast.error('Erreur: ' + err.message);
      setFcmResult({ error: err.message });
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setChecks(Object.fromEntries(CHECKS.map(c => [c.id, null])));
    setFcmResult(null);
    setNotes('');
  };

  const categories = [...new Set(CHECKS.map(c => c.category))];

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-lg font-bold">🚀 Validation Pré-Publication</h1>
          <p className="text-xs text-muted-foreground">Checklist obligatoire avant build Play Store</p>
        </div>
      </div>

      {/* Verrou système */}
      <Card className="border-2 border-blue-300 bg-blue-50">
        <CardContent className="p-3 flex items-center gap-3">
          <Shield className="h-6 w-6 text-blue-700 flex-shrink-0" />
          <div>
            <p className="text-xs font-bold text-blue-900">🔒 Canal FCM verrouillé : cdl_critical_alerts_v2</p>
            <p className="text-xs text-blue-700">importance=5 · Android heads-up garanti · NE PAS MODIFIER</p>
          </div>
        </CardContent>
      </Card>

      {/* Score global */}
      <Card className={allPassed ? 'border-2 border-green-400 bg-green-50' : failed > 0 ? 'border-2 border-red-400 bg-red-50' : 'border-2 border-amber-300 bg-amber-50'}>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold">{passed}/{total}</p>
            <p className="text-xs text-muted-foreground">tests validés</p>
          </div>
          {allPassed
            ? <div className="text-right"><CheckCircle2 className="h-8 w-8 text-green-600 mx-auto" /><p className="text-xs font-bold text-green-700 mt-1">PRÊT À PUBLIER</p></div>
            : failed > 0
              ? <div className="text-right"><XCircle className="h-8 w-8 text-red-600 mx-auto" /><p className="text-xs font-bold text-red-700 mt-1">NE PAS PUBLIER</p></div>
              : <div className="text-right"><AlertTriangle className="h-8 w-8 text-amber-600 mx-auto" /><p className="text-xs font-bold text-amber-700 mt-1">{total - passed} restants</p></div>
          }
        </CardContent>
      </Card>

      {/* Test FCM automatique */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            Test FCM automatique
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          <Button onClick={runFcmTest} disabled={sending} className="w-full">
            {sending ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Envoi...</> : <><Send className="h-4 w-4 mr-2" />Lancer test push cdl_critical_alerts_v2</>}
          </Button>
          {fcmResult && !fcmResult.error && (
            <div className={`p-3 rounded-lg text-xs font-mono space-y-0.5 ${fcmResult.sent > 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <p className={fcmResult.sent > 0 ? 'text-green-800 font-bold' : 'text-red-800 font-bold'}>
                {fcmResult.sent > 0 ? '✅ FCM OK' : '❌ FCM ÉCHEC'}
              </p>
              <p>sent = <strong>{fcmResult.sent}</strong></p>
              <p>failed = <strong>{fcmResult.failed}</strong></p>
              <p>elapsed = <strong>{fcmResult.elapsed_ms}ms</strong></p>
              <p>bdd = <strong>{fcmResult.bdd}</strong></p>
            </div>
          )}
          {fcmResult?.error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
              ❌ {fcmResult.error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Checklist par catégorie */}
      {categories.map(cat => (
        <Card key={cat}>
          <CardHeader className="pb-2">
            <CardTitle className={`text-sm ${CATEGORY_LABELS[cat].color}`}>
              {CATEGORY_LABELS[cat].label}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-4">
            {CHECKS.filter(c => c.category === cat).map(c => (
              <div key={c.id} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => toggle(c.id, true)}
                    className={`h-7 w-7 rounded-full border-2 flex items-center justify-center transition-all ${checks[c.id] === true ? 'bg-green-500 border-green-500 text-white' : 'border-green-300 text-green-400 hover:border-green-500'}`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => toggle(c.id, false)}
                    className={`h-7 w-7 rounded-full border-2 flex items-center justify-center transition-all ${checks[c.id] === false ? 'bg-red-500 border-red-500 text-white' : 'border-red-300 text-red-400 hover:border-red-500'}`}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className={`text-xs flex-1 ${checks[c.id] === true ? 'text-green-800 line-through' : checks[c.id] === false ? 'text-red-800 font-semibold' : 'text-foreground'}`}>
                  {c.label}
                </p>
                {checks[c.id] === null && <span className="text-[10px] text-muted-foreground flex-shrink-0">en attente</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {/* Notes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Notes / Logs d'erreur</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Coller ici les logs d'erreur FCM, registrationError, Logcat..."
            className="w-full h-24 text-xs font-mono border rounded-lg p-3 bg-slate-900 text-green-400 resize-none placeholder:text-slate-500"
          />
        </CardContent>
      </Card>

      {/* Résultat final */}
      {failed > 0 && (
        <Card className="border-2 border-red-400 bg-red-50">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600" />
              <p className="font-bold text-red-800">PUBLICATION BLOQUÉE — {failed} test(s) en échec</p>
            </div>
            <p className="text-xs text-red-700">→ Rollback immédiat à la version fonctionnelle</p>
            <p className="text-xs text-red-700">→ Conserver les logs d'erreur ci-dessus</p>
            <p className="text-xs text-red-700">→ Re-tester sur /fcm-diagnostic avant nouvelle tentative</p>
          </CardContent>
        </Card>
      )}

      {allPassed && (
        <Card className="border-2 border-green-400 bg-green-50">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-green-600 flex-shrink-0" />
            <div>
              <p className="font-bold text-green-800">✅ Tous les tests passent — BUILD AUTORISÉ</p>
              <p className="text-xs text-green-700 mt-0.5">Le système push est stable. Bonne publication !</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Button variant="outline" onClick={reset} className="w-full">
        <RefreshCw className="h-4 w-4 mr-2" />
        Réinitialiser la checklist
      </Button>
    </div>
  );
}