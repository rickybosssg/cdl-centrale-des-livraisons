/**
 * TestNotifications — Diagnostic + test réel push FCM
 * Workflow: 1) Vérifier token actif → 2) Envoyer → 3) Afficher résultat détaillé avec logs
 */
import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Send, Loader2, CheckCircle2, AlertCircle, RefreshCw, Smartphone, Wifi, WifiOff, Search, ClipboardCopy, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function TestNotifications() {
  const navigate = useNavigate();

  // ── Étape 1 : résolution token ─────────────────────────────────────────────
  const [emailInput, setEmailInput] = useState('');
  const [tokenDiag, setTokenDiag] = useState(null);   // { found, tokens, active, profile, last_seen }
  const [diagLoading, setDiagLoading] = useState(false);

  // ── Étape 2 : envoi ────────────────────────────────────────────────────────
  const [sending, setSending] = useState(false);
  const [pushResult, setPushResult] = useState(null);  // résultat brut sendTestPush

  // ── Historique ─────────────────────────────────────────────────────────────
  const [testLogs, setTestLogs] = useState([]);
  const logsRef = useRef(false);

  // Charger les derniers logs au montage
  useEffect(() => {
    if (logsRef.current) return;
    logsRef.current = true;
    base44.entities.NotificationTestLog.filter({}, '-created_date', 8)
      .then(setTestLogs)
      .catch(() => {});
  }, []);

  // ── Étape 1 : chercher tokens pour un email ────────────────────────────────
  const runDiag = async (email) => {
    if (!email || !email.includes('@')) {
      toast.error('Email invalide');
      return;
    }
    setDiagLoading(true);
    setTokenDiag(null);
    setPushResult(null);
    try {
      console.log('[TestNotif] DIAG start | email:', email);

      // Tokens actifs ET inactifs récents (pour diagnostiquer même quand is_active=false)
      const [activeTokens, allTokens] = await Promise.all([
        base44.entities.FcmToken.filter({ user_email: email, is_active: true }, '-last_used', 10),
        base44.entities.FcmToken.filter({ user_email: email }, '-updated_date', 20),
      ]);

      const realActive = activeTokens.filter(t => t.token && t.token.length > 50 && !t.token.startsWith('test_') && !t.token.startsWith('synth_'));
      const recentInactive = allTokens
        .filter(t => !t.is_active && t.token && t.token.length > 50 && !t.token.startsWith('test_'))
        .slice(0, 3);

      const bestToken = realActive[0] || recentInactive[0] || null;

      console.log('[TestNotif] DIAG result | active:', realActive.length, '| recent_inactive:', recentInactive.length, '| best:', bestToken?.token?.slice(0, 30));

      setTokenDiag({
        found: bestToken !== null,
        active_count: realActive.length,
        inactive_count: recentInactive.length,
        total_in_bdd: allTokens.length,
        best: bestToken,
        all_active: realActive,
        email,
      });
    } catch (err) {
      console.error('[TestNotif] DIAG error:', err.message);
      toast.error('Erreur diagnostic: ' + err.message);
      setTokenDiag({ found: false, error: err.message, email });
    } finally {
      setDiagLoading(false);
    }
  };

  // ── Étape 2 : envoyer le push ──────────────────────────────────────────────
  const sendPush = async () => {
    const email = tokenDiag?.email || emailInput.trim();
    if (!email) { toast.error('Saisir un email'); return; }

    setSending(true);
    setPushResult(null);
    console.log('[TestNotif] SEND start | target:', email);

    try {
      const res = await base44.functions.invoke('sendTestPush', { target_email: email });
      const d = res.data || {};
      console.log('[TestNotif] SEND result:', JSON.stringify(d));
      setPushResult(d);

      if ((d.fcm_sent || 0) > 0) {
        toast.success(`✅ Push envoyé ! fcm_sent=${d.fcm_sent} | msg_id=${d.firebase_message_id || 'N/A'}`);
      } else {
        const reason = d.note || d.error || (d.token_info?.token_found === false ? 'Aucun token FCM valide' : 'Push non délivré');
        toast.error(`❌ ${reason}`);
      }

      // Rafraîchir logs
      setTimeout(async () => {
        const logs = await base44.entities.NotificationTestLog.filter({}, '-created_date', 8);
        setTestLogs(logs);
      }, 1200);
    } catch (err) {
      console.error('[TestNotif] SEND exception:', err.message);
      setPushResult({ error: err.message, fcm_sent: 0 });
      toast.error('Erreur: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  // ── Forcer re-register ─────────────────────────────────────────────────────
  const forceRegister = () => {
    window.dispatchEvent(new CustomEvent('cdl_fcm_force_register', { detail: { reason: 'manual_test' } }));
    toast.info('Re-registration FCM déclenchée — attends 3-5 sec puis relance le diagnostic');
  };

  return (
    <div className="space-y-5 pb-24 max-w-xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-bold">🔔 Test Push FCM — Réel</h1>
      </div>

      {/* ── ÉTAPE 1 : Email + Diagnostic ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Étape 1 — Email cible</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="email@exemple.com"
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runDiag(emailInput.trim())}
              className="text-sm flex-1"
            />
            <Button
              onClick={() => runDiag(emailInput.trim())}
              disabled={diagLoading || !emailInput.includes('@')}
              variant="outline"
              className="gap-1.5 shrink-0"
            >
              {diagLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Vérifier
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Saisis ton email CDL. Le système vérifiera les tokens FCM enregistrés en BDD.
          </p>
        </CardContent>
      </Card>

      {/* ── Résultat diagnostic token ─────────────────────────────────────────── */}
      {tokenDiag && (
        <Card className={
          tokenDiag.error ? 'border-red-200 bg-red-50'
          : tokenDiag.active_count > 0 ? 'border-green-200 bg-green-50'
          : tokenDiag.inactive_count > 0 ? 'border-amber-200 bg-amber-50'
          : 'border-red-200 bg-red-50'
        }>
          <CardContent className="p-4 space-y-3">
            {/* Status principal */}
            <div className="flex items-start gap-2">
              {tokenDiag.error ? (
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              ) : tokenDiag.active_count > 0 ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
              ) : tokenDiag.inactive_count > 0 ? (
                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              ) : (
                <WifiOff className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">
                  {tokenDiag.error ? `Erreur: ${tokenDiag.error}`
                  : tokenDiag.active_count > 0 ? `✅ ${tokenDiag.active_count} token(s) actif(s) — prêt à envoyer`
                  : tokenDiag.inactive_count > 0 ? `⚠️ Aucun token actif — ${tokenDiag.inactive_count} inactif(s) récent(s) (fallback possible)`
                  : `❌ Aucun token — ouvre l'APK et autorise les notifications`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Total en BDD : {tokenDiag.total_in_bdd} | Actifs : {tokenDiag.active_count} | Inactifs récents : {tokenDiag.inactive_count}
                </p>
              </div>
            </div>

            {/* Détail meilleur token */}
            {tokenDiag.best && (
              <div className="bg-white/70 rounded-lg p-3 space-y-1.5 border border-black/5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Token cible</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono flex-1 truncate text-foreground">
                    {tokenDiag.best.token.slice(0, 45)}...
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(tokenDiag.best.token); toast.success('Copié'); }}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <ClipboardCopy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Actif : <strong className={tokenDiag.best.is_active ? 'text-green-700' : 'text-amber-700'}>{tokenDiag.best.is_active ? 'Oui' : 'Non (fallback)'}</strong></span>
                  <span>Device : <strong>{tokenDiag.best.device_type || 'N/A'}</strong></span>
                  <span>Profil : <strong>{tokenDiag.best.active_profile_type || 'N/A'}</strong></span>
                  <span>Last seen : <strong>{tokenDiag.best.last_seen ? new Date(tokenDiag.best.last_seen).toLocaleString('fr') : 'N/A'}</strong></span>
                  <span className="col-span-2">Last used : <strong>{tokenDiag.best.last_used ? new Date(tokenDiag.best.last_used).toLocaleString('fr') : 'N/A'}</strong></span>
                </div>
              </div>
            )}

            {/* Tous les tokens actifs (si plusieurs) */}
            {tokenDiag.all_active?.length > 1 && (
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium">Tous les tokens actifs ({tokenDiag.all_active.length}) :</p>
                {tokenDiag.all_active.map((t, i) => (
                  <div key={t.id} className="font-mono bg-white/60 rounded px-2 py-1 truncate">
                    #{i + 1} · {t.token.slice(0, 40)}... · {t.device_type || '?'} · {t.active_profile_type || '?'}
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button
                onClick={() => runDiag(tokenDiag.email)}
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={diagLoading}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Re-vérifier
              </Button>
              <Button
                onClick={forceRegister}
                variant="outline"
                size="sm"
                className="gap-1.5"
              >
                <Zap className="h-3.5 w-3.5" />
                Forcer re-register
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── ÉTAPE 2 : Envoyer ────────────────────────────────────────────────── */}
      {tokenDiag && !tokenDiag.error && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Étape 2 — Envoyer le push</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tokenDiag.active_count === 0 && tokenDiag.inactive_count === 0 ? (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                ❌ Impossible d'envoyer — aucun token disponible.<br />
                <span className="text-xs mt-1 block">1. Ouvre l'APK CDL → 2. Autorise les notifications → 3. Re-vérifie ci-dessus</span>
              </div>
            ) : (
              <>
                {tokenDiag.active_count === 0 && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                    ⚠️ Aucun token actif mais un fallback inactif récent sera utilisé automatiquement.
                  </div>
                )}
                <Button
                  onClick={sendPush}
                  disabled={sending}
                  className="w-full gap-2"
                >
                  {sending ? <><Loader2 className="h-4 w-4 animate-spin" />Envoi en cours...</>
                    : <><Send className="h-4 w-4" />Envoyer push de test → {tokenDiag.email}</>}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Canal: <code>cdl_critical_alerts_v3</code> · Priorité: HIGH
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Résultat push ─────────────────────────────────────────────────────── */}
      {pushResult && (
        <Card className={pushResult.fcm_sent > 0 ? 'border-green-300 bg-green-50' : 'border-red-200 bg-red-50'}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              {pushResult.fcm_sent > 0
                ? <CheckCircle2 className="h-5 w-5 text-green-700 shrink-0" />
                : <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />}
              <p className="font-semibold text-sm">
                {pushResult.fcm_sent > 0
                  ? `✅ Push délivré à FCM (${pushResult.fcm_sent} token)`
                  : `❌ Push non délivré — ${pushResult.note || pushResult.error || 'Aucun token FCM valide'}`}
              </p>
            </div>

            <div className="bg-white/70 rounded-lg p-3 space-y-1.5 border border-black/5 font-mono text-xs space-y-1">
              <p><span className="text-muted-foreground">target_email :</span> {pushResult.target_email || '—'}</p>
              <p><span className="text-muted-foreground">fcm_sent :</span> <span className={pushResult.fcm_sent > 0 ? 'text-green-700 font-bold' : 'text-red-600 font-bold'}>{pushResult.fcm_sent ?? '—'}</span></p>
              <p><span className="text-muted-foreground">fcm_failed :</span> {pushResult.fcm_failed ?? '—'}</p>
              <p><span className="text-muted-foreground">firebase_message_id :</span> <span className="break-all">{pushResult.firebase_message_id || 'N/A'}</span></p>
              <p><span className="text-muted-foreground">channel_id :</span> {pushResult.channel_id || '—'}</p>
              <p><span className="text-muted-foreground">bdd_created :</span> {pushResult.bdd_created ?? '—'}</p>
              {pushResult.token_info && (
                <>
                  <p><span className="text-muted-foreground">token_found :</span> {String(pushResult.token_info.token_found)}</p>
                  <p><span className="text-muted-foreground">token_preview :</span> {pushResult.token_info.token_preview || '—'}</p>
                  <p><span className="text-muted-foreground">device_type :</span> {pushResult.token_info.device_type || '—'}</p>
                  <p><span className="text-muted-foreground">last_used :</span> {pushResult.token_info.last_used || '—'}</p>
                </>
              )}
              {pushResult.error && <p className="text-red-600"><span className="text-muted-foreground">error :</span> {pushResult.error}</p>}
              {pushResult.note && <p className="text-amber-700"><span className="text-muted-foreground">note :</span> {pushResult.note}</p>}
            </div>

            {pushResult.fcm_sent > 0 && (
              <div className="bg-green-100 border border-green-300 rounded-lg p-3 text-xs text-green-900 space-y-1">
                <p className="font-semibold">🎉 Push envoyé — maintenant vérifier la réception physique</p>
                <ul className="space-y-0.5 list-disc ml-4">
                  <li><strong>App ouverte</strong> : notification doit apparaître en haut (heads-up)</li>
                  <li><strong>App background</strong> : notification système doit apparaître</li>
                  <li><strong>App fermée</strong> : notification système doit réveiller l'appareil</li>
                </ul>
                <p className="mt-1">Si rien → vérifie que le canal <code>cdl_critical_alerts_v3</code> est actif dans les réglages Android</p>
              </div>
            )}

            {pushResult.fcm_sent === 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-900 space-y-1">
                <p className="font-semibold">Diagnostic de l'échec :</p>
                {pushResult.token_info?.token_found === false && (
                  <p>→ <strong>Aucun token FCM en BDD</strong> — l'APK n'a pas encore envoyé son token.<br />
                    Action : 1) Ouvre l'APK 2) Autorise notifications 3) Attends 5s 4) Clique "Vérifier"</p>
                )}
                {pushResult.token_info?.synthetic_count > 0 && (
                  <p>→ <strong>Tokens synthétiques détectés</strong> ({pushResult.token_info.synthetic_count}) — pas un vrai FCM token natif.</p>
                )}
                {pushResult.error?.includes('UNREGISTERED') && (
                  <p>→ <strong>Token UNREGISTERED</strong> — token révoqué par Firebase. Force re-register ci-dessus.</p>
                )}
                {pushResult.error?.includes('INVALID_ARGUMENT') && (
                  <p>→ <strong>Token INVALID_ARGUMENT</strong> — token malformé. Désinstalle/réinstalle l'APK.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Guide 3 cas ──────────────────────────────────────────────────────── */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4 space-y-2 text-xs text-blue-900">
          <p className="font-semibold">📋 Protocole de test — 3 états</p>
          <div className="space-y-2">
            <div className="bg-white/60 rounded p-2 space-y-0.5">
              <p className="font-medium">1️⃣ App ouverte</p>
              <p>L'app doit afficher un heads-up (bandeau en haut). Le handler natif `pushNotificationReceived` est appelé. Check : son + vibration.</p>
            </div>
            <div className="bg-white/60 rounded p-2 space-y-0.5">
              <p className="font-medium">2️⃣ App background (bouton Home)</p>
              <p>La notification doit apparaître dans le tiroir de notifications Android. Clic → ouvre l'app sur le bon écran (notif_route).</p>
            </div>
            <div className="bg-white/60 rounded p-2 space-y-0.5">
              <p className="font-medium">3️⃣ App complètement fermée</p>
              <p>La notification doit arriver même app fermée (FCM gère la livraison). Clic → cold start de l'app + navigation vers notif_route.</p>
            </div>
          </div>
          <p className="text-blue-700 mt-2">Canal officiel : <code>cdl_critical_alerts_v3</code> (importance MAX, heads-up actif)</p>
        </CardContent>
      </Card>

      {/* ── Historique ───────────────────────────────────────────────────────── */}
      {testLogs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              📋 Historique ({testLogs.length})
              <button
                onClick={async () => {
                  const logs = await base44.entities.NotificationTestLog.filter({}, '-created_date', 8);
                  setTestLogs(logs);
                  toast.success('Actualisé');
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-72 overflow-y-auto">
            {testLogs.map(log => (
              <div
                key={log.id}
                className={`p-2.5 rounded-lg border text-xs space-y-0.5 ${
                  log.status === 'sent' ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium">{log.status === 'sent' ? '✅' : '⚠️'} {log.recipient_email}</p>
                  <p className="text-muted-foreground">{log.timestamp ? new Date(log.timestamp).toLocaleTimeString('fr') : ''}</p>
                </div>
                <p className="text-muted-foreground">
                  Admin: {log.admin_email} · Tokens: {log.tokens_count} · Envoyés: {log.sent_count}/{log.tokens_count}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}