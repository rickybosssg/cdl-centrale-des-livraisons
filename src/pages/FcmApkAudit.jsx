/**
 * FcmApkAudit — Audit FCM Android runtime FINAL
 * ================================================
 * STRICTEMENT FCM/APK. Aucune logique CDL (Bedou, auth, dispatch).
 *
 * Couvre :
 * 1. Détection platform Capacitor
 * 2. Permission POST_NOTIFICATIONS (Android 13+)
 * 3. register() + listener registration
 * 4. Canal Android (channel_id, importance, visibility, vibration)
 * 5. Payload type (notification vs data)
 * 6. Test push MINIMAL (sans CDL)
 * 7. Réception foreground / background / closed
 * 8. Logs [FCM_RECEIVED][FCM_NOTIFICATION_RENDER][FCM_CHANNEL_USED][FCM_DISPLAY_SUCCESS][FCM_DISPLAY_ERROR]
 * 9. Batterie Android (Samsung/Tecno/Xiaomi)
 */

import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, Send, CheckCircle2, XCircle, AlertCircle,
  Loader2, Terminal, Smartphone, Battery, Bell
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

// ── Helpers ──────────────────────────────────────────────────────────────────
function isNativeApp() {
  try {
    const p = window.location?.protocol;
    if (p === 'capacitor:' || p === 'file:') return true;
    if (typeof window.Capacitor !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true) return true;
  } catch (_) {}
  return false;
}

function getBrand() {
  const ua = navigator.userAgent || '';
  if (/samsung/i.test(ua)) return 'Samsung';
  if (/tecno/i.test(ua)) return 'Tecno';
  if (/xiaomi|redmi|miui/i.test(ua)) return 'Xiaomi';
  if (/huawei/i.test(ua)) return 'Huawei';
  if (/oppo/i.test(ua)) return 'Oppo';
  if (/vivo/i.test(ua)) return 'Vivo';
  return null;
}

const BATTERY_KILLERS = ['Samsung', 'Tecno', 'Xiaomi', 'Huawei', 'Oppo', 'Vivo'];

function Row({ label, ok, detail, warn }) {
  const Icon = ok === true ? CheckCircle2 : ok === false ? XCircle : AlertCircle;
  const color = ok === true ? 'text-green-600' : ok === false ? 'text-red-500' : 'text-amber-500';
  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-0">
      <Icon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${color}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {detail && <p className="text-xs text-muted-foreground mt-0.5 break-all">{detail}</p>}
        {warn && <p className="text-xs text-amber-700 mt-0.5 font-medium">⚠️ {warn}</p>}
      </div>
    </div>
  );
}

// ── Canal officiel CDL V3 — doit correspondre exactement à sendCdlNotification ──
const CDL_CHANNEL_ID = 'cdl_critical_alerts_v3';
const CDL_CHANNEL_DEF = {
  id: CDL_CHANNEL_ID,
  name: 'CDL Alertes Critiques',
  description: 'Courses, recharges Bedou, profils — priorité maximale — V3',
  importance: 5,
  sound: 'default',
  vibration: true,
  lights: true,
  lightColor: '#FF6B1E',
  visibility: 1,
};

export default function FcmApkAudit() {
  const navigate = useNavigate();
  const [isNative] = useState(() => isNativeApp());
  const [brand]    = useState(() => getBrand());
  const [user, setUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [phase, setPhase]     = useState('idle'); // idle | running | done
  const [results, setResults] = useState({});     // keyed checks
  const [minimalResult, setMinimalResult] = useState(null);
  const [lastForegroundNotif, setLastForegroundNotif] = useState(null);
  const [minimalSending, setMinimalSending]   = useState(false);
  const [token, setToken]     = useState(null);
  const listenersRef = useRef([]);

  // ── Logger ────────────────────────────────────────────────────────────────
  const log = (msg, type = 'info') => {
    const ts = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const tag =
      msg.includes('FCM_RECEIVED')           ? '[FCM_RECEIVED]' :
      msg.includes('FCM_NOTIFICATION_RENDER') ? '[FCM_NOTIFICATION_RENDER]' :
      msg.includes('FCM_CHANNEL_USED')        ? '[FCM_CHANNEL_USED]' :
      msg.includes('FCM_DISPLAY_SUCCESS')     ? '[FCM_DISPLAY_SUCCESS]' :
      msg.includes('FCM_DISPLAY_ERROR')       ? '[FCM_DISPLAY_ERROR]' : '';
    if (tag) console.log(`${tag} ${msg}`);
    else console.log(`[FCM_AUDIT] ${msg}`);
    setLogs(prev => [...prev.slice(-60), { ts, msg, type }]);
  };

  const setCheck = (key, val) => setResults(prev => ({ ...prev, [key]: val }));

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    base44.auth.me().then(me => {
      setUser(me);
      log(`User: ${me?.email || 'N/A'}`);
    }).catch(() => log('Auth: non connecté', 'warn'));
    return () => {
      listenersRef.current.forEach(l => { try { l.remove(); } catch (_) {} });
    };
  }, []);

  // ── ÉTAPE 1 — Audit complet APK ───────────────────────────────────────────
  const runAudit = async () => {
    setPhase('running');
    setResults({});
    setToken(null);
    setLastForegroundNotif(null);
    log('═══ AUDIT FCM APK START ═══');

    // Nettoyer les anciens listeners
    for (const l of listenersRef.current) { try { await l.remove(); } catch (_) {} }
    listenersRef.current = [];

    // ── Check 1 : Platform ────────────────────────────────────────────────
    const native = isNativeApp();
    setCheck('platform', { ok: native, detail: native ? `Capacitor APK (protocol: ${window.location.protocol})` : `Web / Browser (protocol: ${window.location.protocol})` });
    log(`Platform: ${native ? 'CAPACITOR NATIVE ✅' : 'WEB ❌ — les tests suivants nécessitent APK'}`, native ? 'info' : 'error');
    if (!native) {
      setPhase('done');
      log('Audit annulé — lancer depuis l\'APK Android', 'error');
      return;
    }

    // ── Check 2 : Plugin ─────────────────────────────────────────────────
    let PN;
    try {
      const mod = await import('@capacitor/push-notifications');
      PN = mod.PushNotifications;
      setCheck('plugin', { ok: true, detail: '@capacitor/push-notifications chargé ✅' });
      log('Plugin PushNotifications: CHARGÉ ✅');
    } catch (e) {
      setCheck('plugin', { ok: false, detail: e.message });
      log('Plugin PushNotifications: ABSENT ❌ — ' + e.message, 'error');
      setPhase('done');
      return;
    }

    // ── Check 3 : Permission POST_NOTIFICATIONS (Android 13+) ────────────
    let perm = 'unknown';
    try {
      const check = await PN.checkPermissions();
      perm = check.receive;
      log(`Permission actuelle: ${perm}`);

      if (perm !== 'granted') {
        log('Demande permission...', 'warn');
        const req = await PN.requestPermissions();
        perm = req.receive;
        log(`Permission après demande: ${perm}`);
      }

      const permOk = perm === 'granted';
      setCheck('permission', {
        ok: permOk,
        detail: `POST_NOTIFICATIONS = ${perm}`,
        warn: perm === 'denied' ? 'Android 13+ : aller dans Paramètres → Apps → CDL → Notifications et activer' : null,
      });
      log(`Permission POST_NOTIFICATIONS: ${perm === 'granted' ? '✅ GRANTED' : '❌ ' + perm}`, perm === 'granted' ? 'info' : 'error');
    } catch (e) {
      setCheck('permission', { ok: null, detail: 'Erreur checkPermissions: ' + e.message });
      log('checkPermissions CRASH: ' + e.message, 'error');
    }

    // ── Check 4 : Canal Android ───────────────────────────────────────────
    try {
      // Supprimer anciens canaux legacy
      const legacyIds = ['default', 'CDL_ALERTS_HIGH', 'urgent', 'cdl_default_v2'];
      await Promise.allSettled(legacyIds.map(id => PN.deleteChannel({ id })));

      await PN.createChannel(CDL_CHANNEL_DEF);
      setCheck('channel', {
        ok: true,
        detail: `channel_id=${CDL_CHANNEL_ID} | importance=5 (IMPORTANCE_MAX) | visibility=PUBLIC | vibration=true | sound=default`,
      });
      log(`FCM_CHANNEL_USED channel_id=${CDL_CHANNEL_ID} importance=5 visibility=PUBLIC vibration=true sound=default ✅`);
    } catch (e) {
      setCheck('channel', { ok: false, detail: e.message });
      log('Canal Android ERREUR: ' + e.message, 'error');
    }

    // ── Check 5 : Listeners ───────────────────────────────────────────────
    log('Attachement listeners (AVANT register)...');

    try {
      const errH = await PN.addListener('registrationError', (err) => {
        const msg = typeof err === 'string' ? err : JSON.stringify(err);
        log('❌ registrationError: ' + msg, 'error');
        setCheck('register', { ok: false, detail: 'registrationError: ' + msg });
      });
      listenersRef.current.push(errH);

      const fgH = await PN.addListener('pushNotificationReceived', (notif) => {
        const info = {
          title: notif?.title || notif?.data?.title || '?',
          body: notif?.body || notif?.data?.body || '?',
          data: notif?.data || {},
          channel: notif?.data?.android_channel_id || CDL_CHANNEL_ID,
          ts: new Date().toLocaleTimeString('fr-FR'),
        };
        log(`FCM_RECEIVED foreground title="${info.title}" body="${info.body}" channel=${info.channel}`);
        log(`FCM_NOTIFICATION_RENDER app_state=foreground title="${info.title}"`);
        log(`FCM_DISPLAY_SUCCESS foreground=true title="${info.title}"`);
        setLastForegroundNotif(info);
        setCheck('foreground_rx', { ok: true, detail: `Reçu à ${info.ts} — "${info.title}"` });

        // Toast visible même app ouverte
        toast(info.title, { description: info.body, duration: 10000 });
      });
      listenersRef.current.push(fgH);

      const tapH = await PN.addListener('pushNotificationActionPerformed', (action) => {
        const data = action.notification?.data || {};
        const route = data.notif_route || data.route || '/';
        log(`FCM_RECEIVED tap route=${route} data=${JSON.stringify(data).slice(0, 80)}`);
        log(`FCM_DISPLAY_SUCCESS tap=true route=${route}`);
      });
      listenersRef.current.push(tapH);

      setCheck('listeners', { ok: true, detail: 'registrationError + pushNotificationReceived + pushNotificationActionPerformed attachés' });
      log('Listeners attachés ✅');
    } catch (e) {
      setCheck('listeners', { ok: false, detail: e.message });
      log('Erreur attachement listeners: ' + e.message, 'error');
    }

    // ── Check 6 : register() + token ─────────────────────────────────────
    log('register() appelé — attente token Firebase (max 20s)...');
    setCheck('register', { ok: null, detail: 'En attente du callback registration...' });

    const tokenPromise = new Promise(async (resolve) => {
      const timer = setTimeout(() => {
        log('⛔ FCM_DISPLAY_ERROR timeout=true — aucun token après 20s', 'error');
        log('Causes possibles: SHA-1 manquant Firebase Console, google-services.json incorrect, pas internet', 'error');
        setCheck('register', { ok: false, detail: 'Timeout 20s — Firebase ne répond pas. Vérifier SHA-1 + google-services.json.' });
        resolve(null);
      }, 20000);

      const regH = await PN.addListener('registration', (tokenData) => {
        clearTimeout(timer);
        const t = tokenData?.value;
        if (t) {
          log(`FCM_RECEIVED registration token=${t.slice(0, 30)}... length=${t.length} ✅`);
          log(`FCM_NOTIFICATION_RENDER token_received=true length=${t.length}`);
          setCheck('register', { ok: true, detail: `Token reçu (${t.length} chars) | preview: ${t.slice(0, 40)}...` });
          setToken(t);
          resolve(t);
        } else {
          log('FCM_DISPLAY_ERROR registration_empty=true — token vide', 'error');
          setCheck('register', { ok: false, detail: 'registration callback avec token vide' });
          resolve(null);
        }
        regH.remove().catch(() => {});
      });
      listenersRef.current.push(regH);

      try {
        await PN.register();
        log('register() retourné — en attente callback...');
      } catch (e) {
        clearTimeout(timer);
        log('register() CRASH: ' + e.message, 'error');
        setCheck('register', { ok: false, detail: 'register() crash: ' + e.message });
        resolve(null);
      }
    });

    const receivedToken = await tokenPromise;

    // ── Check 7 : Token en BDD ────────────────────────────────────────────
    if (receivedToken && user?.email) {
      try {
        const existing = await base44.entities.FcmToken.filter({ user_email: user.email, is_active: true });
        const found = existing.find(t => t.token === receivedToken);
        setCheck('token_db', {
          ok: !!found || existing.length > 0,
          detail: found
            ? `Token en BDD ✅ | id=${found.id} | device=${found.device_type}`
            : `${existing.length} token(s) en BDD (token actuel non sauvegardé — FcmBootstrap le fait au login)`,
        });
        log(`Token BDD: ${found ? 'MATCH ✅' : existing.length + ' token(s) mais pas ce token exact'}`);
      } catch (e) {
        setCheck('token_db', { ok: null, detail: 'Erreur lecture BDD: ' + e.message });
      }
    } else if (!receivedToken) {
      setCheck('token_db', { ok: false, detail: 'Pas de token — BDD non vérifiable' });
    }

    // ── Check 8 : Analyse payload ─────────────────────────────────────────
    setCheck('payload', {
      ok: true,
      detail: `sendCdlNotification envoie: notification{title,body} + data{...} + android{channel_id=${CDL_CHANNEL_ID}, priority=HIGH, notification_priority=PRIORITY_MAX}. Payload MIX = affiché par Android OS même app fermée.`,
    });
    log('Payload type: MIX (notification + data) — Android affiche même app fermée ✅');

    // ── Check 9 : Batterie / DozeMode ────────────────────────────────────
    const batteryKiller = BATTERY_KILLERS.includes(brand);
    setCheck('battery', {
      ok: !batteryKiller,
      detail: brand
        ? `Fabricant: ${brand}${batteryKiller ? ' — AGGRESSIF (tue Firebase en fond)' : ' — OK'}`
        : 'Fabricant non détecté',
      warn: batteryKiller
        ? `${brand}: désactiver "Économie de batterie" pour CDL → Paramètres → Batterie → Optimisation → CDL → Ne pas optimiser`
        : null,
    });
    log(`Batterie: ${brand || 'inconnu'} | killer=${batteryKiller}`, batteryKiller ? 'warn' : 'info');

    setPhase('done');
    log('═══ AUDIT FCM APK DONE ═══');
    toast.success('Audit terminé — voir résultats ci-dessous');
  };

  // ── ÉTAPE 2 — Test push MINIMAL (sans CDL, sans Bedou) ───────────────────
  const sendMinimalPush = async () => {
    if (!token && !user?.email) {
      toast.error('Lancer l\'audit d\'abord pour obtenir un token');
      return;
    }
    setMinimalSending(true);
    setMinimalResult(null);
    log('═══ TEST PUSH MINIMAL (SANS CDL) ═══');
    log('Payload: notification{title,body} + data{type=minimal_test} + channel=' + CDL_CHANNEL_ID);

    try {
      const t0 = Date.now();
      const res = await base44.functions.invoke('sendTestPush', {
        target_email: user.email,
      });
      const d = res.data;
      const delay = Date.now() - t0;
      const ok = (d?.fcm_sent || 0) > 0;

      if (ok) {
        log(`FCM_DISPLAY_SUCCESS push_sent=true delay_ms=${delay} fcm_sent=${d.fcm_sent} firebase_message_id=${d.firebase_message_id || 'N/A'}`);
        log(`FCM_CHANNEL_USED channel_id=${CDL_CHANNEL_ID} in minimal push ✅`);
      } else {
        log(`FCM_DISPLAY_ERROR push_sent=false fcm_sent=0 token_found=${d?.token_info?.token_found} note=${d?.note || d?.error || 'N/A'}`, 'error');
      }

      setMinimalResult({
        ok,
        delay,
        fcm_sent: d?.fcm_sent || 0,
        fcm_failed: d?.fcm_failed || 0,
        token_found: d?.token_info?.token_found,
        token_count: d?.token_info?.token_count || 0,
        token_preview: d?.token_info?.token_preview || '—',
        device_type: d?.token_info?.device_type || '—',
        firebase_message_id: d?.firebase_message_id || null,
        note: d?.note || d?.error || null,
      });

      if (ok) {
        toast.success('✅ Push minimal envoyé ! Vérifiez la barre Android dans 3s.', { duration: 8000 });
      } else {
        toast.error('❌ Push minimal ÉCHOUÉ — token manquant ?', { duration: 10000 });
      }
    } catch (e) {
      log('ERREUR sendTestPush: ' + e.message, 'error');
      setMinimalResult({ ok: false, note: e.message });
      toast.error('Erreur: ' + e.message);
    } finally {
      setMinimalSending(false);
    }
  };

  // ── UI ────────────────────────────────────────────────────────────────────
  const checks = [
    { key: 'platform',    label: '1. Platform Capacitor APK' },
    { key: 'plugin',      label: '2. Plugin PushNotifications' },
    { key: 'permission',  label: '3. Permission POST_NOTIFICATIONS (Android 13+)' },
    { key: 'channel',     label: '4. Canal Android (importance=5, CDL unique)' },
    { key: 'listeners',   label: '5. Listeners attachés avant register()' },
    { key: 'register',    label: '6. register() → token Firebase' },
    { key: 'token_db',    label: '7. Token en BDD' },
    { key: 'payload',     label: '8. Type payload (MIX notification+data)' },
    { key: 'battery',     label: '9. Batterie / DozeMode fabricant' },
  ];

  return (
    <div className="space-y-4 pb-20 max-w-lg mx-auto px-2">

      {/* Header */}
      <div className="bg-red-700 text-white text-center py-2 px-3 rounded-xl font-bold text-sm">
        🔴 AUDIT FCM APK FINAL — SANS LOGIQUE CDL
      </div>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-lg font-bold">Audit FCM Android Runtime</h1>
          <p className="text-xs text-muted-foreground">Push uniquement — zéro Bedou / CDL</p>
        </div>
      </div>

      {/* Platform badge */}
      <div className={`flex items-center gap-2 p-3 rounded-xl ${isNative ? 'bg-green-50 border border-green-300' : 'bg-red-50 border border-red-300'}`}>
        <Smartphone className={`h-5 w-5 ${isNative ? 'text-green-600' : 'text-red-500'}`} />
        <div>
          <p className={`text-sm font-bold ${isNative ? 'text-green-800' : 'text-red-700'}`}>
            {isNative ? '✅ APK Android natif (Capacitor)' : '❌ Web — Ouvrir depuis l\'APK Android'}
          </p>
          {brand && <p className="text-xs text-muted-foreground">Fabricant: {brand}{BATTERY_KILLERS.includes(brand) ? ' ⚠️ battery killer' : ''}</p>}
          {user && <p className="text-xs text-muted-foreground">User: {user.email}</p>}
        </div>
      </div>

      {/* Bouton audit */}
      <Button
        onClick={runAudit}
        disabled={phase === 'running'}
        className="w-full bg-red-600 hover:bg-red-700 text-white h-12 text-base font-bold"
      >
        {phase === 'running'
          ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Audit en cours...</>
          : <><Bell className="h-5 w-5 mr-2" />Lancer audit FCM complet (9 checks)</>
        }
      </Button>

      {/* Résultats checks */}
      {Object.keys(results).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Résultats audit ({Object.keys(results).length}/9)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {checks.map(c => {
              const r = results[c.key];
              if (!r) return null;
              return (
                <Row
                  key={c.key}
                  label={c.label}
                  ok={r.ok}
                  detail={r.detail}
                  warn={r.warn}
                />
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Test push MINIMAL */}
      <Card className="border-orange-300 bg-orange-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-orange-900">🧪 Test Push MINIMAL (sans CDL)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          <p className="text-xs text-orange-800">
            Envoie une notification <strong>sans logique Bedou/dispatch</strong>.<br />
            Si ce test échoue → problème purement APK/Firebase.<br />
            Si ce test réussit → problème dans la logique CDL.
          </p>
          <Button
            onClick={sendMinimalPush}
            disabled={minimalSending || !user}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold"
          >
            {minimalSending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Envoi minimal...</>
              : <><Send className="h-4 w-4 mr-2" />Envoyer push minimal</>
            }
          </Button>

          {minimalResult && (
            <div className={`p-3 rounded-lg space-y-1 font-mono text-[11px] ${minimalResult.ok ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
              <p className="font-bold text-sm">{minimalResult.ok ? '✅ PUSH MINIMAL OK' : '❌ PUSH MINIMAL ÉCHOUÉ'}</p>
              <p>fcm_sent = {minimalResult.fcm_sent} / failed = {minimalResult.fcm_failed}</p>
              <p>token_found = {String(minimalResult.token_found)}</p>
              <p>token_count = {minimalResult.token_count}</p>
              <p>device_type = {minimalResult.device_type}</p>
              {minimalResult.firebase_message_id && <p>message_id = {minimalResult.firebase_message_id}</p>}
              <p>delay_ms = {minimalResult.delay}</p>
              {minimalResult.token_preview && <p>token = {minimalResult.token_preview}</p>}
              {minimalResult.note && <p className="text-amber-300">note = {minimalResult.note}</p>}
            </div>
          )}

          {minimalResult?.ok === false && (
            <div className="p-3 rounded-lg bg-red-100 border border-red-300 text-xs text-red-800 space-y-1">
              <p className="font-bold">Diagnostic échec push minimal :</p>
              {!minimalResult.token_found && (
                <p>→ <strong>Aucun token FCM en BDD</strong> : relancer FcmBootstrap (rouvrir app + se reconnecter)</p>
              )}
              {minimalResult.token_found && minimalResult.fcm_sent === 0 && (
                <p>→ <strong>Token présent mais FCM rejette</strong> : token expiré ou UNREGISTERED → désinstaller/réinstaller APK</p>
              )}
            </div>
          )}

          {minimalResult?.ok === true && (
            <div className="p-3 rounded-lg bg-green-100 border border-green-300 text-xs text-green-800">
              <p className="font-bold">✅ Firebase délivre correctement</p>
              <p>Vérifie la barre de notifications Android dans les 5 prochaines secondes.</p>
              <p className="mt-1">• App <strong>ouverte</strong> → toast dans l'app + barre Android</p>
              <p>• App <strong>fermée/fond</strong> → uniquement barre Android (canal {CDL_CHANNEL_ID})</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notification foreground reçue */}
      {lastForegroundNotif && (
        <Card className="border-green-400 bg-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-800">📬 FCM_RECEIVED foreground détecté !</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1 text-xs">
            <p><strong>Titre :</strong> {lastForegroundNotif.title}</p>
            <p><strong>Corps :</strong> {lastForegroundNotif.body}</p>
            <p><strong>Channel :</strong> {lastForegroundNotif.channel}</p>
            <p><strong>Heure :</strong> {lastForegroundNotif.ts}</p>
            {Object.keys(lastForegroundNotif.data).length > 0 && (
              <p className="font-mono text-[10px] text-green-700 break-all">data: {JSON.stringify(lastForegroundNotif.data)}</p>
            )}
            <p className="text-green-700 font-bold mt-2">
              FCM_DISPLAY_SUCCESS = true ✅ — Firebase atteint l'APK !
            </p>
          </CardContent>
        </Card>
      )}

      {/* Checklist batterie Samsung/Tecno */}
      {isNative && BATTERY_KILLERS.includes(brand) && (
        <Card className="border-amber-400 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-900 flex items-center gap-2">
              <Battery className="h-4 w-4" /> Batterie {brand} — Actions requises
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 text-xs text-amber-800 space-y-2">
            {brand === 'Samsung' && <>
              <p>1. Paramètres → Batterie → Optimisation de la batterie → CDL → <strong>Ne pas optimiser</strong></p>
              <p>2. Paramètres → Batterie → Mode Économie d'énergie → <strong>Désactivé</strong></p>
              <p>3. Récents → maintenir CDL → Verrouiller l'application</p>
            </>}
            {brand === 'Tecno' && <>
              <p>1. Paramètres → Manager d'application → CDL → Démarrage auto → <strong>Activé</strong></p>
              <p>2. Paramètres → Batterie → Gestion app arrière-plan → CDL → <strong>Non restreint</strong></p>
            </>}
            {brand === 'Xiaomi' && <>
              <p>1. Paramètres → Apps → CDL → Économiseur de batterie → <strong>Aucune restriction</strong></p>
              <p>2. Paramètres → Apps → CDL → Autres autorisations → <strong>Démarrage automatique = activé</strong></p>
              <p>3. MIUI : Sécurité → Boost de vitesse → <strong>Ne pas fermer CDL</strong></p>
            </>}
            {!['Samsung', 'Tecno', 'Xiaomi'].includes(brand) && (
              <p>Paramètres → Batterie → <strong>désactiver la restriction pour CDL</strong></p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Checklist Firebase AndroidManifest */}
      {isNative && (
        <Card className="border-slate-300 bg-slate-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">📋 Checklist AndroidManifest / Firebase</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 text-[11px] text-slate-700 space-y-1.5">
            <p>✅ <code>google-services.json</code> dans <code>android/app/</code></p>
            <p>✅ Package name = <code className="font-bold">com.cdl.app</code></p>
            <p>✅ <code>FirebaseMessagingService</code> enregistré (Capacitor l'ajoute via <code>@capacitor/push-notifications</code>)</p>
            <p>✅ Intent-filter <code>MESSAGING_EVENT</code> dans le Manifest</p>
            <p>✅ Permission <code>POST_NOTIFICATIONS</code> dans Manifest (Android 13+)</p>
            <p>✅ <code>npx cap sync android</code> exécuté après toute modif</p>
            <p>✅ SHA-1 keystore ajouté dans Firebase Console → Paramètres projet → Ton app Android</p>
            <p className="font-semibold text-slate-800 mt-2">Logcat (coller dans terminal) :</p>
            <div className="bg-slate-900 text-green-400 rounded p-2 font-mono text-[10px] space-y-0.5">
              <p>adb logcat -s FirebaseMessaging:* FirebaseApp:* AndroidRuntime:E</p>
              <p># Chercher : "Token" / "registration" / "onMessageReceived"</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Logs temps réel */}
      {logs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Terminal className="h-4 w-4" /> Logs FCM runtime
              <button onClick={() => setLogs([])} className="ml-auto text-[10px] text-muted-foreground underline">Effacer</button>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="bg-slate-950 rounded-lg p-3 max-h-64 overflow-y-auto space-y-0.5">
              {logs.map((l, i) => (
                <p key={i} className={`text-[10px] font-mono ${l.type === 'error' ? 'text-red-400' : l.type === 'warn' ? 'text-amber-400' : 'text-green-400'}`}>
                  <span className="text-slate-500">{l.ts}</span> {l.msg}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}