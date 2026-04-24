/**
 * FcmDiagnostic — Diagnostic notifications push
 * Natif Capacitor (APK) ou Web (PWA)
 */
import { useState, useEffect, useRef } from 'react';
import { base44, syncBase44Token } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, RefreshCw, Copy, CheckCircle2, XCircle, AlertCircle, Loader2, Smartphone, Globe, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

function isNativePlatform() {
  if (typeof window === 'undefined') return false;
  if (window.location?.protocol === 'capacitor:') return true;
  if (window.Capacitor?.isNativePlatform?.() === true) return true;
  return false;
}

function StatusRow({ label, status, detail }) {
  const icon =
    status === 'ok'      ? <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" /> :
    status === 'error'   ? <XCircle      className="h-4 w-4 text-red-500 flex-shrink-0" /> :
    status === 'loading' ? <Loader2      className="h-4 w-4 text-blue-500 flex-shrink-0 animate-spin" /> :
    status === 'warn'    ? <AlertCircle  className="h-4 w-4 text-amber-500 flex-shrink-0" /> :
                           <AlertCircle  className="h-4 w-4 text-slate-400 flex-shrink-0" />;
  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-0">
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {detail && <p className="text-xs text-muted-foreground mt-0.5 break-all">{detail}</p>}
      </div>
    </div>
  );
}

export default function FcmDiagnostic() {
  const navigate = useNavigate();
  const [user, setUser]           = useState(null);
  const [fcmTokens, setFcmTokens] = useState([]);
  const [isNative]                = useState(() => isNativePlatform());
  const [registering, setRegistering] = useState(false);
  const [sending, setSending]     = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [nativeInfo, setNativeInfo] = useState(null);
  const [registrationError, setRegistrationError] = useState(null);
  const [logs, setLogs]           = useState([]);
  const [serverDiag, setServerDiag] = useState(null);
  const [serverDiagLoading, setServerDiagLoading] = useState(false);
  const cleanupListenersRef       = useRef([]);

  const addLog = (msg, type = 'info') => {
    const ts = new Date().toLocaleTimeString('fr-FR');
    setLogs(prev => [...prev.slice(-30), { ts, msg, type }]);
    console.log(`[FcmDiag][${type}] ${msg}`);
  };

  const [chain, setChain] = useState({
    user: 'loading', permission: 'pending', register: 'pending', token: 'pending', db: 'pending',
  });

  // ── Infos Capacitor natives ─────────────────────────────────────────────────
  const loadNativeInfo = async () => {
    if (!isNativePlatform()) return;
    try {
      const info = {
        platform: window.Capacitor?.getPlatform?.() || 'unknown',
        isNative: window.Capacitor?.isNativePlatform?.() || false,
        protocol: window.location.protocol,
        appVersion: null,
        deviceInfo: null,
      };

      try {
        const { App } = await import('@capacitor/app');
        const appInfo = await App.getInfo();
        info.appVersion = `${appInfo.name} v${appInfo.version} (${appInfo.build})`;
        info.appId = appInfo.id;
      } catch (_) {}

      try {
        // @capacitor/device peut ne pas être installé — utiliser l'API web navigator comme fallback
        const ua = navigator.userAgent || '';
        const androidMatch = ua.match(/Android ([0-9.]+)/);
        info.deviceInfo = androidMatch ? `Android ${androidMatch[1]}` : ua.slice(0, 60);
      } catch (_) {}

      setNativeInfo(info);
      addLog(`Platform: ${info.platform} | App: ${info.appVersion || '?'} | Device: ${info.deviceInfo || '?'}`);
      if (info.appId) addLog(`App ID (package): ${info.appId}`);
    } catch (e) {
      addLog('Erreur lecture infos natives: ' + e?.message, 'error');
    }
  };

  // ── Chargement initial ──────────────────────────────────────────────────────
  const load = async () => {
    setChain({ user: 'loading', permission: 'pending', register: 'pending', token: 'pending', db: 'pending' });
    setFcmTokens([]);
    setSendResult(null);
    setRegistrationError(null);
    setLogs([]);

    addLog('Démarrage diagnostic...');

    // Nettoyer les anciens listeners de diagnostic
    for (const h of cleanupListenersRef.current) {
      try { await h.remove(); } catch (_) {}
    }
    cleanupListenersRef.current = [];

    // User
    let me;
    try {
      me = await base44.auth.me();
      setUser(me);
      setChain(c => ({ ...c, user: 'ok' }));
      addLog(`User: ${me.email}`);
    } catch (e) {
      setChain(c => ({ ...c, user: 'error' }));
      addLog('Erreur auth: ' + e?.message, 'error');
      return;
    }

    // Permission
    if (isNativePlatform()) {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const perm = await PushNotifications.checkPermissions();
        addLog(`Permission Capacitor: ${perm.receive}`);
        setChain(c => ({ ...c, permission: perm.receive === 'granted' ? 'ok' : perm.receive === 'denied' ? 'error' : 'warn' }));

        // Attacher un listener registrationError permanent pour capturer les erreurs Firebase
        try {
          const errHandle = await PushNotifications.addListener('registrationError', (err) => {
            const msg = JSON.stringify(err);
            console.error('[FcmDiag] registrationError natif:', msg);
            setRegistrationError(msg);
            addLog('registrationError: ' + msg, 'error');
          });
          cleanupListenersRef.current.push(errHandle);
          addLog('Listener registrationError actif');
        } catch (le) {
          addLog('Impossible attacher listener: ' + le?.message, 'warn');
        }

      } catch (e) {
        addLog('checkPermissions error: ' + e?.message, 'error');
        setChain(c => ({ ...c, permission: 'error' }));
      }
    } else {
      // Web : l'API Notification n'existe pas sur APK (normal)
      if ('Notification' in window) {
        const p = Notification.permission;
        addLog(`Permission Web: ${p}`);
        setChain(c => ({ ...c, permission: p === 'granted' ? 'ok' : p === 'default' ? 'warn' : 'error' }));
      } else {
        addLog('API Notification non disponible — mode web uniquement', 'warn');
        setChain(c => ({ ...c, permission: 'warn' }));
      }
    }

    // Tokens BDD — via backend pour éviter 403 sur APK natif
    try {
      syncBase44Token();
      syncBase44Token(); // double sync pour s'assurer que le SDK est à jour
      const authTok = localStorage.getItem('base44_access_token') || '';
      addLog(`auth_token présent: ${!!authTok} | ${authTok ? authTok.slice(0, 12) + '...' : 'VIDE'}`);
      const res = await base44.functions.invoke('getFcmTokens', { user_email: me.email, auth_token: authTok });
      const tokens = res?.data?.tokens || [];
      setFcmTokens(tokens);
      const has = tokens.length > 0;
      setChain(c => ({ ...c, token: has ? 'ok' : 'error', db: has ? 'ok' : 'error', register: has ? 'ok' : 'pending' }));
      addLog(`Tokens en BDD: ${tokens.length}`);
    } catch (e) {
      setChain(c => ({ ...c, token: 'error', db: 'error' }));
      addLog('Erreur lecture tokens: ' + e?.message + ' | status: ' + (e?.status || e?.response?.status || '?'), 'error');
    }

    // Infos natives
    await loadNativeInfo();
  };

  useEffect(() => {
    load();
    return () => {
      cleanupListenersRef.current.forEach(h => { try { h.remove(); } catch (_) {} });
    };
  }, []);

  // ── Enregistrement natif ────────────────────────────────────────────────────
  const registerNative = async () => {
    addLog('▶ registerNative() START');
    setRegistering(true);
    setRegistrationError(null);
    setChain(c => ({ ...c, permission: 'loading', register: 'loading' }));

    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');

      // Canal Android
      try {
        await PushNotifications.createChannel({
          id: 'default', name: 'CDL Notifications', description: 'Toutes les notifications CDL',
          importance: 5, sound: 'default', vibration: true, lights: true, lightColor: '#1a73e8',
        });
        addLog('Canal Android "default" créé');
      } catch (ce) {
        addLog('createChannel (ignoré, peut déjà exister): ' + ce?.message, 'warn');
      }

      // Permission
      let perm;
      try {
        const check = await PushNotifications.checkPermissions();
        perm = check.receive;
        addLog(`Permission actuelle: ${perm}`);
      } catch (e) {
        addLog('checkPermissions error: ' + e?.message, 'warn');
        perm = 'prompt';
      }

      if (perm !== 'granted') {
        try {
          const req = await PushNotifications.requestPermissions();
          perm = req.receive;
          addLog(`Permission après demande: ${perm}`);
        } catch (e) {
          addLog('requestPermissions CRASH: ' + e?.message, 'error');
          setChain(c => ({ ...c, permission: 'error', register: 'error' }));
          toast.error('Crash requestPermissions: ' + e?.message);
          setRegistering(false);
          return;
        }
      }

      if (perm !== 'granted') {
        addLog('Permission refusée', 'error');
        setChain(c => ({ ...c, permission: 'error', register: 'error' }));
        toast.error('Permission Android refusée. Allez dans Paramètres → Apps → CDL → Notifications');
        setRegistering(false);
        return;
      }

      setChain(c => ({ ...c, permission: 'ok' }));
      addLog('Permission OK ✅');

      // Attendre token via Promise + timeout
      const token = await new Promise((resolve) => {
        let done = false;
        let regHandle, errHandle;

        const finish = async (val) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          try { if (regHandle) await regHandle.remove(); } catch (_) {}
          try { if (errHandle) await errHandle.remove(); } catch (_) {}
          resolve(val ?? null);
        };

        const timer = setTimeout(() => {
          addLog('⏱ Timeout 30s — token non reçu (Firebase non initialisé ?)', 'error');
          finish(null);
        }, 30000);

        (async () => {
          try {
            regHandle = await PushNotifications.addListener('registration', (t) => {
              addLog('✅ Token reçu via listener registration');
              finish(t?.value || null);
            });

            errHandle = await PushNotifications.addListener('registrationError', (err) => {
              const msg = JSON.stringify(err);
              addLog('❌ registrationError: ' + msg, 'error');
              setRegistrationError(msg);
              finish(null);
            });

            addLog('Appel register()...');
            try {
              await PushNotifications.register();
              addLog('register() retourné OK (token arrive via listener)');
            } catch (re) {
              addLog('register() EXCEPTION: ' + re?.message, 'error');
              finish(null);
            }
          } catch (outer) {
            addLog('Erreur setup listeners: ' + outer?.message, 'error');
            finish(null);
          }
        })();
      });

      if (!token) {
        setChain(c => ({ ...c, register: 'error', token: 'error', db: 'error' }));
        toast.error('Token non reçu. Vérifiez les logs ci-dessous et Logcat Android.', { duration: 10000 });
        setRegistering(false);
        return;
      }

      addLog(`Token reçu: ${token.slice(0, 20)}...`);
      setChain(c => ({ ...c, register: 'ok', token: 'loading', db: 'loading' }));

      syncBase44Token();
      syncBase44Token();
      const authTok = localStorage.getItem('base44_access_token') || '';
      await base44.functions.invoke('saveFcmToken', { token, deviceType: 'android_native', auth_token: authTok });
      addLog('Token sauvegardé en BDD ✅');
      setChain(c => ({ ...c, token: 'ok', db: 'ok' }));
      toast.success('✅ Token FCM enregistré !');

      // Re-sync avant la lecture BDD (APK : le SDK peut ne pas avoir le token à jour)
      syncBase44Token();
      const authTokRefresh = localStorage.getItem('base44_access_token') || '';
      const tokensRes = await base44.functions.invoke('getFcmTokens', { auth_token: authTokRefresh });
      setFcmTokens(tokensRes?.data?.tokens || []);

    } catch (err) {
      addLog('ERREUR GLOBALE: ' + err?.message, 'error');
      toast.error('Erreur FCM : ' + (err?.message || 'Inconnue'));
      setChain(c => ({ ...c, register: 'error', token: 'error', db: 'error' }));
    } finally {
      setRegistering(false);
    }
  };

  // ── Enregistrement Web ──────────────────────────────────────────────────────
  const registerWeb = async () => {
    setRegistering(true);
    try {
      if (!('Notification' in window)) {
        toast.error('API Notification non disponible.');
        setRegistering(false);
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        toast.error('Permission refusée');
        setChain(c => ({ ...c, permission: 'error' }));
        setRegistering(false);
        return;
      }
      setChain(c => ({ ...c, permission: 'ok' }));
      const { registerSW } = await import('@/lib/swRegister');
      await registerSW();
      const { requestWebPushToken } = await import('@/lib/webPush');
      const { token } = await requestWebPushToken();
      if (token) {
        syncBase44Token();
        const authTokWeb = localStorage.getItem('base44_access_token') || '';
        await base44.functions.invoke('saveFcmToken', { token, deviceType: 'web', auth_token: authTokWeb });
        setChain(c => ({ ...c, register: 'ok', token: 'ok', db: 'ok' }));
        toast.success('✅ Token Web Push enregistré !');
        await load();
      } else {
        toast.error('Pas de token web push obtenu.');
        setChain(c => ({ ...c, register: 'error' }));
      }
    } catch (err) {
      toast.error('Erreur web push: ' + err?.message);
      setChain(c => ({ ...c, register: 'error' }));
    } finally {
      setRegistering(false);
    }
  };

  // ── Test envoi ──────────────────────────────────────────────────────────────
  const sendTest = async () => {
    if (!user?.email) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await base44.functions.invoke('testNotification', {
        recipient_email: user.email,
        recipient_role: user.role || 'user',
      });
      const d = res.data;
      if (d?.success) {
        setSendResult({ ok: true, msg: `✅ Envoyée ! ${d.details?.sent}/${d.details?.tokens_found} token(s)` });
        toast.success('Notification envoyée — vérifiez votre téléphone');
      } else {
        setSendResult({ ok: false, msg: d?.details || d?.message || 'Échec envoi' });
      }
    } catch (err) {
      setSendResult({ ok: false, msg: err.message });
    } finally {
      setSending(false);
    }
  };

  const copyToken = (token) => {
    navigator.clipboard?.writeText(token);
    toast.success('Token copié');
  };

  const runServerDiag = async (withSend = false) => {
    setServerDiagLoading(true);
    setServerDiag(null);
    try {
      const res = await base44.functions.invoke('fcmDiagnostic', { test_send: withSend });
      setServerDiag(res.data);
      addLog('Diagnostic serveur: ' + res.data?.summary);
    } catch (e) {
      addLog('Erreur diagnostic serveur: ' + e?.message, 'error');
      toast.error('Erreur: ' + e?.message);
    } finally {
      setServerDiagLoading(false);
    }
  };

  // ── Rendu ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-20 max-w-lg mx-auto px-2">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">🔔 Diagnostic FCM</h1>
          <div className="flex items-center gap-2 mt-0.5">
            {isNative
              ? <><Smartphone className="h-3.5 w-3.5 text-green-600" /><span className="text-xs text-green-700 font-semibold">Natif Android (Capacitor)</span></>
              : <><Globe className="h-3.5 w-3.5 text-blue-600" /><span className="text-xs text-blue-700 font-semibold">Web / PWA</span></>
            }
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={load}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Infos natives */}
      {nativeInfo && (
        <Card className="border-green-300 bg-green-50">
          <CardContent className="p-3 space-y-1">
            <p className="text-xs font-bold text-green-800">📱 Infos appareil</p>
            <p className="text-xs text-green-700">Platform: <strong>{nativeInfo.platform}</strong></p>
            {nativeInfo.appVersion && <p className="text-xs text-green-700">App: <strong>{nativeInfo.appVersion}</strong></p>}
            {nativeInfo.appId && <p className="text-xs text-green-700">Package ID: <strong className="font-mono">{nativeInfo.appId}</strong></p>}
            {nativeInfo.deviceInfo && <p className="text-xs text-green-700">Appareil: {nativeInfo.deviceInfo}</p>}
          </CardContent>
        </Card>
      )}

      {/* Erreur registrationError capturée */}
      {registrationError && (
        <Card className="border-red-400 bg-red-50">
          <CardContent className="p-3 space-y-1">
            <p className="text-xs font-bold text-red-800">❌ Erreur Firebase (registrationError)</p>
            <p className="text-xs font-mono text-red-700 break-all">{registrationError}</p>
            <p className="text-xs text-red-600 mt-1 font-semibold">
              Cette erreur vient de Firebase natif. Causes habituelles :<br />
              • google-services.json absent ou mauvais package name<br />
              • APK non rebuild après npx cap sync android<br />
              • Google Play Services non disponible sur l'appareil
            </p>
          </CardContent>
        </Card>
      )}

      {/* Chaîne d'état */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">État FCM</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <StatusRow label="1. Utilisateur connecté" status={chain.user}
            detail={user ? `${user.full_name} (${user.email})` : 'Non connecté'} />
          <StatusRow
            label={isNative ? "2. Permission Android" : "2. Permission Web"}
            status={chain.permission}
            detail={
              chain.permission === 'ok' ? 'Permission accordée ✅' :
              chain.permission === 'warn' ? 'Non encore demandée' :
              chain.permission === 'error' ? 'Refusée → Paramètres → Apps → CDL → Notifications' :
              chain.permission === 'loading' ? 'Vérification...' : 'En attente'
            }
          />
          <StatusRow label="3. register() FCM" status={chain.register}
            detail={
              chain.register === 'ok' ? 'register() exécuté ✅' :
              chain.register === 'error' ? 'Échec — voir erreur ci-dessus + Logcat' :
              chain.register === 'loading' ? 'En cours...' : 'Non appelé'
            }
          />
          <StatusRow label="4. Token en BDD" status={chain.token}
            detail={fcmTokens.length > 0 ? `${fcmTokens.length} token(s)` : 'Aucun token enregistré'} />
          <StatusRow label="5. Prêt à recevoir" status={chain.db}
            detail={chain.db === 'ok' ? 'Tout configuré ✅' : 'Token manquant'} />
        </CardContent>
      </Card>

      {/* Bouton enregistrer */}
      {chain.db !== 'ok' && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold text-amber-900">
              {isNative ? '📱 Enregistrer ce téléphone Android' : '🌐 Enregistrer ce navigateur'}
            </p>
            <Button onClick={isNative ? registerNative : registerWeb} disabled={registering} className="w-full">
              {registering
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enregistrement...</>
                : '🔑 Demander permission + Enregistrer FCM'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tokens BDD */}
      {fcmTokens.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tokens FCM actifs ({fcmTokens.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-4">
            {fcmTokens.map((t) => (
              <div key={t.id} className="bg-muted rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-primary">
                    {t.device_type === 'android_native' ? '📱 Android Natif' : '🌐 Web'}
                  </span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => copyToken(t.token)}>
                    <Copy className="h-3 w-3 mr-1" /> Copier
                  </Button>
                </div>
                <p className="text-xs font-mono text-muted-foreground break-all">{t.token.substring(0, 60)}...</p>
                <p className="text-xs text-muted-foreground">Enregistré: {new Date(t.registered_at).toLocaleString()}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Diagnostic serveur Firebase */}
      <Card className="border-purple-200 bg-purple-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-purple-900">🔧 Diagnostic Firebase côté serveur</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          <p className="text-xs text-purple-700">Vérifie : service account, accès API FCM, tokens en BDD.</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => runServerDiag(false)} disabled={serverDiagLoading} className="flex-1 border-purple-300 text-purple-800 text-xs">
              {serverDiagLoading ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Analyse...</> : '🔍 Analyser config'}
            </Button>
            <Button onClick={() => runServerDiag(true)} disabled={serverDiagLoading || !fcmTokens.length} className="flex-1 bg-purple-600 hover:bg-purple-700 text-xs">
              {serverDiagLoading ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />...</> : '📤 Analyser + Envoyer'}
            </Button>
          </div>
          {serverDiag && (
            <div className="space-y-2">
              <div className={`p-2 rounded text-xs font-bold ${serverDiag.errors?.length ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                {serverDiag.summary}
              </div>
              {Object.entries(serverDiag.checks || {}).map(([key, val]) => (
                <div key={key} className={`p-2 rounded text-xs border ${val.status === 'OK' ? 'border-green-200 bg-green-50' : val.status === 'WARN' ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'}`}>
                  <span className="font-bold">{val.status === 'OK' ? '✅' : val.status === 'WARN' ? '⚠️' : '❌'} {key.replace(/_/g, ' ')}</span>
                  <p className="text-muted-foreground mt-0.5 break-all">{val.detail}</p>
                </div>
              ))}
              {serverDiag.native_checklist && (
                <div className="p-3 rounded bg-amber-50 border border-amber-200 text-xs space-y-1">
                  <p className="font-bold text-amber-900">📋 Actions requises sur votre machine :</p>
                  {serverDiag.native_checklist.map((item, i) => (
                    <p key={i} className="text-amber-800">• {item}</p>
                  ))}
                </div>
              )}
              {serverDiag.errors?.length > 0 && (
                <div className="p-2 rounded bg-red-50 border border-red-200 text-xs">
                  <p className="font-bold text-red-800">Erreurs :</p>
                  {serverDiag.errors.map((e, i) => <p key={i} className="text-red-700">• {e}</p>)}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Test envoi */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Envoyer notification de test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          <Button onClick={sendTest} disabled={sending || fcmTokens.length === 0} className="w-full">
            {sending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Envoi...</> : <><Send className="h-4 w-4 mr-2" />Envoyer test</>}
          </Button>
          {fcmTokens.length === 0 && <p className="text-xs text-muted-foreground text-center">⚠️ Enregistrez d'abord un token FCM.</p>}
          {sendResult && (
            <div className={`p-3 rounded-lg text-sm font-medium ${sendResult.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {sendResult.msg}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Logs temps réel */}
      {logs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Terminal className="h-4 w-4" /> Logs temps réel
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="bg-slate-900 rounded-lg p-3 max-h-48 overflow-y-auto space-y-0.5">
              {logs.map((l, i) => (
                <p key={i} className={`text-[10px] font-mono ${l.type === 'error' ? 'text-red-400' : l.type === 'warn' ? 'text-amber-400' : 'text-green-400'}`}>
                  <span className="text-slate-500">{l.ts}</span> {l.msg}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Checklist natif Firebase */}
      {isNative && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 space-y-2 text-xs text-red-900">
            <p className="font-bold">🔴 Checklist Firebase Android (à faire sur votre machine)</p>
            <ul className="space-y-1.5 ml-2">
              <li>✅ <strong>google-services.json</strong> dans <code>android/app/</code></li>
              <li>✅ Package name dans google-services.json = <code className="font-bold">com.cdl.app</code></li>
              <li>✅ <code>apply plugin: 'com.google.gms.google-services'</code> en bas de <code>android/app/build.gradle</code></li>
              <li>✅ <code>classpath 'com.google.gms:google-services:4.4.0'</code> dans <code>android/build.gradle</code></li>
              <li>✅ <code>npx cap sync android</code> exécuté après modifications</li>
              <li>✅ APK rebuild dans Android Studio après sync</li>
            </ul>
            <p className="font-semibold mt-2">Logcat (collez dans terminal) :</p>
            <div className="bg-red-100 rounded p-2 font-mono text-[10px] space-y-1">
              <p>adb logcat -s FirebaseMessaging:* FirebaseApp:* AndroidRuntime:E</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}