/**
 * FcmDiagnostic — Page de diagnostic FCM natif Capacitor
 * Détection plateforme dynamique (évaluée au runtime, pas à l'import)
 */
import { useState, useEffect, useRef } from 'react';

// ── Détection dynamique — évaluée au moment de l'appel, pas à l'import ──────
function detectPlatform() {
  const cap = window.Capacitor;
  if (!cap) return { isNative: false, platform: 'web', detail: 'Capacitor absent' };

  const isNative = typeof cap.isNativePlatform === 'function'
    ? cap.isNativePlatform()
    : !!cap.isNative;

  const platform = cap.getPlatform?.() || (isNative ? 'android' : 'web');

  return {
    isNative,
    platform,
    detail: `isNative=${isNative} | platform=${platform} | plugins=${Object.keys(cap.Plugins || {}).join(', ') || 'none'}`,
  };
}

export default function FcmDiagnostic() {
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState({});
  const [running, setRunning] = useState(false);
  const [platformInfo, setPlatformInfo] = useState({ isNative: false, platform: '...', detail: '...' });
  const isMounted = useRef(true);

  const addLog = (msg, type = 'info') => {
    const ts = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { msg, type, ts }]);
  };

  // Détection au mount — laisse le temps à Capacitor de s'injecter
  useEffect(() => {
    isMounted.current = true;

    const detect = () => {
      const info = detectPlatform();
      if (isMounted.current) {
        setPlatformInfo(info);
        setLogs([
          { msg: '📄 Page FCM Diagnostic chargée', type: 'success', ts: new Date().toLocaleTimeString() },
          { msg: `🖥️ Plateforme: ${info.isNative ? '🔴 APK Natif (Capacitor)' : '🌐 Web/PWA'}`, type: info.isNative ? 'success' : 'warn', ts: new Date().toLocaleTimeString() },
          { msg: `📦 ${info.detail}`, type: 'info', ts: new Date().toLocaleTimeString() },
          { msg: `🌐 UA: ${navigator.userAgent.substring(0, 100)}`, type: 'info', ts: new Date().toLocaleTimeString() },
        ]);
      }
    };

    // Double tentative : immédiat + 500ms (Capacitor peut être injecté légèrement après)
    detect();
    const t = setTimeout(detect, 600);
    return () => { isMounted.current = false; clearTimeout(t); };
  }, []);

  const runDiagnostic = async () => {
    setRunning(true);
    setLogs([]);

    // Re-détecter au moment du clic (plus fiable)
    const info = detectPlatform();
    setPlatformInfo(info);

    addLog('🚀 Démarrage diagnostic FCM complet...', 'info');
    addLog(`STEP 1 → Plateforme: ${info.isNative ? '🔴 APK Natif' : '🌐 Web'}`, info.isNative ? 'success' : 'warn');
    addLog(`STEP 1 → ${info.detail}`, 'info');
    setStatus({ platform: info.platform });

    if (!info.isNative) {
      addLog('ℹ️ Mode web détecté — FCM natif Capacitor non disponible ici', 'warn');
      addLog('💡 Sur APK Android, cette page doit afficher "🔴 APK Natif"', 'info');
      addLog('💡 Si vous êtes sur APK et voyez "web": Capacitor non injecté correctement', 'error');

      // Dump complet pour debug
      addLog(`window.Capacitor = ${JSON.stringify(window.Capacitor || null)}`, 'info');
      addLog(`document.URL = ${document.URL}`, 'info');

      if (typeof Notification !== 'undefined') {
        addLog(`🔔 Permission web: ${Notification.permission}`, 'info');
      }
      setRunning(false);
      return;
    }

    // ── STEP 2: Charger le plugin Capacitor Push Notifications ──────────────
    addLog('STEP 2 → Chargement @capacitor/push-notifications...', 'info');
    let PushNotifications;
    try {
      const mod = await import('@capacitor/push-notifications');
      PushNotifications = mod.PushNotifications;
      addLog('STEP 2 → ✅ Module Capacitor chargé', 'success');
    } catch (err) {
      addLog(`STEP 2 → ❌ Import échoué: ${err.message}`, 'error');
      setRunning(false);
      return;
    }

    // ── STEP 3: Vérifier permission actuelle ────────────────────────────────
    addLog('STEP 3 → checkPermissions()...', 'info');
    let permResult;
    try {
      permResult = await PushNotifications.checkPermissions();
      addLog(`STEP 3 → Permission: ${permResult.receive}`, permResult.receive === 'granted' ? 'success' : 'warn');
      setStatus(s => ({ ...s, permission: permResult.receive }));
    } catch (err) {
      addLog(`STEP 3 → ⚠️ checkPermissions error: ${err.message}`, 'warn');
      permResult = { receive: 'prompt' };
    }

    // ── STEP 4: Demander permission si nécessaire ────────────────────────────
    if (permResult.receive !== 'granted') {
      addLog('STEP 4 → requestPermissions()...', 'info');
      try {
        const reqResult = await PushNotifications.requestPermissions();
        addLog(`STEP 4 → Réponse: ${reqResult.receive}`, reqResult.receive === 'granted' ? 'success' : 'error');
        if (reqResult.receive !== 'granted') {
          addLog('STEP 4 → ❌ Permission refusée — token impossible', 'error');
          setRunning(false);
          return;
        }
      } catch (err) {
        addLog(`STEP 4 → ❌ requestPermissions error: ${err.message}`, 'error');
        setRunning(false);
        return;
      }
    } else {
      addLog('STEP 4 → ✅ Permission déjà accordée', 'success');
    }

    // ── STEP 5: Canal Android ────────────────────────────────────────────────
    addLog('STEP 5 → createChannel("default", importance=5)...', 'info');
    try {
      await PushNotifications.createChannel({
        id: 'default',
        name: 'CDL Notifications',
        description: 'Notifications CDL',
        importance: 5,
        sound: 'default',
        vibration: true,
      });
      addLog('STEP 5 → ✅ Canal créé', 'success');
    } catch (err) {
      addLog(`STEP 5 → ⚠️ ${err.message}`, 'warn');
    }

    // ── STEP 6: Listener + register() ───────────────────────────────────────
    addLog('STEP 6 → Ajout listener "registration"...', 'info');
    let tokenCaptured = false;

    const tokenTimeout = setTimeout(() => {
      if (!tokenCaptured) {
        addLog('STEP 6 → ❌ TIMEOUT 15s — aucun token reçu', 'error');
        addLog('💡 Cause probable: google-services.json absent ou Play Services non disponible', 'warn');
        setRunning(false);
      }
    }, 15000);

    try {
      const tokenListener = await PushNotifications.addListener('registration', async (token) => {
        clearTimeout(tokenTimeout);
        tokenCaptured = true;
        const tokenValue = token.value;
        addLog(`STEP 6 → ✅ TOKEN FCM GÉNÉRÉ! (${tokenValue.length} chars)`, 'success');
        addLog(`STEP 6 → Token: ${tokenValue.substring(0, 40)}...`, 'success');
        setStatus(s => ({ ...s, token: tokenValue.substring(0, 30) + '...' }));

        // ── STEP 7: Sauvegarder en BDD ───────────────────────────────────
        addLog('STEP 7 → Sauvegarde token en BDD...', 'info');
        try {
          const { base44 } = await import('@/api/base44Client');
          const me = await base44.auth.me();
          addLog(`STEP 7 → User: ${me?.email || 'NON CONNECTÉ'}`, me?.email ? 'info' : 'warn');

          if (!me?.email) {
            addLog('STEP 7 → ⚠️ Non connecté — connectez-vous pour sauvegarder', 'warn');
          } else {
            const res = await base44.functions.invoke('saveFcmToken', {
              token: tokenValue,
              userId: me.id,
              userEmail: me.email,
              userRole: me.role,
            });
            addLog('STEP 7 → ✅ TOKEN SAUVEGARDÉ EN BDD!', 'success');
            addLog(`STEP 7 → token_id: ${res.data?.token_id}`, 'success');
            addLog(`STEP 7 → user: ${res.data?.user_email}`, 'success');
            setStatus(s => ({ ...s, saved: true, token_id: res.data?.token_id }));
          }
        } catch (saveErr) {
          addLog(`STEP 7 → ❌ saveFcmToken: ${saveErr.message}`, 'error');
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

      addLog('STEP 6 → register() appelé — en attente token...', 'info');
      await PushNotifications.register();
      addLog('STEP 6 → ✅ register() OK — attente event...', 'success');

    } catch (err) {
      clearTimeout(tokenTimeout);
      addLog(`STEP 6 → ❌ ${err.message}`, 'error');
      setRunning(false);
    }
  };

  const colorMap = { info: '#e0f0ff', success: '#d4edda', warn: '#fff3cd', error: '#f8d7da' };
  const textMap = { info: '#1a5276', success: '#155724', warn: '#856404', error: '#721c24' };

  return (
    <div style={{ fontFamily: 'monospace', padding: '16px', maxWidth: '100%', background: '#0d1117', minHeight: '100vh', color: '#e6edf3' }}>
      <h1 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '4px', color: '#58a6ff' }}>
        🔬 CDL FCM Diagnostic
      </h1>

      {/* Plateforme badge — mis à jour dynamiquement */}
      <div style={{
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: '20px',
        marginBottom: '12px',
        fontSize: '12px',
        fontWeight: 'bold',
        background: platformInfo.isNative ? '#238636' : '#9e6a03',
        color: 'white',
      }}>
        {platformInfo.isNative ? '🔴 APK Natif — Capacitor Android' : `🌐 Web/PWA — platform: ${platformInfo.platform}`}
      </div>

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
          padding: '14px',
          background: running ? '#21262d' : '#238636',
          color: running ? '#8b949e' : 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '15px',
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
        /fcm-diagnostic — CDL v2 — détection dynamique Capacitor
      </p>
    </div>
  );
}