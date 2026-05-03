/**
 * FcmDiagnostic — Diagnostic notifications push
 * Natif Capacitor (APK) ou Web (PWA)
 */
import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { saveFcmToken as saveFcmTokenDirect, getFcmTokens as getFcmTokensDirect } from '@/lib/fcmApi';
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
  const [lastReceivedNotif, setLastReceivedNotif] = useState(null);

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

        // Attacher listeners permanents pour capturer notifs en temps réel
        try {
          const errHandle = await PushNotifications.addListener('registrationError', (err) => {
            const msg = JSON.stringify(err);
            console.error('[FcmDiag] registrationError natif:', msg);
            setRegistrationError(msg);
            addLog('registrationError: ' + msg, 'error');
          });
          cleanupListenersRef.current.push(errHandle);

          // Listener foreground — capture les notifs reçues pendant que l'app est ouverte
          const fgHandle = await PushNotifications.addListener('pushNotificationReceived', (notif) => {
            const info = { title: notif?.title, body: notif?.body, data: notif?.data, ts: new Date().toLocaleTimeString('fr-FR') };
            setLastReceivedNotif(info);
            addLog(`📬 FOREGROUND reçu: "${notif?.title}" | body: "${notif?.body}"`, 'info');
          });
          cleanupListenersRef.current.push(fgHandle);

          addLog('✅ Listeners registrationError + pushNotificationReceived actifs');
        } catch (le) {
          addLog('Impossible attacher listener: ' + le?.message, 'warn');
        }

      } catch (e) {
        addLog('checkPermissions error: ' + e?.message, 'error');
        setChain(c => ({ ...c, permission: 'error' }));
      }
    } else {
      // Web PWA : vérifier l'API Notification du navigateur
      if ('Notification' in window) {
        const p = Notification.permission;
        addLog(`Permission Web: ${p}`);
        setChain(c => ({ ...c, permission: p === 'granted' ? 'ok' : p === 'default' ? 'warn' : 'error' }));
      } else {
        // Sur APK Capacitor, window.Notification n'existe pas — c'est NORMAL
        // Les permissions push sont gérées par le plugin Capacitor PushNotifications
        addLog('Mode Capacitor détecté (window.Notification absent = normal sur APK)', 'warn');
        addLog('→ Utilisez le bouton "Enregistrer" pour activer les notifications Capacitor');
        setChain(c => ({ ...c, permission: 'warn' }));
      }
    }

    // Tokens BDD
    try {
      const tokens = await getFcmTokensDirect(me.email);
      setFcmTokens(tokens);
      const has = tokens.length > 0;
      setChain(c => ({ ...c, token: has ? 'ok' : 'error', db: has ? 'ok' : 'error', register: has ? 'ok' : 'pending' }));
      addLog(`Tokens en BDD: ${tokens.length}`);
    } catch (e) {
      setChain(c => ({ ...c, token: 'error', db: 'error' }));
      addLog('Erreur lecture tokens: ' + e?.message, 'error');
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

  // ── Enregistrement natif — DIRECT via plugin Capacitor (sans nativePush.js) ──
  const registerNative = async () => {
    addLog('▶ registerNative() START — mode direct Capacitor');
    setRegistering(true);
    setRegistrationError(null);
    setChain(c => ({ ...c, permission: 'loading', register: 'loading' }));

    // Timeout de sécurité 20s — évite de rester bloqué indéfiniment
    const safetyTimer = setTimeout(() => {
      addLog('⏰ TIMEOUT 20s — aucun token reçu de Firebase', 'error');
      addLog('→ Cause probable: SHA-1 keystore manquant dans Firebase Console', 'error');
      addLog('→ Logcat: adb logcat -s FirebaseMessaging:* AndroidRuntime:E', 'error');
      setChain(c => ({ ...c, register: 'error', token: 'error', db: 'error' }));
      setRegistering(false);
      toast.error('Timeout 20s — Firebase ne répond pas. Voir Logcat.', { duration: 10000 });
    }, 20000);

    const done = (success) => {
      clearTimeout(safetyTimer);
      if (!success) setRegistering(false);
    };

    try {
      // ── 1. Charger le plugin ──────────────────────────────────────────────
      let PushNotifications;
      try {
        const mod = await import('@capacitor/push-notifications');
        PushNotifications = mod.PushNotifications;
        addLog('✅ Plugin PushNotifications chargé');
      } catch (e) {
        addLog('❌ Plugin Capacitor PushNotifications NON CHARGÉ dans l\'APK: ' + e?.message, 'error');
        addLog('→ Vérifiez que @capacitor/push-notifications est installé et que npx cap sync a été exécuté', 'error');
        setChain(c => ({ ...c, permission: 'error', register: 'error' }));
        done(false);
        return;
      }

      // ── 2. Créer canaux Android (importance 5 = URGENT = heads-up visible) ──
      try {
        await Promise.all([
          PushNotifications.createChannel({
            id: 'default',
            name: 'CDL Notifications',
            importance: 5,
            sound: 'default',
            vibration: true,
            lights: true,
            lightColor: '#1E6BFF',
          }),
          PushNotifications.createChannel({
            id: 'CDL_ALERTS_HIGH',
            name: 'CDL Alertes Critiques',
            importance: 5,
            sound: 'default',
            vibration: true,
            lights: true,
            lightColor: '#FF6B1E',
          }),
        ]);
        addLog('✅ Canaux Android créés (default + CDL_ALERTS_HIGH, importance=5)');
      } catch (e) { addLog('Canal: ' + e?.message, 'warn'); }

      // ── 3. Vérifier/demander permission ──────────────────────────────────
      let perm;
      try {
        const check = await PushNotifications.checkPermissions();
        perm = check.receive;
        addLog(`requestPermissions résultat: ${perm} (état actuel)`);
      } catch (e) {
        perm = 'prompt';
        addLog(`checkPermissions erreur (non bloquant): ${e?.message}`, 'warn');
      }

      if (perm !== 'granted') {
        try {
          addLog('Demande de permission en cours...');
          const req = await PushNotifications.requestPermissions();
          perm = req.receive;
          addLog(`requestPermissions résultat: ${perm}`);
        } catch (e) {
          addLog('requestPermissions CRASH: ' + e?.message, 'error');
          setChain(c => ({ ...c, permission: 'error', register: 'error' }));
          done(false);
          toast.error('Crash requestPermissions: ' + e?.message);
          return;
        }
      }

      if (perm !== 'granted') {
        addLog('Permission refusée par l\'utilisateur', 'error');
        setChain(c => ({ ...c, permission: 'error', register: 'error' }));
        done(false);
        toast.error('Permission refusée → Paramètres → Apps → CDL → Notifications');
        return;
      }

      setChain(c => ({ ...c, permission: 'ok' }));
      addLog('✅ Permission Android accordée');

      // ── 4. Attacher listeners AVANT register() ────────────────────────────
      const listeners = [];

      const regHandle = await PushNotifications.addListener('registration', async (tokenData) => {
        const token = tokenData?.value;
        addLog(token
          ? `✅ registration token reçu: ${token.slice(0, 30)}... (longueur: ${token.length})`
          : '❌ registration appelé mais token vide', token ? 'info' : 'error');

        if (!token) {
          setChain(c => ({ ...c, register: 'error', token: 'error', db: 'error' }));
          done(false);
          return;
        }

        setChain(c => ({ ...c, register: 'ok', token: 'loading', db: 'loading' }));

        // Supprimer les listeners temporaires
        for (const l of listeners) { try { await l.remove(); } catch (_) {} }

        // ── 5. Résoudre l'email MAINTENANT (closure async — user peut être null) ─
        let currentEmail = user?.email;
        if (!currentEmail) {
          // Fallback : re-fetch depuis le SDK au moment du callback
          try {
            const me = await base44.auth.me();
            currentEmail = me?.email;
          } catch (_) {}
        }
        if (!currentEmail) {
          addLog('❌ user.email vide — impossible de sauvegarder !', 'error');
          done(false);
          toast.error('Utilisateur non identifié — reconnectez-vous');
          return;
        }
        addLog(`📧 Email résolu: ${currentEmail}`);

        addLog(`📤 Sauvegarde token pour: ${currentEmail}`);
        const saveData = await saveFcmTokenDirect({ user_email: currentEmail, token, device_type: 'android_native' });
        if (saveData?.success) {
          addLog(`✅ Token FCM sauvegardé avec succès → action: ${saveData.action} | id: ${saveData.token_id}`);
          setChain(c => ({ ...c, token: 'ok', db: 'ok' }));
          toast.success('✅ Token FCM enregistré !');
          // Recharger la liste
          const tokens = await getFcmTokensDirect(currentEmail);
          setFcmTokens(tokens);
          addLog(`Tokens en BDD: ${tokens.length}`);
        } else {
          addLog('❌ Erreur sauvegarde: ' + (saveData?.error || 'inconnue'), 'error');
          setChain(c => ({ ...c, token: 'error', db: 'error' }));
          toast.error('Erreur sauvegarde: ' + (saveData?.error || 'inconnue'));
        }

          done(true);
          setRegistering(false);
        });
      listeners.push(regHandle);

      const errHandle = await PushNotifications.addListener('registrationError', async (err) => {
        const msg = typeof err === 'string' ? err : JSON.stringify(err);
        addLog('❌ registrationError: ' + msg, 'error');
        setRegistrationError(msg);
        setChain(c => ({ ...c, register: 'error', token: 'error', db: 'error' }));
        for (const l of listeners) { try { await l.remove(); } catch (_) {} }
        done(false);
        toast.error('Firebase registrationError — voir logs', { duration: 10000 });
      });
      listeners.push(errHandle);

      // ── 6. Appeler register() ─────────────────────────────────────────────
      addLog('register() appelé — attente token Firebase (max 20s)...');
      setChain(c => ({ ...c, register: 'loading' }));
      await PushNotifications.register();
      addLog('register() retourné — en attente du listener "registration"...');

    } catch (err) {
      addLog('ERREUR GLOBALE: ' + err?.message, 'error');
      toast.error('Erreur FCM : ' + (err?.message || 'Inconnue'));
      setChain(c => ({ ...c, register: 'error', token: 'error', db: 'error' }));
      done(false);
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
        const me = await base44.auth.me();
        await saveFcmTokenDirect({ user_email: me?.email || user?.email, token, device_type: 'web' });
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
    addLog(`Envoi test vers ${user.email}...`);
    try {
      const res = await base44.functions.invoke('sendCdlNotification', {
        user_email: user.email,
        title: '🔔 Test CDL Push',
        body: `Test notification — ${new Date().toLocaleTimeString('fr-FR')}`,
        data: {
          type: 'new_course',
          notif_route: '/mes-notifications',
          entity_id: 'diag_test',
          entity_type: 'Course',
        },
      });
      const d = res.data;
      const sent = d?.sent ?? 0;
      const total = d?.total ?? 0;
      if (sent > 0) {
        setSendResult({ ok: true, msg: `✅ Envoyée ! ${sent}/${total} token(s) — vérifiez votre téléphone` });
        addLog(`✅ FCM sent=${sent} total=${total} bdd=${d?.bdd}`, 'info');
        toast.success('Notification envoyée — vérifiez votre téléphone');
      } else if (d?.bdd > 0) {
        setSendResult({ ok: true, msg: `⚠️ Notif BDD créée mais FCM=0 token (token manquant ?)` });
        addLog('⚠️ Pas de token FCM — notif BDD seulement', 'warn');
      } else {
        setSendResult({ ok: false, msg: d?.note || d?.error || 'Échec envoi' });
        addLog('❌ Échec: ' + (d?.note || d?.error || 'inconnu'), 'error');
      }
    } catch (err) {
      setSendResult({ ok: false, msg: err.message });
      addLog('❌ Erreur: ' + err.message, 'error');
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
      const res = await base44.functions.invoke('fcmDiagnostic', {
        test_send: withSend,
      });
      const data = res.data;
      setServerDiag(data);
      addLog('Diagnostic serveur: ' + data?.summary);
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

      {/* Version indicator */}
      <div className="bg-emerald-600 text-white text-center py-2 px-3 rounded-xl font-bold text-sm tracking-wide">
        ✅ FCM FIX V7 — 03/05 — Canaux importance=5 + Foreground handler
      </div>

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
            label={isNative ? "2. Permission Android (Capacitor)" : "2. Permission Web"}
            status={chain.permission}
            detail={
              chain.permission === 'ok' ? 'Permission accordée ✅' :
              chain.permission === 'warn' ? (isNative ? 'Non encore demandée — cliquer "Enregistrer"' : 'Non encore demandée') :
              chain.permission === 'error' ? (isNative ? 'Refusée → Paramètres → Apps → CDL → Notifications' : 'Refusée') :
              chain.permission === 'loading' ? 'Demande en cours...' : 'En attente — cliquer "Enregistrer"'
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

      {/* Bouton enregistrer — Android natif uniquement */}
      {isNative && chain.db !== 'ok' && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold text-amber-900">
              📱 Enregistrer ce téléphone Android
            </p>
            <Button onClick={registerNative} disabled={registering} className="w-full">
              {registering
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enregistrement...</>
                : '🔑 Demander permission + Enregistrer FCM'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Message info pour Web */}
      {!isNative && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-blue-900">
              🌐 Mode web détecté — notifications FCM non disponibles ici
            </p>
            <p className="text-xs text-blue-700 mt-2">
              Les notifications push nécessitent l'application mobile native Android. Téléchargez l'APK pour activer les notifications.
            </p>
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

      {/* Dernière notification reçue */}
      {lastReceivedNotif && (
        <Card className="border-green-400 bg-green-50">
          <CardContent className="p-3 space-y-1">
            <p className="text-xs font-bold text-green-800">📬 Dernière notification reçue (FOREGROUND)</p>
            <p className="text-xs text-green-700"><strong>Titre :</strong> {lastReceivedNotif.title || '—'}</p>
            <p className="text-xs text-green-700"><strong>Corps :</strong> {lastReceivedNotif.body || '—'}</p>
            <p className="text-xs text-green-600"><strong>Heure :</strong> {lastReceivedNotif.ts}</p>
            {lastReceivedNotif.data && (
              <p className="text-[10px] text-green-600 font-mono break-all">data: {JSON.stringify(lastReceivedNotif.data)}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Guide affichage Android */}
      {isNative && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-3 space-y-1.5 text-xs text-blue-900">
            <p className="font-bold">📋 Vérification affichage Android</p>
            <p>• <strong>App ouverte</strong> → notification dans le toast (sonner)</p>
            <p>• <strong>App fond/fermée</strong> → barre de notification Android (canal importance=5)</p>
            <p>• Vérifier : <strong>Paramètres → Apps → CDL → Notifications → CDL Alertes Critiques</strong> = activé</p>
            <p>• Si canal bloqué → désinstaller/réinstaller l'APK (les canaux sont cachés après création)</p>
          </CardContent>
        </Card>
      )}

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