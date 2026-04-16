/**
 * FcmDiagnostic — Page de diagnostic FCM publique (sans auth requise)
 * Accessible sur /fcm-diagnostic depuis n'importe quel appareil.
 */
import { useState, useEffect } from 'react';

export default function FcmDiagnostic() {
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState({});
  const [running, setRunning] = useState(false);

  const addLog = (msg, type = 'info') => {
    const ts = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { msg, type, ts }]);
  };

  const isNative = typeof window !== 'undefined' &&
    window.Capacitor?.isNativePlatform?.();

  useEffect(() => {
    addLog('📄 Page FCM Diagnostic chargée', 'success');
    addLog(`🖥️ Plateforme: ${isNative ? 'APK Natif (Capacitor)' : 'Web/PWA (navigateur)'}`, 'info');
    addLog(`📦 Capacitor disponible: ${!!window.Capacitor}`, 'info');
    addLog(`🌐 User Agent: ${navigator.userAgent.substring(0, 80)}`, 'info');

    // Vérifier permission navigateur (web)
    if (!isNative && typeof Notification !== 'undefined') {
      addLog(`🔔 Permission Notification (web): ${Notification.permission}`, 
        Notification.permission === 'granted' ? 'success' : 'warn');
    }
  }, []);

  const runDiagnostic = async () => {
    setRunning(true);
    setLogs([]);
    addLog('🚀 Démarrage diagnostic FCM complet...', 'info');

    // ── STEP 1: Vérifier la plateforme
    addLog(`STEP 1 → Plateforme: ${isNative ? '🔴 APK Natif' : '🌐 Web'}`, 'info');
    setStatus(s => ({ ...s, platform: isNative ? 'native' : 'web' }));

    if (!isNative) {
      addLog('ℹ️ Mode web: pas de FCM natif Capacitor sur navigateur', 'warn');
      addLog('✅ Sur APK, cette page affichera les étapes FCM natif', 'info');

      // Test web Notification API
      if (typeof Notification !== 'undefined') {
        addLog(`STEP 2 → Permission web: ${Notification.permission}`, 
          Notification.permission === 'granted' ? 'success' : 'warn');
        if (Notification.permission === 'default') {
          addLog('STEP 2 → Demande permission web...', 'info');
          const perm = await Notification.requestPermission();
          addLog(`STEP 2 → Résultat: ${perm}`, perm === 'granted' ? 'success' : 'error');
        }
      }
      setRunning(false);
      return;
    }

    // ── STEP 2: Charger Capacitor Push Notifications
    addLog('STEP 2 → Chargement @capacitor/push-notifications...', 'info');
    let PushNotifications;
    try {
      const mod = await import('@capacitor/push-notifications');
      PushNotifications = mod.PushNotifications;
      addLog('STEP 2 → ✅ Module Capacitor chargé', 'success');
    } catch (err) {
      addLog(`STEP 2 → ❌ Erreur chargement: ${err.message}`, 'error');
      setRunning(false);
      return;
    }

    // ── STEP 3: Vérifier permission actuelle
    addLog('STEP 3 → Vérification permission actuelle...', 'info');
    let permResult;
    try {
      permResult = await PushNotifications.checkPermissions();
      addLog(`STEP 3 → Permission actuelle: ${permResult.receive}`, 
        permResult.receive === 'granted' ? 'success' : 'warn');
      setStatus(s => ({ ...s, permission: permResult.receive }));
    } catch (err) {
      addLog(`STEP 3 → ❌ checkPermissions error: ${err.message}`, 'error');
      permResult = { receive: 'prompt' };
    }

    // ── STEP 4: Demander permission si pas encore accordée
    if (permResult.receive !== 'granted') {
      addLog('STEP 4 → Permission non accordée — demande en cours...', 'warn');
      try {
        const reqResult = await PushNotifications.requestPermissions();
        addLog(`STEP 4 → Réponse utilisateur: ${reqResult.receive}`, 
          reqResult.receive === 'granted' ? 'success' : 'error');
        if (reqResult.receive !== 'granted') {
          addLog('STEP 4 → ❌ Permission refusée — impossible de générer un token', 'error');
          setRunning(false);
          return;
        }
      } catch (err) {
        addLog(`STEP 4 → ❌ requestPermissions error: ${err.message}`, 'error');
        setRunning(false);
        return;
      }
    } else {
      addLog('STEP 4 → ✅ Permission déjà accordée (FALLBACK DIRECT)', 'success');
    }

    // ── STEP 5: Créer le canal Android
    addLog('STEP 5 → Création canal Android "default"...', 'info');
    try {
      await PushNotifications.createChannel({
        id: 'default',
        name: 'CDL Notifications',
        description: 'Notifications CDL',
        importance: 5,
        sound: 'default',
        vibration: true,
      });
      addLog('STEP 5 → ✅ Canal "default" importance=5 créé', 'success');
    } catch (err) {
      addLog(`STEP 5 → ⚠️ createChannel: ${err.message} (peut être normal)`, 'warn');
    }

    // ── STEP 6: Enregistrer listener + appeler register()
    addLog('STEP 6 → Enregistrement listener "registration"...', 'info');
    let tokenCaptured = false;

    const tokenTimeout = setTimeout(() => {
      if (!tokenCaptured) {
        addLog('STEP 6 → ❌ TIMEOUT: Aucun token reçu après 15 secondes!', 'error');
        addLog('💡 Vérifiez: google-services.json, FIREBASE_SERVICE_ACCOUNT_JSON, Play Services à jour', 'warn');
        setRunning(false);
      }
    }, 15000);

    try {
      const tokenListener = await PushNotifications.addListener('registration', async (token) => {
        clearTimeout(tokenTimeout);
        tokenCaptured = true;
        const tokenValue = token.value;
        addLog(`STEP 6 → ✅ TOKEN GÉNÉRÉ! (${tokenValue.length} chars)`, 'success');
        addLog(`STEP 6 → Token début: ${tokenValue.substring(0, 30)}...`, 'info');
        setStatus(s => ({ ...s, token: tokenValue.substring(0, 30) + '...' }));

        // ── STEP 7: Appeler saveFcmToken
        addLog('STEP 7 → Appel saveFcmToken (sauvegarde en BDD)...', 'info');
        try {
          const { base44 } = await import('@/api/base44Client');
          const me = await base44.auth.me();
          addLog(`STEP 7 → User: ${me?.email || 'non connecté'}`, me?.email ? 'info' : 'warn');

          if (!me?.email) {
            addLog('STEP 7 → ⚠️ Utilisateur non connecté — token non sauvegardé', 'warn');
          } else {
            const res = await base44.functions.invoke('saveFcmToken', {
              token: tokenValue,
              userId: me.id,
              userEmail: me.email,
              userRole: me.role,
            });
            addLog(`STEP 7 → ✅ TOKEN SAUVEGARDÉ EN BDD!`, 'success');
            addLog(`STEP 7 → token_id: ${res.data?.token_id}`, 'success');
            addLog(`STEP 7 → user_email: ${res.data?.user_email}`, 'success');
            setStatus(s => ({ ...s, saved: true, token_id: res.data?.token_id }));
          }
        } catch (saveErr) {
          addLog(`STEP 7 → ❌ saveFcmToken error: ${saveErr.message}`, 'error');
        }

        setRunning(false);
        tokenListener.remove();
      });

      const errListener = await PushNotifications.addListener('registrationError', (err) => {
        clearTimeout(tokenTimeout);
        addLog(`STEP 6 → ❌ registrationError: ${JSON.stringify(err)}`, 'error');
        setRunning(false);
        errListener.remove();
      });

      addLog('STEP 6 → Appel register()...', 'info');
      await PushNotifications.register();
      addLog('STEP 6 → ✅ register() appelé — en attente du token...', 'success');

    } catch (err) {
      clearTimeout(tokenTimeout);
      addLog(`STEP 6 → ❌ Erreur: ${err.message}`, 'error');
      setRunning(false);
    }
  };

  const colorMap = {
    info: '#e0f0ff',
    success: '#d4edda',
    warn: '#fff3cd',
    error: '#f8d7da',
  };

  const textMap = {
    info: '#1a5276',
    success: '#155724',
    warn: '#856404',
    error: '#721c24',
  };

  return (
    <div style={{ fontFamily: 'monospace', padding: '16px', maxWidth: '100%', background: '#0d1117', minHeight: '100vh', color: '#e6edf3' }}>
      <h1 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '4px', color: '#58a6ff' }}>
        🔬 CDL FCM Diagnostic
      </h1>
      <p style={{ fontSize: '12px', color: '#8b949e', marginBottom: '16px' }}>
        Plateforme: {isNative ? '🔴 APK Natif' : '🌐 Web/PWA'}
      </p>

      {/* Statut résumé */}
      {Object.keys(status).length > 0 && (
        <div style={{ background: '#161b22', borderRadius: '8px', padding: '12px', marginBottom: '12px', border: '1px solid #30363d' }}>
          <p style={{ fontSize: '11px', color: '#8b949e', marginBottom: '6px' }}>STATUT</p>
          {Object.entries(status).map(([k, v]) => (
            <div key={k} style={{ fontSize: '12px', display: 'flex', gap: '8px' }}>
              <span style={{ color: '#8b949e' }}>{k}:</span>
              <span style={{ color: '#3fb950' }}>{String(v)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Bouton lancer */}
      <button
        onClick={runDiagnostic}
        disabled={running}
        style={{
          width: '100%',
          padding: '12px',
          background: running ? '#21262d' : '#238636',
          color: running ? '#8b949e' : 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 'bold',
          cursor: running ? 'not-allowed' : 'pointer',
          marginBottom: '16px',
        }}
      >
        {running ? '⏳ Diagnostic en cours...' : '▶ Lancer diagnostic FCM complet'}
      </button>

      {/* Logs */}
      <div style={{ background: '#161b22', borderRadius: '8px', border: '1px solid #30363d', overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #30363d', fontSize: '11px', color: '#8b949e' }}>
          LOGS ({logs.length})
        </div>
        <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '8px' }}>
          {logs.length === 0 && (
            <p style={{ fontSize: '12px', color: '#8b949e', padding: '8px', textAlign: 'center' }}>
              Appuie sur "Lancer diagnostic" pour commencer
            </p>
          )}
          {logs.map((log, i) => (
            <div
              key={i}
              style={{
                fontSize: '11px',
                padding: '4px 8px',
                marginBottom: '2px',
                borderRadius: '4px',
                background: colorMap[log.type],
                color: textMap[log.type],
                wordBreak: 'break-all',
              }}
            >
              <span style={{ opacity: 0.6, marginRight: '8px' }}>{log.ts}</span>
              {log.msg}
            </div>
          ))}
        </div>
      </div>

      <p style={{ fontSize: '10px', color: '#8b949e', marginTop: '12px', textAlign: 'center' }}>
        /fcm-diagnostic — CDL v2 — Page publique (aucune auth requise)
      </p>
    </div>
  );
}