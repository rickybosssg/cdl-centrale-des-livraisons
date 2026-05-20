/**
 * FcmChainAudit — Diagnostic complet chaîne FCM
 * Vérifie chaque maillon: permission → token → save BDD → push réel
 */
import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Play, CheckCircle2, XCircle, Loader2, Terminal, Database, Key, Send, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const APP_BASE_URL = 'https://cdl.base44.app';

function isNativeApp() {
  try {
    if (window.location?.protocol === 'capacitor:' || window.location?.protocol === 'file:') return true;
    if (typeof window.Capacitor !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true) return true;
  } catch (_) {}
  return false;
}

function ChainStep({ n, title, status, detail, logs }) {
  const Icon = status === 'ok' ? CheckCircle2 : status === 'error' ? XCircle : status === 'running' ? Loader2 : AlertTriangle;
  const color = status === 'ok' ? 'text-green-600' : status === 'error' ? 'text-red-500' : 'text-blue-500';
  
  return (
    <Card className={status === 'error' ? 'border-red-200 bg-red-50' : status === 'ok' ? 'border-green-200 bg-green-50' : 'border-blue-200 bg-blue-50'}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start gap-3">
          <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
            status === 'ok' ? 'bg-green-200' : status === 'error' ? 'bg-red-200' : 'bg-blue-200'
          }`}>
            <Icon className={`h-4 w-4 ${color} ${status === 'running' ? 'animate-spin' : ''}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">{n}. {title}</p>
            {detail && (
              <p className={`text-xs mt-1 font-mono break-all ${
                status === 'error' ? 'text-red-700' : status === 'ok' ? 'text-green-700' : 'text-blue-700'
              }`}>
                {detail}
              </p>
            )}
            {logs && logs.length > 0 && (
              <div className="mt-2 bg-black/90 rounded-lg p-2 max-h-32 overflow-y-auto">
                {logs.map((l, i) => (
                  <p key={i} className={`text-[10px] font-mono ${
                    l.includes('ERROR') ? 'text-red-400' : l.includes('WARN') ? 'text-amber-400' : 'text-green-400'
                  }`}>
                    {l}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FcmChainAudit() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState([]);
  const [rawToken, setRawToken] = useState(null);
  const [bddTokens, setBddTokens] = useState([]);
  const [pushResult, setPushResult] = useState(null);
  const [firebaseConfig, setFirebaseConfig] = useState(null);
  const [serviceAccountStatus, setServiceAccountStatus] = useState(null);

  useEffect(() => {
    base44.auth.me().then(me => setUser(me));
    
    // Vérifier config Firebase
    setFirebaseConfig({
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'NON_CONFIGURÉ',
      appId: import.meta.env.VITE_FIREBASE_APP_ID || 'NON_CONFIGURÉ',
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY ? 'CONFIGURÉ' : 'MANQUANT',
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || 'NON_CONFIGURÉ',
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY ? 'CONFIGURÉ' : 'MANQUANT',
    });
  }, []);

  const addStep = (title, status = 'running', detail = '', logs = []) => {
    setSteps(prev => [...prev, { title, status, detail, logs }]);
  };

  const updateStep = (index, status, detail = '', logs = []) => {
    setSteps(prev => prev.map((s, i) => i === index ? { ...s, status, detail, logs } : s));
  };

  const runChainAudit = async () => {
    setRunning(true);
    setSteps([]);
    setRawToken(null);
    setBddTokens([]);
    setPushResult(null);
    setServiceAccountStatus(null);

    const email = user?.email;
    if (!email) {
      toast.error('Utilisateur non connecté');
      setRunning(false);
      return;
    }

    const isNative = isNativeApp();
    console.log('[FCM_CHAIN_AUDIT] START | user:', email, '| native:', isNative);

    // ── ÉTAPE 1: Permission Android ───────────────────────────────────────────
    addStep('Permission Android', 'running', 'Vérification...');
    let permissionGranted = false;
    
    if (!isNative) {
      updateStep(0, 'error', 'APK natif requis — test web non valide', ['WARN: Test disponible uniquement sur APK Capacitor']);
      setRunning(false);
      return;
    }

    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const perm = await PushNotifications.checkPermissions();
      permissionGranted = perm.receive === 'granted';
      
      if (!permissionGranted) {
        const req = await PushNotifications.requestPermissions();
        permissionGranted = req.receive === 'granted';
      }

      updateStep(0, 
        permissionGranted ? 'ok' : 'error',
        permissionGranted ? 'Permission accordée ✅' : 'Permission refusée ❌ — aller dans Paramètres → Notifications',
        [`[PERMISSION] status=${permissionGranted ? 'granted' : 'denied'}`]
      );
    } catch (e) {
      updateStep(0, 'error', 'Erreur: ' + e.message, [`ERROR: ${e.message}`]);
      setRunning(false);
      return;
    }

    // ── ÉTAPE 2: Register Firebase ────────────────────────────────────────────
    addStep('Register Firebase → Token', 'running', 'Enregistrement en cours...');
    let receivedToken = null;

    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      
      const tokenProm = new Promise((resolve) => {
        const timer = setTimeout(() => {
          resolve(null);
        }, 20000);

        PushNotifications.addListener('registration', (data) => {
          clearTimeout(timer);
          const t = data?.value;
          if (t && t.length > 100) {
            console.log('[FCM_REGISTER_SUCCESS] token:', t.slice(0, 50) + '...');
            resolve(t);
          } else {
            resolve(null);
          }
        });

        PushNotifications.addListener('registrationError', (err) => {
          clearTimeout(timer);
          console.error('[FCM_REGISTER_FAILED]', err);
          resolve(null);
        });

        PushNotifications.register();
      });

      receivedToken = await tokenProm;
      setRawToken(receivedToken);

      if (receivedToken) {
        updateStep(1, 'ok', `Token reçu (${receivedToken.length} chars)`, [
          `[REGISTER] token_length=${receivedToken.length}`,
          `[REGISTER] preview=${receivedToken.slice(0, 40)}...`
        ]);
      } else {
        updateStep(1, 'error', 'Aucun token — problème SHA-1 ou google-services.json', [
          'ERROR: Token non reçu après 20s',
          'WARN: Vérifier signature SHA-1 dans Firebase Console'
        ]);
        setRunning(false);
        return;
      }
    } catch (e) {
      updateStep(1, 'error', 'CRASH: ' + e.message, [`ERROR: ${e.message}`]);
      setRunning(false);
      return;
    }

    // ── ÉTAPE 3: Save token en BDD ────────────────────────────────────────────
    addStep('Save token → saveFcmTokenPublic', 'running', 'Enregistrement BDD...');
    
    try {
      const res = await fetch(`${APP_BASE_URL}/functions/saveFcmTokenPublic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: email,
          token: receivedToken,
          device_type: 'android_native',
          platform: 'android',
        }),
      });
      
      const data = await res.json();
      console.log('[SAVE_TOKEN] response:', data);

      if (res.ok && data.success) {
        updateStep(2, 'ok', `Token sauvegardé ✅ | action=${data.action} | id=${data.token_id}`, [
          `[SAVE] HTTP ${res.status}`,
          `[SAVE] action=${data.action}`,
          `[SAVE] token_id=${data.token_id}`
        ]);
      } else {
        updateStep(2, 'error', `Échec save | HTTP ${res.status} | ${data.error || '?'}`, [
          `ERROR: HTTP ${res.status}`,
          `ERROR: ${data.error || 'unknown'}`,
          `WARN: step=${data.step || 'unknown'}`
        ]);
      }
    } catch (e) {
      updateStep(2, 'error', 'CRASH: ' + e.message, [`ERROR: ${e.message}`]);
    }

    // ── ÉTAPE 4: Vérifier token en BDD ────────────────────────────────────────
    addStep('Vérifier token en BDD', 'running', 'Lecture FcmToken...');
    await new Promise(r => setTimeout(r, 1000));

    try {
      const tokens = await base44.entities.FcmToken.filter({ user_email: email, is_active: true }, '-registered_at', 10);
      setBddTokens(tokens);

      if (tokens.length > 0) {
        const latest = tokens[0];
        updateStep(3, 'ok', `${tokens.length} token(s) trouvé(s) | device=${latest.device_type}`, [
          `[BDD] count=${tokens.length}`,
          `[BDD] latest_id=${latest.id}`,
          `[BDD] device_type=${latest.device_type}`,
          `[BDD] is_active=${latest.is_active}`
        ]);
      } else {
        updateStep(3, 'error', 'Aucun token actif en BDD', [
          'ERROR: Requête retournée 0 résultats',
          `WARN: email=${email}`,
          'WARN: filter={is_active: true}'
        ]);
      }
    } catch (e) {
      updateStep(3, 'error', 'CRASH: ' + e.message, [`ERROR: ${e.message}`]);
    }

    // ── ÉTAPE 5: Tester push Admin ────────────────────────────────────────────
    addStep('Test push Admin', 'running', 'Appel sendCdlNotification...');
    
    try {
      const res = await base44.functions.invoke('sendCdlNotification', {
        role: 'admin',
        title: '🧪 Test chaîne FCM',
        body: `Test ${new Date().toLocaleTimeString('fr-FR')}`,
        data: { type: 'chain_audit', test_id: Date.now() },
      });

      const d = res.data;
      setPushResult(d);
      console.log('[PUSH_TEST] result:', d);

      if ((d?.sent || 0) > 0 || (d?.bdd || 0) > 0) {
        updateStep(4, 'ok', `Push envoyé ✅ | sent=${d?.sent} bdd=${d?.bdd}`, [
          `[PUSH] sent=${d?.sent}`,
          `[PUSH] bdd=${d?.bdd}`,
          `[PUSH] total=${d?.total}`
        ]);
        toast.success('✅ Push envoyé — vérifiez la barre Android');
      } else {
        const errorMsg = d?.error || d?.note || 'Aucun détail';
        updateStep(4, 'error', `Échec push | ${errorMsg}`, [
          `ERROR: sent=${d?.sent || 0}`,
          `ERROR: bdd=${d?.bdd || 0}`,
          `ERROR: ${errorMsg}`
        ]);
        toast.error('❌ Push échoué — voir logs');
      }
    } catch (e) {
      updateStep(4, 'error', `CRASH ${e.status || ''}: ${e.message}`, [
        `ERROR: ${e.message}`,
        `ERROR: status=${e.status || 'unknown'}`,
        e.status === 403 ? 'CRITICAL: 403 Forbidden — vérifier service account Firebase' : ''
      ]);
      toast.error(`Erreur push: ${e.message}`);
    }

    // ── ÉTAPE 6: Vérifier service account Firebase ───────────────────────────
    addStep('Service Account Firebase', 'running', 'Vérification credentials...');
    
    try {
      const res = await base44.functions.invoke('testFirebaseSetup');
      const d = res.data;
      console.log('[FIREBASE_TEST] result:', d);

      if (d?.status === 'ok') {
        setServiceAccountStatus('valid');
        updateStep(5, 'ok', 'Service account valide ✅', [
          `[FIREBASE] status=${d.status}`,
          `[FIREBASE] project=${d.project_id}`,
          `[FIREBASE] api_enabled=${d.api_enabled || '?'}`
        ]);
      } else {
        setServiceAccountStatus('invalid');
        updateStep(5, 'error', `Service account invalide ❌ | ${d?.error || '?'}`, [
          `ERROR: status=${d?.status}`,
          `ERROR: ${d?.error || 'unknown'}`
        ]);
      }
    } catch (e) {
      setServiceAccountStatus('error');
      updateStep(5, 'error', `CRASH: ${e.message}`, [
        `ERROR: ${e.message}`,
        e.status === 403 ? 'CRITICAL: 403 — credentials Firebase invalids ou expirés' : ''
      ]);
    }

    // ── ÉTAPE 7: Vérifier config Firebase ─────────────────────────────────────
    addStep('Config Firebase (frontend)', 'running', 'Vérification variables...');
    
    const missingVars = [];
    if (!firebaseConfig?.projectId || firebaseConfig.projectId === 'NON_CONFIGURÉ') missingVars.push('VITE_FIREBASE_PROJECT_ID');
    if (!firebaseConfig?.appId || firebaseConfig.appId === 'NON_CONFIGURÉ') missingVars.push('VITE_FIREBASE_APP_ID');
    if (!firebaseConfig?.apiKey || firebaseConfig.apiKey === 'MANQUANT') missingVars.push('VITE_FIREBASE_API_KEY');
    if (!firebaseConfig?.messagingSenderId || firebaseConfig.messagingSenderId === 'NON_CONFIGURÉ') missingVars.push('VITE_FIREBASE_MESSAGING_SENDER_ID');
    if (!firebaseConfig?.vapidKey || firebaseConfig.vapidKey === 'MANQUANT') missingVars.push('VITE_FIREBASE_VAPID_KEY');

    if (missingVars.length === 0) {
      updateStep(6, 'ok', 'Toutes variables configurées ✅', [
        `[CONFIG] project=${firebaseConfig.projectId}`,
        `[CONFIG] app_id=${firebaseConfig.appId}`
      ]);
    } else {
      updateStep(6, 'error', `Variables manquantes: ${missingVars.join(', ')}`, [
        `ERROR: missing=${missingVars.join(',')}`,
        'WARN: Vérifier dashboard → Settings → Environment variables'
      ]);
    }

    setRunning(false);
    console.log('[FCM_CHAIN_AUDIT] DONE');
    toast.success('Audit chaîne FCM terminé');
  };

  const okCount = steps.filter(s => s.status === 'ok').length;
  const errCount = steps.filter(s => s.status === 'error').length;
  const allOk = okCount === 7;

  return (
    <div className="space-y-4 pb-20 max-w-2xl mx-auto px-2">

      {/* Header status */}
      <div className={`text-white text-center py-3 px-3 rounded-xl font-bold text-base ${
        allOk ? 'bg-green-700' : errCount > 0 ? 'bg-red-700' : 'bg-primary'
      }`}>
        {allOk ? '✅ CHAÎNE FCM COMPLÈTE — OPÉRATIONNELLE' 
         : errCount > 0 ? `❌ ${errCount} ÉTAPE(S) EN ÉCHEC` 
         : '🔗 AUDIT CHAÎNE FCM'}
      </div>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Diagnostic Chaîne FCM</h1>
          <p className="text-xs text-muted-foreground">
            Permission → Token → BDD → Push
            {user && ` | ${user.email}`}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => { setSteps([]); setRawToken(null); setBddTokens([]); setPushResult(null); }}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Scores */}
      {steps.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="p-3 rounded-xl bg-primary/10 text-center">
            <p className="text-2xl font-extrabold text-primary">{steps.length}/7</p>
            <p className="text-[10px] text-muted-foreground">Étapes</p>
          </div>
          <div className="p-3 rounded-xl bg-green-50 text-center">
            <p className="text-2xl font-extrabold text-green-700">{okCount}</p>
            <p className="text-[10px] text-muted-foreground">OK ✅</p>
          </div>
          <div className="p-3 rounded-xl bg-red-50 text-center">
            <p className="text-2xl font-extrabold text-red-600">{errCount}</p>
            <p className="text-[10px] text-muted-foreground">ÉCHEC ❌</p>
          </div>
        </div>
      )}

      {/* Lancer audit */}
      <Button
        onClick={runChainAudit}
        disabled={running || !user}
        className="w-full h-14 text-base font-bold"
      >
        {running
          ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Audit en cours...</>
          : <><Play className="h-5 w-5 mr-2" />Lancer audit complet (7 étapes)</>
        }
      </Button>

      {/* Config Firebase */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Key className="h-4 w-4" /> Config Firebase (frontend)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 text-xs space-y-1">
          <p className="flex items-center justify-between">
            <span className="text-muted-foreground">Project ID:</span>
            <span className={`font-mono ${firebaseConfig?.projectId && firebaseConfig.projectId !== 'NON_CONFIGURÉ' ? 'text-green-700' : 'text-red-600'}`}>
              {firebaseConfig?.projectId || '—'}
            </span>
          </p>
          <p className="flex items-center justify-between">
            <span className="text-muted-foreground">App ID:</span>
            <span className={`font-mono ${firebaseConfig?.appId && firebaseConfig.appId !== 'NON_CONFIGURÉ' ? 'text-green-700' : 'text-red-600'}`}>
              {firebaseConfig?.appId || '—'}
            </span>
          </p>
          <p className="flex items-center justify-between">
            <span className="text-muted-foreground">API Key:</span>
            <span className={`font-mono ${firebaseConfig?.apiKey === 'CONFIGURÉ' ? 'text-green-700' : 'text-red-600'}`}>
              {firebaseConfig?.apiKey || '—'}
            </span>
          </p>
          <p className="flex items-center justify-between">
            <span className="text-muted-foreground">Sender ID:</span>
            <span className={`font-mono ${firebaseConfig?.messagingSenderId && firebaseConfig.messagingSenderId !== 'NON_CONFIGURÉ' ? 'text-green-700' : 'text-red-600'}`}>
              {firebaseConfig?.messagingSenderId || '—'}
            </span>
          </p>
          <p className="flex items-center justify-between">
            <span className="text-muted-foreground">VAPID Key:</span>
            <span className={`font-mono ${firebaseConfig?.vapidKey === 'CONFIGURÉ' ? 'text-green-700' : 'text-red-600'}`}>
              {firebaseConfig?.vapidKey || '—'}
            </span>
          </p>
        </CardContent>
      </Card>

      {/* Étapes */}
      {steps.length > 0 && (
        <div className="space-y-3">
          {steps.map((s, i) => (
            <ChainStep
              key={i}
              n={i + 1}
              title={s.title}
              status={s.status}
              detail={s.detail}
              logs={s.logs}
            />
          ))}
        </div>
      )}

      {/* Token brut */}
      {rawToken && (
        <Card className="border-blue-300 bg-blue-50">
          <CardContent className="p-3 space-y-1">
            <p className="text-xs font-bold text-blue-800 flex items-center gap-2">
              <Key className="h-4 w-4" /> Token Firebase Brut
            </p>
            <code className="text-[10px] font-mono text-blue-700 break-all block">
              {rawToken}
            </code>
            <p className="text-[10px] text-blue-600">Longueur: {rawToken.length}</p>
          </CardContent>
        </Card>
      )}

      {/* Tokens BDD */}
      {bddTokens.length > 0 && (
        <Card className="border-green-300 bg-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="h-4 w-4" /> Tokens en BDD ({bddTokens.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {bddTokens.map((t, i) => (
              <div key={t.id} className="p-2 rounded-lg bg-white border border-green-200 space-y-0.5">
                <p className="text-[10px] font-mono text-green-700 break-all">
                  {t.token.slice(0, 60)}...
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Device: {t.device_type} | Actif: {t.is_active ? 'Oui' : 'Non'} | 
                  Last used: {t.last_used ? new Date(t.last_used).toLocaleString('fr') : 'N/A'}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Résultat push */}
      {pushResult && (
        <Card className={pushResult.sent > 0 || pushResult.bdd > 0 ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Send className="h-4 w-4" /> Résultat Push Test
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1 text-xs">
            <p className="flex items-center justify-between">
              <span className="text-muted-foreground">Sent:</span>
              <span className={`font-bold ${pushResult.sent > 0 ? 'text-green-700' : 'text-red-600'}`}>
                {pushResult.sent || 0}
              </span>
            </p>
            <p className="flex items-center justify-between">
              <span className="text-muted-foreground">BDD:</span>
              <span className={`font-bold ${pushResult.bdd > 0 ? 'text-green-700' : 'text-red-600'}`}>
                {pushResult.bdd || 0}
              </span>
            </p>
            <p className="flex items-center justify-between">
              <span className="text-muted-foreground">Total:</span>
              <span className={`font-bold ${pushResult.total > 0 ? 'text-green-700' : 'text-red-600'}`}>
                {pushResult.total || 0}
              </span>
            </p>
            {pushResult.error && (
              <p className="text-red-700 mt-2 font-mono break-all">
                ERROR: {pushResult.error}
              </p>
            )}
            {pushResult.note && (
              <p className="text-amber-700 mt-2 font-mono break-all">
                NOTE: {pushResult.note}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Diagnostic auto */}
      {errCount > 0 && (
        <Card className="border-red-300 bg-red-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-red-800">🔍 Diagnostic Automatique</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 text-xs space-y-1.5 text-red-900">
            {steps[1]?.status === 'error' && (
              <p>→ <strong>Token non reçu:</strong> Vérifier SHA-1 dans Firebase Console + google-services.json</p>
            )}
            {steps[2]?.status === 'error' && (
              <p>→ <strong>Save BDD échouée:</strong> Vérifier fonction saveFcmTokenPublic (logs backend)</p>
            )}
            {steps[3]?.status === 'error' && (
              <p>→ <strong>Token absent BDD:</strong> Requête filter peut-être incorrecte ou token non persisté</p>
            )}
            {steps[4]?.status === 'error' && (
              <p>→ <strong>Push échoué:</strong> sendCdlNotification retourne erreur — vérifier service account Firebase</p>
            )}
            {steps[5]?.status === 'error' && (
              <p>→ <strong>Service Account invalide:</strong> 403 Forbidden — credentials Firebase expirés ou mal configurés</p>
            )}
            {steps[6]?.status === 'error' && (
              <p>→ <strong>Config Firebase manquante:</strong> Variables d'environnement non configurées dans dashboard</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}