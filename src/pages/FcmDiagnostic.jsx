import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2, RefreshCw, AlertTriangle, Smartphone, Globe, Bell } from "lucide-react";
import { toast } from "sonner";
import NotificationPermissionRequest from "@/components/NotificationPermissionRequest";
import { getFirebaseConfig } from "@/lib/firebaseConfig";

function StatusRow({ label, status, detail }) {
  const icons = {
    loading: <Loader2 className="h-5 w-5 text-muted-foreground animate-spin mt-0.5 flex-shrink-0" />,
    ok:      <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />,
    warn:    <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />,
    error:   <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />,
  };
  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-0">
      {icons[status] || icons.loading}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {detail && <p className="text-xs text-muted-foreground mt-0.5 break-all">{detail}</p>}
      </div>
    </div>
  );
}

export default function FcmDiagnostic() {
  const [steps, setSteps] = useState([]);
  const [running, setRunning] = useState(false);
  const [sending, setSending] = useState(null);
  const [userEmail, setUserEmail] = useState(null);
  const [isNative, setIsNative] = useState(false);
  const [nativeToken, setNativeToken] = useState(null);
  const [webToken, setWebToken] = useState(null);

  const setStep = (id, update) =>
    setSteps(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], ...update }; return next; }
      return [...prev, { id, ...update }];
    });

  useEffect(() => {
    const native = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();
    setIsNative(!!native);
    runDiagnostic();
  }, []);

  const runDiagnostic = async () => {
    setRunning(true);
    setSteps([]);
    setNativeToken(null);
    setWebToken(null);

    // ── Auth ──────────────────────────────────────────────────────────────────
    setStep('user', { label: "Utilisateur connecté", status: "loading" });
    let me;
    try {
      me = await base44.auth.me();
      setUserEmail(me.email);
      setStep('user', { status: "ok", detail: me.email });
    } catch (e) {
      setStep('user', { status: "error", detail: "Non connecté: " + e.message });
      setRunning(false);
      return;
    }

    // ── Test complet du setup Firebase ────────────────────────────────────────
    setStep('firebase_setup', { label: "Setup Firebase complet (backend)", status: "loading" });
    try {
      const res = await base44.functions.invoke('testFirebaseSetup', {});
      if (res.data?.success && res.data.ready) {
        const d = res.data.diagnostics.tests;
        const msgs = [];
        if (d.secrets_vite?.all_present) msgs.push('VITE_* ✅');
        if (d.service_account?.valid) msgs.push('Service Account ✅');
        setStep('firebase_setup', { 
          status: "ok", 
          detail: msgs.join(' | ') || 'Config complète'
        });
      } else {
        const missing = res.data?.diagnostics.tests.token_generation_ready?.missing_secrets || [];
        setStep('firebase_setup', { 
          status: "error", 
          detail: `Manquants: ${missing.join(', ')}`
        });
      }
    } catch (e) {
      setStep('firebase_setup', { status: "error", detail: e.message });
    }

    const native = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.();

    if (native) {
      // ── MODE NATIF APK ───────────────────────────────────────────────────────
      setStep('native_ctx', { label: "Contexte APK Capacitor détecté", status: "ok", detail: "Les notifications passent par FirebaseMessagingService natif" });

      setStep('native_channel', { label: "Canal Android 'default' (importance 5)", status: "loading" });
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        await PushNotifications.createChannel({
          id: 'default',
          name: 'CDL Notifications',
          description: 'Toutes les notifications CDL',
          importance: 5,
          sound: 'default',
          vibration: true,
          lights: true,
          lightColor: '#1a73e8',
        });
        setStep('native_channel', { status: "ok", detail: "Canal 'default' importance=5 créé/vérifié" });
      } catch (e) {
        setStep('native_channel', { status: "warn", detail: "Peut-être déjà créé: " + e.message });
      }

      setStep('native_perm', { label: "Permission notifications Android", status: "loading" });
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const perm = await PushNotifications.checkPermissions();
        if (perm.receive === 'granted') {
          setStep('native_perm', { status: "ok", detail: "Accordée" });
        } else {
          const req = await PushNotifications.requestPermissions();
          setStep('native_perm', { status: req.receive === 'granted' ? "ok" : "error", detail: req.receive });
        }
      } catch (e) {
        setStep('native_perm', { status: "error", detail: e.message });
      }

      setStep('native_token', { label: "Token FCM natif Capacitor", status: "loading" });
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        await PushNotifications.register();
        // Attendre le token via listener
        const tokenPromise = new Promise((resolve) => {
          PushNotifications.addListener('registration', (t) => resolve(t.value));
          setTimeout(() => resolve(null), 8000); // timeout 8s
        });
        const token = await tokenPromise;
        if (token) {
          setNativeToken(token);
          await base44.functions.invoke('saveFcmToken', { token });
          setStep('native_token', { status: "ok", detail: token.substring(0, 40) + "…" });
        } else {
          setStep('native_token', { status: "error", detail: "Timeout — token non reçu après 8s" });
        }
      } catch (e) {
        setStep('native_token', { status: "error", detail: e.message });
      }

    } else {
      // ── MODE WEB / PWA ────────────────────────────────────────────────────────
      setStep('web_ctx', { label: "Contexte Web/PWA (Service Worker)", status: "ok", detail: "Les notifications passent par firebase-messaging-sw.js" });

      setStep('perm', { label: "Permission notifications navigateur", status: "loading" });
      let perm = Notification.permission;
      if (perm === 'default') perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setStep('perm', { status: "ok", detail: "Autorisée" });
      } else {
        setStep('perm', { status: "error", detail: `Refusée (${perm})` });
        setRunning(false);
        return;
      }

      setStep('secrets', { label: "Secrets Firebase (backend)", status: "loading" });
      try {
        const configRes = await base44.functions.invoke('getFirebaseConfig', {});
        if (configRes.data?.complete) {
          const cfg = configRes.data.config;
          setStep('secrets', { 
            status: "ok", 
            detail: `✅ apiKey=${cfg.apiKey.substring(0,8)}... | messagingSenderId=${cfg.messagingSenderId.substring(0,8)}... | appId=${cfg.appId.substring(0,8)}... | vapidKey=${cfg.vapidKey.substring(0,8)}...` 
          });
        } else {
          setStep('secrets', { 
            status: "error", 
            detail: `Manquants: ${(configRes.data?.missing || []).join(', ')}` 
          });
        }
      } catch (err) {
        setStep('secrets', { 
          status: "error", 
          detail: `Erreur: ${err.message}` 
        });
      }

      setStep('sw', { label: "Service Worker firebase-messaging-sw.js", status: "loading" });
      setStep('token', { label: "Token FCM web généré", status: "loading" });
      try {
        // Force unregister old SW first
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          if (reg.scope.includes('firebase-messaging-sw')) {
            console.log('[FcmDiagnostic] Unregistering old SW:', reg.scope);
            await reg.unregister();
          }
        }
        
        // Charger la config Firebase
        const firebaseConfig = await getFirebaseConfig();
        if (!firebaseConfig) {
          throw new Error('Firebase config not available from backend');
        }
        
        // Enregistrer le SW
        const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        await navigator.serviceWorker.ready;
        
        // Envoyer la config au SW
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'FIREBASE_CONFIG',
            config: firebaseConfig,
          });
        }
        
        // Générer le token
        const { getToken } = await import('firebase/messaging');
        const { initializeApp, getApps } = await import('firebase/app');
        const { getMessaging } = await import('firebase/messaging');
        
        const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
        const messaging = getMessaging(app);
        const token = await getToken(messaging, { 
          vapidKey: firebaseConfig.vapidKey, 
          serviceWorkerRegistration: reg 
        });
        
        setStep('sw', { 
          status: "ok", 
          detail: `Scope: ${reg.scope} | État: ${reg.active?.state || 'activé'} | Config envoyée au SW`
        });
        
        console.log('[FcmDiagnostic] ✅ SW config sent, waiting for token generation...');
        
        if (token) {
          setWebToken(token);
          console.log('[FcmDiagnostic] ✅ Token généré:', token.substring(0, 50) + '...');
          await base44.functions.invoke('saveFcmToken', { token });
          setStep('token', { status: "ok", detail: `${token.substring(0, 50)}…` });
        } else {
          console.error('[FcmDiagnostic] ❌ Token vide');
          setStep('token', { status: "error", detail: "Token vide — vérifiez console pour les logs du SW" });
        }
      } catch (e) {
        console.error('[FcmDiagnostic] ❌ Error:', e);
        setStep('sw', { status: "error", detail: `❌ ${e.message}` });
        setStep('token', { status: "error", detail: `❌ ${e.message}` });
      }
    }

    setRunning(false);
  };

  // Envoyer une notif test via notifyUser (passe par le même chemin que prod)
  const sendTest = async (scenario) => {
    if (!userEmail) return;
    setSending(scenario);
    const configs = {
      foreground: {
        titre: "🔔 TEST FOREGROUND — App ouverte",
        message: "Vous devez voir ce toast dans l'app immédiatement.",
        priority: "normal",
      },
      background: {
        titre: "📲 TEST BACKGROUND — App en arrière-plan",
        message: "Mettez l'app en arrière-plan puis attendez cette notification.",
        priority: "high",
      },
      killed: {
        titre: "💀 TEST KILLED — App complètement fermée",
        message: "Fermez complètement l'app, attendez 5s, vous devriez recevoir cette notif.",
        priority: "high",
      },
    };
    const cfg = configs[scenario];
    try {
      const res = await base44.functions.invoke('notifyUser', {
        user_email: userEmail,
        role: "admin",
        titre: cfg.titre,
        message: cfg.message,
        type: "info",
        priority: cfg.priority,
        route: "/fcm-diagnostic",
        data: { type: "test_fcm", scenario },
      });
      const d = res.data;
      if (d.skipped) {
        toast.warning("Déduplication active — attendez 30s avant un second test identique");
      } else if (d.push && d.sent > 0) {
        toast.success(`✅ Push envoyé sur ${d.sent} appareil(s) — testez maintenant !`);
      } else if (d.push && d.sent === 0) {
        toast.error("Token FCM invalide ou expiré — relancez le diagnostic");
      } else {
        toast.info("Notif DB créée, pas de token FCM enregistré pour cet appareil");
      }
    } catch (e) {
      toast.error("Erreur: " + e.message);
    }
    setSending(null);
  };

  const activeToken = nativeToken || webToken;
  const allOk = steps.length > 0 && steps.every(s => ['ok', 'warn'].includes(s.status));
  const hasError = steps.some(s => s.status === 'error');

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Diagnostic FCM</h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            {isNative
              ? <><Smartphone className="h-3.5 w-3.5 text-primary" /><span className="text-xs text-primary font-semibold">APK Android natif (Capacitor)</span></>
              : <><Globe className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-xs text-muted-foreground">Navigateur Web (Service Worker)</span></>
            }
          </div>
        </div>
        <Button variant="outline" size="icon" onClick={runDiagnostic} disabled={running}>
          <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Permission notifications + Token display */}
      {!running && (
        <>
          <NotificationPermissionRequest 
            variant="card"
            onSuccess={() => runDiagnostic()}
          />
          
          {/* Affichage du token actuel */}
          {(webToken || nativeToken) && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-4 space-y-2">
                <p className="text-xs font-bold text-green-800">✅ Token FCM actuel</p>
                <div className="bg-white rounded-lg p-3 text-xs font-mono break-all text-green-700 border border-green-200 max-h-20 overflow-auto">
                  {webToken || nativeToken}
                </div>
                <p className="text-[10px] text-green-600">Enregistré automatiquement. Vous pouvez maintenant tester les notifications.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Status global */}
       {!running && steps.length > 0 && (
        <div className={`rounded-xl p-3 text-sm font-semibold text-center ${
          allOk ? 'bg-green-50 text-green-700 border border-green-200' :
          hasError ? 'bg-red-50 text-red-700 border border-red-200' :
          'bg-amber-50 text-amber-700 border border-amber-200'
        }`}>
          {allOk ? '✅ FCM opérationnel — prêt pour les tests !' :
           hasError ? '❌ Problèmes détectés — voir détails ci-dessous' :
           '⚠️ Avertissements'}
        </div>
      )}

      {/* Checks */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Checks système</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {steps.length === 0 && (
            <div className="flex items-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Diagnostic en cours…</span>
            </div>
          )}
          {steps.map(step => (
            <StatusRow key={step.id} label={step.label} status={step.status} detail={step.detail} />
          ))}
        </CardContent>
      </Card>

      {/* Tests des 3 scénarios */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" /> Tests sur téléphone réel
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Testez les 3 scénarios dans l'ordre. Chaque test envoie une vraie notification FCM via <code className="bg-muted px-1 rounded">notifyUser</code>.
          </p>

          {/* Test 1 — Foreground */}
          <div className="p-3 rounded-xl border border-green-200 bg-green-50 space-y-2">
            <div>
              <p className="text-sm font-semibold text-green-800">① App ouverte (Foreground)</p>
              <p className="text-xs text-green-700">Résultat attendu : toast orange en haut de l'écran</p>
            </div>
            <Button size="sm" className="w-full bg-green-700 hover:bg-green-800"
              onClick={() => sendTest('foreground')}
              disabled={!!sending || running || !activeToken}>
              {sending === 'foreground' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Tester Foreground
            </Button>
          </div>

          {/* Test 2 — Background */}
          <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 space-y-2">
            <div>
              <p className="text-sm font-semibold text-amber-800">② App en arrière-plan (Background)</p>
              <p className="text-xs text-amber-700">Appuyez sur "Tester", puis appuyez sur Home. Attendez la notification système.</p>
            </div>
            <Button size="sm" className="w-full bg-amber-600 hover:bg-amber-700"
              onClick={() => sendTest('background')}
              disabled={!!sending || running || !activeToken}>
              {sending === 'background' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Tester Background
            </Button>
          </div>

          {/* Test 3 — Killed */}
          <div className="p-3 rounded-xl border border-red-200 bg-red-50 space-y-2">
            <div>
              <p className="text-sm font-semibold text-red-800">③ App complètement fermée (Killed)</p>
              <p className="text-xs text-red-700">Appuyez sur "Tester", fermez l'app (swipe). Attendez la notification. Cliquez dessus pour revenir.</p>
            </div>
            <Button size="sm" className="w-full bg-red-600 hover:bg-red-700"
              onClick={() => sendTest('killed')}
              disabled={!!sending || running || !activeToken}>
              {sending === 'killed' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Tester App Fermée
            </Button>
          </div>

          {!activeToken && !running && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-center space-y-2">
              <p className="text-xs text-red-700 font-bold">❌ Token FCM manquant</p>
              <p className="text-xs text-red-600">1. Activez les notifications via le bouton ci-dessus</p>
              <p className="text-xs text-red-600">2. Rechargez la page</p>
              <p className="text-xs text-red-600">3. Relancez le diagnostic</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Guide correction */}
      {hasError && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-semibold text-amber-800">Guide de correction</p>
            <div className="space-y-1 text-xs text-amber-700">
              {isNative ? (
                <>
                  <p><strong>APK — Notifications app fermée :</strong></p>
                  <ol className="list-decimal list-inside space-y-0.5 ml-1">
                    <li>Vérifiez que le canal 'default' importance=5 est créé ✅</li>
                    <li>Payload FCM doit avoir <code>notification + data + android.priority=HIGH</code></li>
                    <li>Vérifiez dans Paramètres Android → Apps → CDL → Notifications = Activé</li>
                    <li>Désactivez l'optimisation batterie pour CDL</li>
                    <li>Vérifiez que google-services.json est présent dans l'APK</li>
                  </ol>
                </>
              ) : (
                <>
                  <p><strong>Web — FIREBASE_SERVICE_ACCOUNT_JSON invalide ?</strong></p>
                  <ol className="list-decimal list-inside space-y-0.5 ml-1">
                    <li>Firebase Console → Paramètres → Comptes de service</li>
                    <li>Générer une nouvelle clé privée → .json</li>
                    <li>Coller le contenu complet dans le secret</li>
                  </ol>
                  <p className="mt-2"><strong>VAPID_KEY invalide ?</strong></p>
                  <ol className="list-decimal list-inside space-y-0.5 ml-1">
                    <li>Firebase Console → Cloud Messaging → Certificats Web Push</li>
                    <li>Copier la clé publique dans VITE_FIREBASE_VAPID_KEY</li>
                  </ol>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}