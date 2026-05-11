/**
 * FcmRegisterAudit — Audit précis de la chaîne register() → token → saveFcmTokenPublic → BDD
 *
 * 8 étapes auditées indépendamment :
 * 1. register() firebase retourne-t-il un token ?
 * 2. onRegistration reçoit-il bien le token ?
 * 3. Email disponible au moment du save ?
 * 4. saveFcmTokenPublic est-il atteignable (ping) ?
 * 5. L'appel API réussit-il (HTTP 200 + success=true) ?
 * 6. La table BDD contient-elle un record après save ?
 * 7. Le token est-il is_active=true ?
 * 8. test push minimal via sendCdlNotification ?
 */

import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, XCircle, AlertCircle, Loader2,
  RefreshCw, Play, Terminal
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const APP_BASE_URL = 'https://cdl.base44.app';
const SAVE_URL = `${APP_BASE_URL}/functions/saveFcmTokenPublic`;

function isNativeApp() {
  try {
    const p = window.location?.protocol;
    if (p === 'capacitor:' || p === 'file:') return true;
    if (typeof window.Capacitor !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true) return true;
  } catch (_) {}
  return false;
}

// Statut visuel
function StatusIcon({ status }) {
  if (status === 'ok') return <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />;
  if (status === 'error') return <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />;
  if (status === 'running') return <Loader2 className="h-4 w-4 text-blue-500 flex-shrink-0 animate-spin" />;
  if (status === 'warn') return <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />;
  return <div className="h-4 w-4 rounded-full border-2 border-muted flex-shrink-0" />;
}

function AuditRow({ step, label, status, detail, extra }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b last:border-0">
      <StatusIcon status={status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-muted-foreground w-5 flex-shrink-0">{step}</span>
          <p className="text-sm font-medium">{label}</p>
        </div>
        {detail && (
          <p className={`text-xs mt-0.5 break-all font-mono ${status === 'error' ? 'text-red-600' : status === 'ok' ? 'text-green-700' : 'text-muted-foreground'}`}>
            {detail}
          </p>
        )}
        {extra && <p className="text-[10px] text-amber-700 mt-0.5">{extra}</p>}
      </div>
    </div>
  );
}

export default function FcmRegisterAudit() {
  const navigate = useNavigate();
  const [isNative] = useState(() => isNativeApp());
  const [user, setUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState({});
  const [finalToken, setFinalToken] = useState(null);
  const listenersRef = useRef([]);

  const log = (msg, type = 'info') => {
    const ts = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    // Tags standardisés
    const tags = ['[FCM_REGISTER_SUCCESS]', '[FCM_TOKEN_RECEIVED]', '[FCM_SAVE_ATTEMPT]', '[FCM_SAVE_SUCCESS]', '[FCM_SAVE_FAILED]'];
    const tag = tags.find(t => msg.includes(t.replace('[', '').replace(']', ''))) || '';
    if (tag) console.log(tag + ' ' + msg);
    else console.log('[FCM_AUDIT] ' + msg);
    setLogs(prev => [...prev.slice(-80), { ts, msg, type }]);
  };

  const setStep = (key, val) => setSteps(prev => ({ ...prev, [key]: val }));

  useEffect(() => {
    base44.auth.me().then(me => {
      setUser(me);
      log(`USER: ${me?.email || 'non connecté'} | role=${me?.role || '?'}`);
    }).catch(e => log('auth.me() error: ' + e.message, 'error'));

    return () => {
      listenersRef.current.forEach(l => { try { l.remove(); } catch (_) {} });
    };
  }, []);

  const runAudit = async () => {
    setRunning(true);
    setSteps({});
    setFinalToken(null);
    setLogs([]);
    log('═══ AUDIT FCM REGISTER → SAVE → BDD ═══');

    // Nettoyer les anciens listeners
    for (const l of listenersRef.current) { try { await l.remove(); } catch (_) {} }
    listenersRef.current = [];

    // ── ÉTAPE 1 : email disponible ────────────────────────────────────────────
    setStep('email', { status: 'running', detail: 'Résolution email...' });
    log('ÉTAPE 1 — Email');
    let email = null;
    try {
      const me = await base44.auth.me();
      email = me?.email || null;
      if (email) {
        setStep('email', { status: 'ok', detail: email });
        log(`[FCM_TOKEN_RECEIVED] email résolu = ${email}`, 'info');
      } else {
        setStep('email', { status: 'error', detail: 'auth.me() = null — non connecté ?' });
        log('EMAIL VIDE — impossible de sauvegarder sans email', 'error');
        setRunning(false);
        return;
      }
    } catch (e) {
      setStep('email', { status: 'error', detail: 'auth.me() error: ' + e.message });
      log('auth.me() CRASH: ' + e.message, 'error');
      setRunning(false);
      return;
    }

    // ── ÉTAPE 2 : Ping saveFcmTokenPublic ─────────────────────────────────────
    setStep('ping', { status: 'running', detail: 'Test connectivité endpoint...' });
    log('ÉTAPE 2 — Ping ' + SAVE_URL);
    try {
      const pingRes = await fetch(SAVE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_email: email, token: '' }), // token vide → doit retourner 400
      });
      const pingText = await pingRes.text();
      log(`[FCM_SAVE_ATTEMPT] Ping HTTP ${pingRes.status} | body=${pingText.slice(0, 100)}`);
      if (pingRes.status === 400 || pingRes.status === 200) {
        setStep('ping', { status: 'ok', detail: `Endpoint atteignable (HTTP ${pingRes.status})` });
        log('Endpoint ATTEIGNABLE ✅');
      } else {
        setStep('ping', { status: 'warn', detail: `HTTP ${pingRes.status} inattendu: ${pingText.slice(0, 80)}` });
        log(`Endpoint répondu HTTP ${pingRes.status}`, 'warn');
      }
    } catch (pingErr) {
      setStep('ping', { status: 'error', detail: 'fetch error: ' + pingErr.message, extra: 'CORS ou réseau bloqué ?' });
      log('[FCM_SAVE_FAILED] Ping FAILED: ' + pingErr.message, 'error');
    }

    // ── ÉTAPE 3 : Save avec token synthétique (sans Firebase) ─────────────────
    setStep('synthetic', { status: 'running', detail: 'Test save token synthétique...' });
    const syntheticToken = 'synth_audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    log(`ÉTAPE 3 — Save synthétique | token=${syntheticToken.slice(0, 35)}`);
    log(`[FCM_SAVE_ATTEMPT] synthétique | user=${email} | token=${syntheticToken.slice(0, 35)}`);
    try {
      const sRes = await fetch(SAVE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_email: email, token: syntheticToken, device_type: 'android_native' }),
      });
      const sText = await sRes.text();
      log(`[FCM_SAVE_ATTEMPT] HTTP ${sRes.status} | body=${sText.slice(0, 200)}`);
      let sData = {};
      try { sData = JSON.parse(sText); } catch (_) {}

      if (sRes.ok && sData.success) {
        setStep('synthetic', { status: 'ok', detail: `action=${sData.action} | token_id=${sData.token_id}` });
        log(`[FCM_SAVE_SUCCESS] Synthétique OK | action=${sData.action} | id=${sData.token_id}`, 'info');
      } else {
        setStep('synthetic', { status: 'error', detail: `HTTP ${sRes.status} | step=${sData.step || '?'} | ${sData.error || sText.slice(0, 100)}` });
        log(`[FCM_SAVE_FAILED] Synthétique FAILED | step=${sData.step} | error=${sData.error}`, 'error');
      }
    } catch (e) {
      setStep('synthetic', { status: 'error', detail: 'fetch error: ' + e.message });
      log('[FCM_SAVE_FAILED] fetch synthétique CRASH: ' + e.message, 'error');
    }

    // ── ÉTAPE 4 : Vérifier BDD après save synthétique ─────────────────────────
    setStep('db_check', { status: 'running', detail: 'Vérification BDD...' });
    log('ÉTAPE 4 — Vérification BDD après save synthétique');
    try {
      await new Promise(r => setTimeout(r, 500)); // attendre propagation BDD
      const dbTokens = await base44.entities.FcmToken.filter({ user_email: email });
      const synthFound = dbTokens.find(t => t.token === syntheticToken);
      if (synthFound) {
        setStep('db_check', { status: 'ok', detail: `token synthétique trouvé en BDD | id=${synthFound.id} | is_active=${synthFound.is_active}` });
        log(`[FCM_SAVE_SUCCESS] ✅ BDD CONFIRMÉE | id=${synthFound.id} | tokens_total=${dbTokens.length}`, 'info');
      } else {
        setStep('db_check', {
          status: 'error',
          detail: `Token synthétique ABSENT de la BDD | tokens_trouvés=${dbTokens.length}`,
          extra: 'RLS Supabase bloquant ? SDK asServiceRole non autorisé ?',
        });
        log(`[FCM_SAVE_FAILED] BDD: token synthétique NON TROUVÉ | tokens_existants=${dbTokens.map(t => t.token?.slice(0, 20)).join(', ')}`, 'error');
      }
    } catch (e) {
      setStep('db_check', { status: 'error', detail: 'Lecture BDD error: ' + e.message });
      log('[FCM_SAVE_FAILED] lecture BDD CRASH: ' + e.message, 'error');
    }

    // ── ÉTAPE 5 : register() Firebase (APK natif uniquement) ──────────────────
    if (!isNative) {
      setStep('register', { status: 'warn', detail: 'Non-natif — register() non testable ici' });
      log('ÉTAPE 5 — register() — SKIPPED (pas APK natif)');
    } else {
      setStep('register', { status: 'running', detail: 'Chargement plugin + register()...' });
      log('ÉTAPE 5 — register() Capacitor');

      const tokenProm = new Promise(async (resolve) => {
        const timer = setTimeout(() => {
          log('[FCM_SAVE_FAILED] register() TIMEOUT 20s — aucun token reçu', 'error');
          resolve(null);
        }, 20000);

        try {
          const { PushNotifications } = await import('@capacitor/push-notifications');

          // Canal
          try {
            await PushNotifications.createChannel({
              id: 'cdl_critical_alerts_v2',
              name: 'CDL Alertes Critiques',
              importance: 5,
              sound: 'default',
              vibration: true,
            });
            log('Canal cdl_critical_alerts_v2 créé/vérifié ✅');
          } catch (ce) { log('Canal: ' + ce.message, 'warn'); }

          // Permission
          let perm;
          try {
            const check = await PushNotifications.checkPermissions();
            perm = check.receive;
            if (perm !== 'granted') {
              const req = await PushNotifications.requestPermissions();
              perm = req.receive;
            }
            log(`Permission POST_NOTIFICATIONS = ${perm}`);
          } catch (pe) { log('Permission error: ' + pe.message, 'warn'); }

          // Listener registration
          const regHandle = await PushNotifications.addListener('registration', async (tokenData) => {
            clearTimeout(timer);
            const t = tokenData?.value;
            log(`[FCM_REGISTER_SUCCESS] registration callback reçu | token=${t ? t.slice(0, 30) + '...' : 'VIDE'} | len=${t?.length || 0}`);

            if (t && t.length > 20) {
              log(`[FCM_TOKEN_RECEIVED] token valide | preview=${t.slice(0, 30)}`);
              resolve(t);
            } else {
              log('[FCM_SAVE_FAILED] registration token VIDE ou trop court', 'error');
              resolve(null);
            }
            regHandle.remove().catch(() => {});
          });
          listenersRef.current.push(regHandle);

          const errHandle = await PushNotifications.addListener('registrationError', (err) => {
            clearTimeout(timer);
            log('[FCM_SAVE_FAILED] registrationError: ' + JSON.stringify(err), 'error');
            resolve(null);
            errHandle.remove().catch(() => {});
          });
          listenersRef.current.push(errHandle);

          log('[FCM_REGISTER_SUCCESS] register() appelé — attente token...');
          await PushNotifications.register();
          log('[FCM_REGISTER_SUCCESS] register() retourné — en attente callback...');

        } catch (e) {
          clearTimeout(timer);
          log('[FCM_SAVE_FAILED] register() CRASH: ' + e.message, 'error');
          resolve(null);
        }
      });

      const receivedToken = await tokenProm;

      if (receivedToken) {
        setFinalToken(receivedToken);
        setStep('register', { status: 'ok', detail: `Token Firebase reçu (${receivedToken.length} chars) | ${receivedToken.slice(0, 40)}...` });
        log(`[FCM_TOKEN_RECEIVED] ✅ Token Firebase valide | len=${receivedToken.length}`, 'info');

        // ── ÉTAPE 6 : Save token réel Firebase ──────────────────────────────────
        setStep('save_real', { status: 'running', detail: 'Save token réel Firebase...' });
        log(`[FCM_SAVE_ATTEMPT] Token réel | user=${email} | preview=${receivedToken.slice(0, 30)}`);
        try {
          const saveRes = await fetch(SAVE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_email: email, token: receivedToken, device_type: 'android_native' }),
          });
          const saveText = await saveRes.text();
          log(`[FCM_SAVE_ATTEMPT] HTTP ${saveRes.status} | body=${saveText.slice(0, 200)}`);
          let saveData = {};
          try { saveData = JSON.parse(saveText); } catch (_) {}

          if (saveRes.ok && saveData.success) {
            setStep('save_real', { status: 'ok', detail: `action=${saveData.action} | token_id=${saveData.token_id}` });
            log(`[FCM_SAVE_SUCCESS] ✅ Token Firebase SAUVÉ | action=${saveData.action} | id=${saveData.token_id}`, 'info');
          } else {
            setStep('save_real', { status: 'error', detail: `HTTP ${saveRes.status} | ${saveData.error || saveText.slice(0, 100)}` });
            log(`[FCM_SAVE_FAILED] Save token réel FAILED | HTTP ${saveRes.status} | error=${saveData.error}`, 'error');
          }
        } catch (e) {
          setStep('save_real', { status: 'error', detail: e.message });
          log('[FCM_SAVE_FAILED] fetch token réel CRASH: ' + e.message, 'error');
        }

        // ── ÉTAPE 7 : Vérif BDD token réel ──────────────────────────────────────
        setStep('db_real', { status: 'running', detail: 'Vérification BDD token réel...' });
        log('ÉTAPE 7 — Vérif BDD token réel');
        try {
          await new Promise(r => setTimeout(r, 800));
          const finalTokens = await base44.entities.FcmToken.filter({ user_email: email, is_active: true });
          const found = finalTokens.find(t => t.token === receivedToken);
          if (found) {
            setStep('db_real', { status: 'ok', detail: `✅ Token actif en BDD | id=${found.id} | device=${found.device_type}` });
            log(`[FCM_SAVE_SUCCESS] ✅ BDD CONFIRMÉE token réel | id=${found.id} | total_actifs=${finalTokens.length}`, 'info');
          } else {
            setStep('db_real', {
              status: 'error',
              detail: `Token réel ABSENT de la BDD | tokens_actifs=${finalTokens.length}`,
              extra: 'Possible RLS / policy Supabase bloquant le service role',
            });
            log(`[FCM_SAVE_FAILED] BDD: token réel NON TROUVÉ | tokens_actifs=${finalTokens.length}`, 'error');
          }
        } catch (e) {
          setStep('db_real', { status: 'error', detail: e.message });
          log('[FCM_SAVE_FAILED] BDD vérif token réel CRASH: ' + e.message, 'error');
        }

      } else {
        setStep('register', { status: 'error', detail: 'register() = pas de token après 20s', extra: 'SHA-1 keystore ? google-services.json ? Internet ?' });
      }
    }

    // ── ÉTAPE 8 : Test push final ──────────────────────────────────────────────
    setStep('push', { status: 'running', detail: 'Test push via sendCdlNotification...' });
    log('ÉTAPE 8 — Test push final');
    try {
      const pushRes = await base44.functions.invoke('sendTestPush', { target_email: email });
      const d = pushRes.data;
      if ((d?.fcm_sent || 0) > 0) {
        setStep('push', { status: 'ok', detail: `fcm_sent=${d.fcm_sent} | token_found=${d.token_info?.token_found}` });
        log(`[FCM_SAVE_SUCCESS] Push final OK | fcm_sent=${d.fcm_sent}`, 'info');
        toast.success('✅ Push envoyé ! Vérifiez la barre Android.');
      } else {
        setStep('push', { status: 'error', detail: `fcm_sent=0 | token_found=${d?.token_info?.token_found} | note=${d?.note || '?'}` });
        log(`[FCM_SAVE_FAILED] Push final FAILED | fcm_sent=0 | note=${d?.note}`, 'error');
      }
    } catch (e) {
      setStep('push', { status: 'error', detail: e.message });
      log('[FCM_SAVE_FAILED] sendTestPush CRASH: ' + e.message, 'error');
    }

    log('═══ AUDIT TERMINÉ ═══');
    setRunning(false);
    toast.success('Audit complet terminé');
  };

  const auditSteps = [
    { key: 'email',     label: '1. Email disponible pour save' },
    { key: 'ping',      label: '2. Endpoint saveFcmTokenPublic atteignable' },
    { key: 'synthetic', label: '3. Save token synthétique (sans Firebase)' },
    { key: 'db_check',  label: '4. Vérification BDD après save synthétique' },
    { key: 'register',  label: '5. register() → token Firebase reçu' },
    { key: 'save_real', label: '6. Save token Firebase réel en BDD' },
    { key: 'db_real',   label: '7. Vérification BDD token Firebase actif' },
    { key: 'push',      label: '8. Test push final sendCdlNotification' },
  ];

  const doneCount = Object.values(steps).filter(s => s.status === 'ok').length;
  const errorCount = Object.values(steps).filter(s => s.status === 'error').length;

  return (
    <div className="space-y-4 pb-20 max-w-lg mx-auto px-2">

      <div className="bg-amber-600 text-white text-center py-2 px-3 rounded-xl font-bold text-sm">
        🔍 AUDIT REGISTER → TOKEN → SAVE → BDD
      </div>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Audit FCM Register → Save</h1>
          <p className="text-xs text-muted-foreground">
            {isNative ? '✅ APK Android natif' : '⚠️ Web — register() non testable'}
            {user && ` | ${user.email}`}
          </p>
        </div>
      </div>

      {/* Compteurs */}
      {Object.keys(steps).length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded-xl bg-primary/10 text-center">
            <p className="text-xl font-extrabold text-primary">{Object.keys(steps).length}</p>
            <p className="text-[10px] text-muted-foreground">Étapes</p>
          </div>
          <div className="p-2 rounded-xl bg-green-50 text-center">
            <p className="text-xl font-extrabold text-green-700">{doneCount}</p>
            <p className="text-[10px] text-muted-foreground">OK</p>
          </div>
          <div className="p-2 rounded-xl bg-red-50 text-center">
            <p className="text-xl font-extrabold text-red-600">{errorCount}</p>
            <p className="text-[10px] text-muted-foreground">Erreurs</p>
          </div>
        </div>
      )}

      {/* Bouton lancer audit */}
      <Button
        onClick={runAudit}
        disabled={running}
        className="w-full h-12 text-base font-bold bg-amber-600 hover:bg-amber-700 text-white"
      >
        {running
          ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Audit en cours...</>
          : <><Play className="h-5 w-5 mr-2" />Lancer audit complet (8 étapes)</>
        }
      </Button>

      {/* Résultats étapes */}
      {Object.keys(steps).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Résultats — {doneCount}/{auditSteps.length} OK</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {auditSteps.map(s => {
              const r = steps[s.key];
              if (!r) return null;
              return (
                <AuditRow
                  key={s.key}
                  step={s.key.replace('email', '1').replace('ping', '2').replace('synthetic', '3').replace('db_check', '4').replace('register', '5').replace('save_real', '6').replace('db_real', '7').replace('push', '8')}
                  label={s.label}
                  status={r.status}
                  detail={r.detail}
                  extra={r.extra}
                />
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Token Firebase reçu */}
      {finalToken && (
        <Card className="border-green-300 bg-green-50">
          <CardContent className="p-3 space-y-1">
            <p className="text-xs font-bold text-green-800">[FCM_REGISTER_SUCCESS] Token Firebase reçu ✅</p>
            <p className="text-[10px] font-mono text-green-700 break-all">{finalToken.slice(0, 80)}...</p>
            <p className="text-[10px] text-green-600">Longueur: {finalToken.length} chars</p>
          </CardContent>
        </Card>
      )}

      {/* Diagnostic si erreur BDD */}
      {(steps.db_check?.status === 'error' || steps.db_real?.status === 'error') && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="p-3 space-y-2 text-xs text-red-800">
            <p className="font-bold">🔴 Problème BDD détecté — causes possibles :</p>
            <p>1. <strong>RLS Supabase</strong> bloque les writes sans auth → vérifier policies sur table FcmToken</p>
            <p>2. <strong>BASE44_APP_ID</strong> non défini dans les secrets → le SDK asServiceRole ne peut pas s'initialiser</p>
            <p>3. <strong>CORS</strong> bloque l'appel depuis l'APK (protocol=capacitor:)</p>
            <p>4. <strong>SDK version</strong> — vérifier que @base44/sdk@0.8.25 est disponible sur Deno</p>
          </CardContent>
        </Card>
      )}

      {/* Logs temps réel */}
      {logs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Terminal className="h-4 w-4" /> Logs audit
              <button onClick={() => setLogs([])} className="ml-auto text-[10px] text-muted-foreground underline">Effacer</button>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="bg-slate-950 rounded-lg p-3 max-h-72 overflow-y-auto space-y-0.5">
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