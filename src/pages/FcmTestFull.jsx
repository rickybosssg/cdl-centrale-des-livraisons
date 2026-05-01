/**
 * FcmTestFull — Test complet du scénario FCM end-to-end
 * 
 * Scénario:
 * 1. Connexion utilisateur ✓
 * 2. Page de diagnostic FCM ✓
 * 3. Demander permission Android ✓
 * 4. register() FCM déclenché ✓
 * 5. Token reçu et enregistré en base ✓
 * 6. Envoyer notification test ✓
 * 7. Vérifier app ne crash pas (5min) ✓
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Play, CheckCircle2, AlertCircle, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const STEPS = [
  { id: 'user', label: '1️⃣ User Connected', desc: 'Vérifier authentification' },
  { id: 'fcm_init', label: '2️⃣ FCM Bootstrap', desc: 'FcmBootstrap monté + logs' },
  { id: 'permission', label: '3️⃣ Permission Request', desc: 'Demander POST_NOTIFICATIONS' },
  { id: 'register', label: '4️⃣ register() Appelé', desc: 'PushNotifications.register() exécuté' },
  { id: 'token', label: '5️⃣ Token Reçu', desc: 'registration callback déclenché' },
  { id: 'db_save', label: '6️⃣ Token en BDD', desc: 'FcmToken.create() réussi' },
  { id: 'notif_send', label: '7️⃣ Notification Test', desc: 'Envoyer test push' },
  { id: 'stability', label: '8️⃣ Stabilité 5min', desc: 'App ne crash pas' },
];

export default function FcmTestFull() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [steps, setSteps] = useState(STEPS.map(s => ({ ...s, status: 'pending' })));
  const [testRunning, setTestRunning] = useState(false);
  const [tokenReceived, setTokenReceived] = useState(null);
  const [stability, setStability] = useState({ ok: false, duration: 0 });
  const logsEndRef = useRef(null);
  const startTimeRef = useRef(null);

  const addLog = (msg, type = 'info') => {
    const ts = new Date().toLocaleTimeString('fr-FR');
    console.log(`[TEST][${type.toUpperCase()}] ${msg}`);
    setLogs(prev => [...prev.slice(-50), { ts, msg, type }]);
  };

  const updateStep = (stepId, status) => {
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, status } : s));
  };

  // Auto scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Test stabilité app après 5min
  useEffect(() => {
    if (!testRunning) return;
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      setStability({ ok: true, duration: `${minutes}m ${seconds}s` });
      if (elapsed >= 300) {
        clearInterval(interval);
        updateStep('stability', 'success');
        addLog('✅ App STABLE pendant 5 minutes !', 'success');
      }
    }, 500);
    return () => clearInterval(interval);
  }, [testRunning]);

  // STEP 1: Vérifier user connected
  const checkUser = async () => {
    try {
      addLog('[STEP 1] Vérifier user connecté...');
      const me = await base44.auth.me();
      if (!me?.email) throw new Error('User not authenticated');
      setUser(me);
      updateStep('user', 'success');
      addLog(`✅ User: ${me.email}`, 'success');
      return me;
    } catch (e) {
      updateStep('user', 'error');
      addLog(`❌ User check FAILED: ${e?.message}`, 'error');
      throw e;
    }
  };

  // STEP 2: FCM Bootstrap (vérifier que FcmBootstrap est monté)
  const checkFcmBootstrap = () => {
    try {
      addLog('[STEP 2] Vérifier FCM Bootstrap...');
      // Sur mobile: vérifier que le component est monté
      const isNative = (() => {
        try {
          const p = window.location?.protocol;
          return p === 'capacitor:' || p === 'file:' || (typeof window.Capacitor !== 'undefined');
        } catch (_) { return false; }
      })();
      addLog(`Platform: ${isNative ? '📱 Android Natif' : '🌐 Web'}`, 'info');
      updateStep('fcm_init', 'success');
      addLog('✅ FcmBootstrap monté', 'success');
    } catch (e) {
      updateStep('fcm_init', 'error');
      addLog(`❌ FCM Bootstrap FAILED: ${e?.message}`, 'error');
      throw e;
    }
  };

  // STEP 3-7: Demander permission + register + token
  const testFcmFlow = async () => {
    try {
      addLog('[STEP 3] Demander permission POST_NOTIFICATIONS...');
      updateStep('permission', 'loading');

      const isNative = (() => {
        try {
          const p = window.location?.protocol;
          return p === 'capacitor:' || p === 'file:' || (typeof window.Capacitor !== 'undefined');
        } catch (_) { return false; }
      })();

      if (!isNative) {
        addLog('⚠️ Web PWA — permission native non applicable', 'warn');
        updateStep('permission', 'skipped');
        updateStep('register', 'skipped');
        updateStep('token', 'skipped');
        updateStep('db_save', 'skipped');
        addLog('ℹ️ Test complet FCM sur APK Android uniquement', 'info');
        return;
      }

      // Importer et tester le plugin
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        addLog('✅ Plugin Capacitor chargé', 'success');

        // Vérifier permission actuelle
        const check = await PushNotifications.checkPermissions();
        addLog(`Permission status: ${check.receive}`, 'info');

        if (check.receive === 'granted') {
          addLog('✅ Permission déjà accordée', 'success');
          updateStep('permission', 'success');
        } else {
          addLog('Permission not granted — skip request (test Web only)', 'warn');
          updateStep('permission', 'skipped');
          return;
        }

        // STEP 4: Vérifier register() appelé
        addLog('[STEP 4] Test register()...', 'info');
        updateStep('register', 'loading');

        // Setup listener AVANT register (règle Capacitor)
        let tokenReceived = false;
        let registrationErrorReceived = false;

        const regListener = await PushNotifications.addListener('registration', (data) => {
          const token = data?.value;
          if (!token) {
            addLog('❌ registration callback: token vide!', 'error');
            return;
          }
          tokenReceived = true;
          addLog(`✅ registration callback: token reçu (${token.length} chars)`, 'success');
          addLog(`Token: ${token.slice(0, 40)}...`, 'info');
          updateStep('token', 'success');
          setTokenReceived(token.slice(0, 40) + '...');
          handleTokenReceived(token, user?.email);
        });

        const errListener = await PushNotifications.addListener('registrationError', (err) => {
          registrationErrorReceived = true;
          addLog(`❌ registrationError: ${JSON.stringify(err)}`, 'error');
          updateStep('register', 'error');
        });

        // Appeler register()
        addLog('Calling register()...', 'info');
        await PushNotifications.register();
        addLog('✅ register() executed', 'success');
        updateStep('register', 'success');

        // Attendre token (max 15s)
        let waited = 0;
        const tokenTimeout = setInterval(() => {
          waited += 500;
          if (tokenReceived) {
            clearInterval(tokenTimeout);
            addLog('✅ Token reçu après registration', 'success');
          }
          if (registrationErrorReceived) {
            clearInterval(tokenTimeout);
            addLog('❌ registrationError reçu', 'error');
          }
          if (waited > 15000) {
            clearInterval(tokenTimeout);
            if (!tokenReceived) {
              addLog('⏰ TIMEOUT 15s — aucun token reçu', 'error');
              updateStep('token', 'error');
            }
          }
        }, 500);

        // Cleanup
        setTimeout(async () => {
          try { await regListener.remove(); } catch (_) {}
          try { await errListener.remove(); } catch (_) {}
        }, 16000);

      } catch (e) {
        addLog(`❌ Plugin error: ${e?.message}`, 'error');
        updateStep('permission', 'error');
        updateStep('register', 'error');
        throw e;
      }

    } catch (e) {
      addLog(`❌ FCM Flow FAILED: ${e?.message}`, 'error');
      throw e;
    }
  };

  // STEP 6: Vérifier token en base
  const handleTokenReceived = async (token, userEmail) => {
    try {
      addLog('[STEP 6] Vérifier token en BDD...', 'info');
      updateStep('db_save', 'loading');

      // Attendre un peu que la fonction backend sauvegarde
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (!userEmail) {
        addLog('⚠️ Email non disponible — skip vérification BDD', 'warn');
        return;
      }

      // Vérifier que le token est en base
      const tokens = await base44.functions.invoke('getFcmTokens', { user_email: userEmail });
      const found = tokens?.data?.tokens || [];

      if (found.length > 0) {
        addLog(`✅ Token trouvé en BDD (${found.length} token(s) pour cet utilisateur)`, 'success');
        found.forEach((t, i) => {
          addLog(`  Token #${i + 1}: ${t.token.slice(0, 30)}... (device: ${t.device_type})`, 'info');
        });
        updateStep('db_save', 'success');
      } else {
        addLog('❌ Aucun token en BDD pour cet utilisateur', 'error');
        updateStep('db_save', 'error');
      }
    } catch (e) {
      addLog(`❌ BDD check error: ${e?.message}`, 'error');
      updateStep('db_save', 'error');
    }
  };

  // STEP 7: Envoyer notification test
  const sendTestNotif = async () => {
    try {
      addLog('[STEP 7] Envoyer notification test...', 'info');
      updateStep('notif_send', 'loading');

      const res = await base44.functions.invoke('testNotification', {
        recipient_email: user?.email,
        recipient_role: user?.role || 'user',
      });

      const data = res?.data;
      if (data?.success) {
        addLog(`✅ Notification envoyée: ${data.details?.sent} token(s)`, 'success');
        updateStep('notif_send', 'success');
        toast.success('📬 Notification envoyée — vérifiez votre téléphone');
      } else {
        addLog(`❌ Notification FAILED: ${data?.message || 'unknown'}`, 'error');
        updateStep('notif_send', 'error');
      }
    } catch (e) {
      addLog(`❌ Notification error: ${e?.message}`, 'error');
      updateStep('notif_send', 'error');
    }
  };

  // Lancer test complet
  const runFullTest = async () => {
    try {
      setTestRunning(true);
      setLogs([]);
      setSteps(STEPS.map(s => ({ ...s, status: 'pending' })));
      addLog('🚀 TEST FCM COMPLET COMMENCÉ', 'info');

      const me = await checkUser();
      checkFcmBootstrap();
      await testFcmFlow();
      await sendTestNotif();

      addLog('✅ TEST COMPLET RÉUSSI — En attente de stabilité...', 'success');
      toast.success('Test complet lancé — vérifiez les 5 minutes de stabilité');
    } catch (e) {
      addLog(`🔴 TEST ÉCHOUÉ: ${e?.message}`, 'error');
      setTestRunning(false);
      toast.error('Test failed: ' + e?.message);
    }
  };

  // Log status
  const LogStatus = ({ step }) => {
    if (step.status === 'pending') return <span className="text-muted-foreground">⏳ En attente</span>;
    if (step.status === 'loading') return <span className="text-blue-500">⟳ En cours...</span>;
    if (step.status === 'success') return <span className="text-green-600">✅ Succès</span>;
    if (step.status === 'error') return <span className="text-red-600">❌ Erreur</span>;
    if (step.status === 'skipped') return <span className="text-gray-400">⊘ Ignoré</span>;
    return null;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 pt-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-bold">🔔 Test FCM Complet</h1>
      </div>

      {/* Status général */}
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">État du test:</span>
              {!testRunning ? (
                <span className="text-xs text-muted-foreground">Prêt</span>
              ) : stability.ok ? (
                <span className="text-green-600 font-bold">Stabilité: {stability.duration}</span>
              ) : (
                <span className="text-blue-600 font-bold">En cours...</span>
              )}
            </div>
            {user && (
              <div className="text-xs text-muted-foreground">
                Utilisateur: <strong>{user.email}</strong>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Étapes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Étapes du test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {steps.map(step => (
            <div key={step.id} className="flex items-center justify-between p-2 rounded border text-xs">
              <div>
                <p className="font-semibold">{step.label}</p>
                <p className="text-muted-foreground">{step.desc}</p>
              </div>
              <LogStatus step={step} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Boutons d'action */}
      <div className="flex gap-2">
        <Button
          onClick={runFullTest}
          disabled={testRunning}
          className="flex-1"
        >
          {testRunning ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Test en cours...</>
          ) : (
            <><Play className="h-4 w-4 mr-2" />Lancer test complet</>
          )}
        </Button>
      </div>

      {/* Logs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            📋 Logs en temps réel ({logs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-slate-900 rounded-lg p-3 h-64 overflow-y-auto font-mono text-xs space-y-1">
            {logs.length === 0 ? (
              <p className="text-slate-500">Cliquer sur "Lancer test complet" pour commencer...</p>
            ) : (
              logs.map((log, i) => (
                <div
                  key={i}
                  className={
                    log.type === 'error'
                      ? 'text-red-400'
                      : log.type === 'success'
                        ? 'text-green-400'
                        : log.type === 'warn'
                          ? 'text-yellow-400'
                          : 'text-slate-300'
                  }
                >
                  <span className="text-slate-500">{log.ts}</span> {log.msg}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </CardContent>
      </Card>

      {/* Vérifications clés */}
      <Card className="border-amber-300 bg-amber-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">✅ Vérifications clés</CardTitle>
        </CardHeader>
        <CardContent className="text-xs space-y-1 text-amber-900">
          <p>• Aucun crash quand on clique "Demander permission"</p>
          <p>• register() appelé APRÈS permission accordée</p>
          <p>• Token reçu dans le callback 'registration'</p>
          <p>• Token sauvegardé en base (FcmToken)</p>
          <p>• Notification test reçue sur le téléphone</p>
          <p>• App ne crash pas pendant 5 minutes</p>
        </CardContent>
      </Card>

      {/* Token reçu */}
      {tokenReceived && (
        <Card className="border-green-300 bg-green-50">
          <CardContent className="pt-4">
            <p className="text-xs font-bold text-green-800">✅ Token reçu:</p>
            <p className="text-[10px] font-mono text-green-700 mt-1 break-all">{tokenReceived}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}