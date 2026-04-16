/**
 * FcmDiagnostic — Diagnostic FCM + Capacitor complet
 * Affiche TOUS les indices disponibles pour diagnostiquer pourquoi
 * Capacitor n'est pas détecté dans la WebView Android.
 */
import { useState, useEffect, useRef } from 'react';

function getFullDiagnosticInfo() {
  const cap = window.Capacitor;
  const ua = navigator.userAgent;

  // Indices de détection Android/WebView
  const isAndroidUA = /Android/i.test(ua);
  const isWebView = /wv\)/i.test(ua) || /WebView/i.test(ua);
  const isCapacitorUA = /Capacitor/i.test(ua);
  const hasCapacitorObj = !!cap;
  const isNativePlatform = cap?.isNativePlatform?.() ?? cap?.isNative ?? false;
  const platform = cap?.getPlatform?.() ?? (isNativePlatform ? 'android' : 'web');
  const pluginNames = cap ? Object.keys(cap.Plugins || {}) : [];

  // Vérifier si on est chargé depuis une URL distante vs locale
  const currentUrl = document.URL || window.location?.href || '';
  const isRemoteUrl = currentUrl.startsWith('http') && !currentUrl.startsWith('http://localhost');
  const isCapacitorUrl = currentUrl.startsWith('capacitor://') || currentUrl.startsWith('ionic://');

  return {
    // Capacitor
    hasCapacitorObj,
    isNativePlatform,
    platform,
    pluginNames,
    capVersion: cap?.version ?? 'N/A',

    // URL
    currentUrl,
    isRemoteUrl,
    isCapacitorUrl,

    // User Agent
    ua,
    isAndroidUA,
    isWebView,
    isCapacitorUA,

    // Environnement
    hasPushPlugin: !!cap?.Plugins?.PushNotifications,
    hasStatusBarPlugin: !!cap?.Plugins?.StatusBar,
    hasDevicePlugin: !!cap?.Plugins?.Device,
  };
}

export default function FcmDiagnostic() {
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState({});
  const [running, setRunning] = useState(false);
  const [info, setInfo] = useState(null);
  const isMounted = useRef(true);

  const addLog = (msg, type = 'info') => {
    const ts = new Date().toLocaleTimeString();
    if (isMounted.current) setLogs(prev => [...prev, { msg, type, ts }]);
  };

  useEffect(() => {
    isMounted.current = true;

    // Détecter immédiatement puis re-détecter après 800ms (délai injection Capacitor)
    const detect = () => {
      const d = getFullDiagnosticInfo();
      if (isMounted.current) {
        setInfo(d);
        setStatus({ platform: d.platform, isNative: String(d.isNativePlatform) });
      }
    };

    detect();
    const t = setTimeout(detect, 800);
    return () => { isMounted.current = false; clearTimeout(t); };
  }, []);

  const runDiagnostic = async () => {
    setRunning(true);
    setLogs([]);

    // Re-détecter au moment du clic
    const d = getFullDiagnosticInfo();
    setInfo(d);

    addLog('═══════════════════════════', 'info');
    addLog('🚀 DIAGNOSTIC FCM COMPLET', 'info');
    addLog('═══════════════════════════', 'info');

    // ── ENV ──────────────────────────────────────────────────────────────────
    addLog('--- ENVIRONNEMENT ---', 'info');
    addLog(`URL chargement: ${d.currentUrl.substring(0, 80)}`, d.isCapacitorUrl ? 'success' : d.isRemoteUrl ? 'error' : 'warn');
    addLog(`URL type: ${d.isCapacitorUrl ? '✅ capacitor://' : d.isRemoteUrl ? '❌ DISTANTE (http)' : '⚠️ locale'}`, d.isCapacitorUrl ? 'success' : 'error');
    addLog(`UA Android: ${d.isAndroidUA ? '✅ oui' : '❌ non'}`, d.isAndroidUA ? 'success' : 'warn');
    addLog(`UA WebView: ${d.isWebView ? '✅ oui' : 'non'}`, 'info');
    addLog(`UA Capacitor: ${d.isCapacitorUA ? '✅ oui' : 'non'}`, 'info');
    addLog(`UA: ${d.ua.substring(0, 120)}`, 'info');

    // ── CAPACITOR ────────────────────────────────────────────────────────────
    addLog('--- CAPACITOR ---', 'info');
    addLog(`window.Capacitor: ${d.hasCapacitorObj ? '✅ PRÉSENT' : '❌ ABSENT'}`, d.hasCapacitorObj ? 'success' : 'error');
    addLog(`isNativePlatform(): ${d.isNativePlatform ? '✅ TRUE' : '❌ FALSE'}`, d.isNativePlatform ? 'success' : 'error');
    addLog(`platform: ${d.platform}`, d.platform === 'android' ? 'success' : 'warn');
    addLog(`Plugins disponibles (${d.pluginNames.length}): ${d.pluginNames.join(', ') || 'AUCUN'}`, d.pluginNames.length > 0 ? 'success' : 'error');
    addLog(`PushNotifications plugin: ${d.hasPushPlugin ? '✅ PRÉSENT' : '❌ ABSENT'}`, d.hasPushPlugin ? 'success' : 'error');

    // ── DIAGNOSTIC DE L'URL (cause la plus fréquente) ────────────────────────
    if (d.isRemoteUrl && !d.isCapacitorUrl) {
      addLog('═══════════════════════════', 'error');
      addLog('❌ PROBLÈME IDENTIFIÉ: URL distante', 'error');
      addLog('La WebView charge depuis une URL http://', 'error');
      addLog('Capacitor ne peut PAS injecter window.Capacitor', 'error');
      addLog('dans une page distante (sécurité Android)!', 'error');
      addLog('═══════════════════════════', 'error');
      addLog('✅ SOLUTION: Copier le build web dans /android/app/src/main/assets/public/', 'warn');
      addLog('✅ SOLUTION: Utiliser capacitor copy android puis rebuilder l\'APK', 'warn');
      addLog('✅ SOLUTION: L\'APK doit charger depuis capacitor://localhost/', 'warn');
      setRunning(false);
      return;
    }

    if (!d.hasCapacitorObj) {
      addLog('═══════════════════════════', 'error');
      addLog('❌ window.Capacitor absent', 'error');
      addLog('Le runtime Capacitor n\'est pas injecté.', 'error');
      addLog('Rebuild APK requis avec assets copiés.', 'error');
      addLog('═══════════════════════════', 'error');
      setRunning(false);
      return;
    }

    if (!d.isNativePlatform) {
      addLog('⚠️ Capacitor présent mais isNativePlatform=false', 'warn');
      addLog('Peut indiquer un APK debug non signé ou une config incorrecte', 'warn');
    }

    // ── FCM ──────────────────────────────────────────────────────────────────
    addLog('--- FCM PUSH NOTIFICATIONS ---', 'info');

    let PushNotifications;
    try {
      const mod = await import('@capacitor/push-notifications');
      PushNotifications = mod.PushNotifications;
      addLog('✅ @capacitor/push-notifications importé', 'success');
    } catch (err) {
      addLog(`❌ Import échoué: ${err.message}`, 'error');
      setRunning(false);
      return;
    }

    // Permission
    let permResult;
    try {
      permResult = await PushNotifications.checkPermissions();
      addLog(`Permission actuelle: ${permResult.receive}`, permResult.receive === 'granted' ? 'success' : 'warn');
    } catch (err) {
      addLog(`⚠️ checkPermissions: ${err.message}`, 'warn');
      permResult = { receive: 'prompt' };
    }

    if (permResult.receive !== 'granted') {
      try {
        const req = await PushNotifications.requestPermissions();
        addLog(`Permission demandée: ${req.receive}`, req.receive === 'granted' ? 'success' : 'error');
        if (req.receive !== 'granted') {
          addLog('❌ Permission refusée', 'error');
          setRunning(false);
          return;
        }
      } catch (err) {
        addLog(`❌ requestPermissions: ${err.message}`, 'error');
        setRunning(false);
        return;
      }
    }

    // Canal Android
    try {
      await PushNotifications.createChannel({ id: 'default', name: 'CDL', importance: 5, sound: 'default', vibration: true });
      addLog('✅ Canal Android "default" créé', 'success');
    } catch (err) {
      addLog(`⚠️ createChannel: ${err.message}`, 'warn');
    }

    // Register + listener token
    addLog('register() en cours — attente token FCM...', 'info');
    let tokenCaptured = false;

    const timeout = setTimeout(() => {
      if (!tokenCaptured) {
        addLog('❌ TIMEOUT 15s — token non reçu', 'error');
        addLog('💡 Vérif: google-services.json dans le build Android', 'warn');
        addLog('💡 Vérif: Google Play Services disponible sur l\'appareil', 'warn');
        setRunning(false);
      }
    }, 15000);

    try {
      const tokenListener = await PushNotifications.addListener('registration', async (token) => {
        clearTimeout(timeout);
        tokenCaptured = true;
        const val = token.value;
        addLog(`✅ TOKEN FCM REÇU! (${val.length} chars)`, 'success');
        addLog(`Token: ${val.substring(0, 50)}...`, 'success');
        setStatus(s => ({ ...s, token: val.substring(0, 30) + '...' }));

        // Sauvegarde BDD
        try {
          const { base44 } = await import('@/api/base44Client');
          const me = await base44.auth.me();
          if (me?.email) {
            const res = await base44.functions.invoke('saveFcmToken', { token: val, userId: me.id, userEmail: me.email, userRole: me.role });
            addLog(`✅ Token sauvegardé BDD — id: ${res.data?.token_id}`, 'success');
            setStatus(s => ({ ...s, saved: true }));
          } else {
            addLog('⚠️ Non connecté — token non sauvegardé', 'warn');
          }
        } catch (e) {
          addLog(`❌ saveFcmToken: ${e.message}`, 'error');
        }

        setRunning(false);
        tokenListener.remove();
      });

      const errListener = await PushNotifications.addListener('registrationError', (err) => {
        clearTimeout(timeout);
        addLog(`❌ registrationError: ${JSON.stringify(err)}`, 'error');
        setRunning(false);
        errListener.remove();
      });

      await PushNotifications.register();
      addLog('✅ register() appelé', 'success');

    } catch (err) {
      clearTimeout(timeout);
      addLog(`❌ ${err.message}`, 'error');
      setRunning(false);
    }
  };

  const colorMap = { info: '#e0f0ff', success: '#d4edda', warn: '#fff3cd', error: '#f8d7da' };
  const textMap = { info: '#1a5276', success: '#155724', warn: '#856404', error: '#721c24' };

  const isNative = info?.isNativePlatform ?? false;
  const badgeColor = isNative ? '#238636' : (info?.isAndroidUA ? '#9e6a03' : '#6e40c9');
  const badgeLabel = isNative
    ? `✅ APK Natif — ${info?.platform}`
    : info?.isAndroidUA
      ? `⚠️ Android détecté MAIS Capacitor absent`
      : `🌐 Web — platform: ${info?.platform ?? '...'}`;

  return (
    <div style={{ fontFamily: 'monospace', padding: '16px', maxWidth: '100%', background: '#0d1117', minHeight: '100vh', color: '#e6edf3' }}>
      <h1 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px', color: '#58a6ff' }}>
        🔬 CDL FCM Diagnostic
      </h1>

      {/* Badge plateforme */}
      <div style={{ padding: '6px 14px', borderRadius: '20px', marginBottom: '12px', fontSize: '12px', fontWeight: 'bold', background: badgeColor, color: 'white', display: 'inline-block' }}>
        {badgeLabel}
      </div>

      {/* Info rapide */}
      {info && (
        <div style={{ background: '#161b22', borderRadius: '8px', padding: '10px', marginBottom: '12px', border: '1px solid #30363d', fontSize: '11px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
            {[
              ['URL', info.currentUrl.substring(0, 40) + '...'],
              ['capacitor://', String(info.isCapacitorUrl)],
              ['window.Capacitor', String(info.hasCapacitorObj)],
              ['isNativePlatform', String(info.isNativePlatform)],
              ['platform', info.platform],
              ['PushPlugin', String(info.hasPushPlugin)],
              ['Plugins', info.pluginNames.length + ' trouvés'],
              ['Android UA', String(info.isAndroidUA)],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: '4px' }}>
                <span style={{ color: '#8b949e' }}>{k}:</span>
                <span style={{ color: v === 'true' ? '#3fb950' : v === 'false' ? '#f85149' : '#e6edf3', fontWeight: 'bold' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Statut token */}
      {Object.keys(status).length > 0 && (
        <div style={{ background: '#161b22', borderRadius: '8px', padding: '10px', marginBottom: '12px', border: '1px solid #30363d', fontSize: '11px' }}>
          <p style={{ color: '#8b949e', marginBottom: '4px' }}>STATUT TOKEN</p>
          {Object.entries(status).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: '8px' }}>
              <span style={{ color: '#8b949e' }}>{k}:</span>
              <span style={{ color: '#3fb950' }}>{String(v)}</span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={runDiagnostic}
        disabled={running}
        style={{ width: '100%', padding: '14px', background: running ? '#21262d' : '#238636', color: running ? '#8b949e' : 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold', cursor: running ? 'not-allowed' : 'pointer', marginBottom: '16px' }}
      >
        {running ? '⏳ Diagnostic en cours...' : '▶ Lancer diagnostic FCM complet'}
      </button>

      <div style={{ background: '#161b22', borderRadius: '8px', border: '1px solid #30363d', overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #30363d', fontSize: '11px', color: '#8b949e' }}>
          LOGS ({logs.length})
        </div>
        <div style={{ maxHeight: '55vh', overflowY: 'auto', padding: '8px' }}>
          {logs.length === 0 && (
            <p style={{ fontSize: '12px', color: '#8b949e', padding: '8px', textAlign: 'center' }}>
              Appuie sur "Lancer diagnostic" pour commencer
            </p>
          )}
          {logs.map((log, i) => (
            <div key={i} style={{ fontSize: '11px', padding: '3px 8px', marginBottom: '2px', borderRadius: '4px', background: colorMap[log.type], color: textMap[log.type], wordBreak: 'break-all' }}>
              <span style={{ opacity: 0.6, marginRight: '6px' }}>{log.ts}</span>
              {log.msg}
            </div>
          ))}
        </div>
      </div>

      {/* Guide rebuild si URL distante */}
      {info?.isRemoteUrl && !info?.isCapacitorUrl && (
        <div style={{ marginTop: '16px', padding: '12px', background: '#3d1f00', borderRadius: '8px', border: '1px solid #9e4300', fontSize: '11px' }}>
          <p style={{ color: '#ffa657', fontWeight: 'bold', marginBottom: '8px' }}>⚠️ CAUSE PROBABLE: L'APK charge une URL distante</p>
          <p style={{ color: '#e6d3b3', marginBottom: '4px' }}>La WebView charge depuis: <strong>{info.currentUrl.substring(0, 60)}</strong></p>
          <p style={{ color: '#e6d3b3', marginBottom: '8px' }}>Capacitor NE PEUT PAS injecter window.Capacitor dans une page http distante.</p>
          <p style={{ color: '#ffa657', fontWeight: 'bold', marginBottom: '4px' }}>✅ CORRECTION REQUISE:</p>
          <p style={{ color: '#e6d3b3' }}>1. npm run build → copier dist/ dans android/app/src/main/assets/public/</p>
          <p style={{ color: '#e6d3b3' }}>2. npx cap sync android</p>
          <p style={{ color: '#e6d3b3' }}>3. Rebuilder l'APK depuis Android Studio</p>
          <p style={{ color: '#e6d3b3' }}>4. L'APK doit charger depuis capacitor://localhost/</p>
        </div>
      )}

      <p style={{ fontSize: '10px', color: '#8b949e', marginTop: '12px', textAlign: 'center' }}>
        /fcm-diagnostic — CDL v2
      </p>
    </div>
  );
}