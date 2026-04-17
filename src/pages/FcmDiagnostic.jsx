/**
 * FcmDiagnostic — Diagnostic FCM Web SDK
 * Teste Firebase Messaging Web SDK (fonctionne dans APK Base44 + navigateur)
 */
import { useState, useEffect, useRef } from 'react';

function getEnvInfo() {
  const ua = navigator.userAgent;
  const cap = window.Capacitor;

  return {
    // URL
    currentUrl: (document.URL || window.location?.href || '').substring(0, 80),
    isCapacitorUrl: (document.URL || '').startsWith('capacitor://'),
    isRemoteUrl: (document.URL || '').startsWith('http') && !(document.URL || '').startsWith('http://localhost'),

    // Capacitor (présent dans APK Studio, absent dans APK Base44)
    hasCapacitor: !!cap,
    isNativePlatform: cap?.isNativePlatform?.() ?? false,
    capacitorPlatform: cap?.getPlatform?.() ?? 'N/A',

    // Web APIs (disponibles dans APK Base44)
    hasNotificationAPI: 'Notification' in window,
    notificationPermission: 'Notification' in window ? Notification.permission : 'N/A',
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,

    // User Agent
    ua: ua.substring(0, 120),
    isAndroid: /Android/i.test(ua),
    isWebView: /wv\)/i.test(ua) || /WebView/i.test(ua),
  };
}

export default function FcmDiagnostic() {
  const [logs, setLogs] = useState([]);
  const [info, setInfo] = useState(null);
  const [running, setRunning] = useState(false);
  const [tokenSaved, setTokenSaved] = useState(false);
  const isMounted = useRef(true);

  const addLog = (msg, type = 'info') => {
    const ts = new Date().toLocaleTimeString();
    if (isMounted.current) setLogs(prev => [...prev, { msg, type, ts }]);
  };

  useEffect(() => {
    isMounted.current = true;
    setInfo(getEnvInfo());
    return () => { isMounted.current = false; };
  }, []);

  const runDiagnostic = async () => {
    setRunning(true);
    setLogs([]);
    setTokenSaved(false);

    const d = getEnvInfo();
    setInfo(d);

    addLog('════════════════════════════', 'info');
    addLog('🚀 DIAGNOSTIC FCM WEB SDK', 'info');
    addLog('════════════════════════════', 'info');

    // ── Environnement ────────────────────────────────────────────────────
    addLog('--- ENVIRONNEMENT ---', 'info');
    addLog(`URL: ${d.currentUrl}`, 'info');
    addLog(`capacitor://: ${d.isCapacitorUrl ? '✅ oui' : '❌ non (APK Base44 = normal)'}`, d.isCapacitorUrl ? 'success' : 'warn');
    addLog(`window.Capacitor: ${d.hasCapacitor ? '✅ présent' : '⚠️ absent (APK Base44 = normal)'}`, 'warn');
    addLog(`Android UA: ${d.isAndroid ? '✅ oui' : 'non'}`, d.isAndroid ? 'success' : 'info');
    addLog(`WebView: ${d.isWebView ? '✅ oui' : 'non'}`, 'info');

    // ── Web APIs ──────────────────────────────────────────────────────────
    addLog('--- WEB APIs (nécessaires pour FCM Web) ---', 'info');
    addLog(`Notification API: ${d.hasNotificationAPI ? '✅ oui' : '❌ non'}`, d.hasNotificationAPI ? 'success' : 'error');
    addLog(`Service Worker: ${d.hasServiceWorker ? '✅ oui' : '❌ non'}`, d.hasServiceWorker ? 'success' : 'error');
    addLog(`Push Manager: ${d.hasPushManager ? '✅ oui' : '❌ non'}`, d.hasPushManager ? 'success' : 'error');
    addLog(`Permission actuelle: ${d.notificationPermission}`, d.notificationPermission === 'granted' ? 'success' : 'warn');

    if (!d.hasNotificationAPI || !d.hasServiceWorker || !d.hasPushManager) {
      addLog('═══════════════════════════', 'error');
      addLog('❌ Web APIs manquantes — FCM impossible', 'error');
      addLog('L\'APK ne supporte pas les Web Push APIs', 'error');
      setRunning(false);
      return;
    }

    // ── Service Worker ────────────────────────────────────────────────────
    addLog('--- SERVICE WORKER FIREBASE ---', 'info');
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      addLog(`SW enregistrés: ${regs.length}`, regs.length > 0 ? 'success' : 'warn');
      regs.forEach(r => addLog(`  - ${r.active?.scriptURL || r.scope}`, 'info'));
    } catch (err) {
      addLog(`⚠️ getRegistrations: ${err.message}`, 'warn');
    }

    // ── Firebase Web SDK ──────────────────────────────────────────────────
    addLog('--- FIREBASE WEB SDK ---', 'info');

    let initWebFcm, isFcmWebSupported;
    try {
      const mod = await import('@/lib/webFcm');
      initWebFcm = mod.initWebFcm;
      isFcmWebSupported = mod.isFcmWebSupported;
      addLog('✅ Module webFcm importé', 'success');
    } catch (err) {
      addLog(`❌ Import webFcm: ${err.message}`, 'error');
      setRunning(false);
      return;
    }

    if (!isFcmWebSupported()) {
      addLog('❌ FCM Web non supporté sur cet appareil', 'error');
      setRunning(false);
      return;
    }
    addLog('✅ FCM Web supporté', 'success');

    // ── Init + Token ──────────────────────────────────────────────────────
    addLog('Init FCM + demande permission + génération token...', 'info');

    try {
      const { permissionStatus, token } = await initWebFcm({
        onToken: (t) => {
          addLog(`✅ TOKEN FCM REÇU (${t.length} chars)`, 'success');
          addLog(`Token: ${t.substring(0, 50)}...`, 'success');
          if (isMounted.current) setTokenSaved(true);
        },
        onForegroundNotif: (n) => {
          addLog(`📬 Notification foreground: ${n.title}`, 'success');
        },
        onPermissionDenied: () => {
          addLog('❌ Permission refusée', 'error');
        },
      });

      addLog(`Permission finale: ${permissionStatus}`, permissionStatus === 'granted' ? 'success' : 'error');

      if (permissionStatus === 'granted' && token) {
        addLog('════════════════════════════', 'success');
        addLog('✅ FCM WEB ENTIÈREMENT FONCTIONNEL', 'success');
        addLog('Les notifications sont prêtes (app ouverte + background)', 'success');
        addLog('════════════════════════════', 'success');
      }
    } catch (err) {
      addLog(`❌ initWebFcm: ${err.message}`, 'error');
    }

    setRunning(false);
  };

  const colorMap = { info: '#e0f0ff', success: '#d4edda', warn: '#fff3cd', error: '#f8d7da' };
  const textMap = { info: '#1a5276', success: '#155724', warn: '#856404', error: '#721c24' };

  const modeLabel = info?.hasCapacitor && info?.isNativePlatform
    ? '✅ Capacitor Natif (Android Studio APK)'
    : info?.isAndroid
      ? '📱 APK Base44 (WebView distante) — FCM Web'
      : '🌐 Navigateur Web — FCM Web';

  const modeBg = info?.hasCapacitor && info?.isNativePlatform ? '#238636' : '#1a73e8';

  return (
    <div style={{ fontFamily: 'monospace', padding: '16px', maxWidth: '100%', background: '#0d1117', minHeight: '100vh', color: '#e6edf3' }}>
      <h1 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px', color: '#58a6ff' }}>
        🔬 CDL FCM Diagnostic
      </h1>

      {/* Badge mode */}
      <div style={{ padding: '6px 14px', borderRadius: '20px', marginBottom: '12px', fontSize: '12px', fontWeight: 'bold', background: modeBg, color: 'white', display: 'inline-block' }}>
        {modeLabel}
      </div>

      {/* Info rapide */}
      {info && (
        <div style={{ background: '#161b22', borderRadius: '8px', padding: '10px', marginBottom: '12px', border: '1px solid #30363d', fontSize: '11px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
            {[
              ['Notification API', String(info.hasNotificationAPI)],
              ['Service Worker', String(info.hasServiceWorker)],
              ['Push Manager', String(info.hasPushManager)],
              ['Permission', info.notificationPermission],
              ['Android UA', String(info.isAndroid)],
              ['window.Capacitor', String(info.hasCapacitor)],
              ['Token sauvegardé', String(tokenSaved)],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: '4px' }}>
                <span style={{ color: '#8b949e' }}>{k}:</span>
                <span style={{ color: v === 'true' || v === 'granted' ? '#3fb950' : v === 'false' || v === 'denied' ? '#f85149' : '#e6edf3', fontWeight: 'bold' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={runDiagnostic}
        disabled={running}
        style={{ width: '100%', padding: '14px', background: running ? '#21262d' : '#1a73e8', color: running ? '#8b949e' : 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold', cursor: running ? 'not-allowed' : 'pointer', marginBottom: '16px' }}
      >
        {running ? '⏳ Diagnostic en cours...' : '▶ Lancer diagnostic FCM Web'}
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

      {/* Explication */}
      <div style={{ marginTop: '16px', padding: '12px', background: '#161b22', borderRadius: '8px', border: '1px solid #30363d', fontSize: '11px' }}>
        <p style={{ color: '#58a6ff', fontWeight: 'bold', marginBottom: '8px' }}>ℹ️ Architecture FCM pour APK Base44</p>
        <p style={{ color: '#8b949e', marginBottom: '4px' }}>L'APK Base44 charge l'app depuis un serveur distant → window.Capacitor n'est PAS injecté.</p>
        <p style={{ color: '#8b949e', marginBottom: '4px' }}>Solution : Firebase Web SDK + Service Worker = notifications identiques, sans Capacitor.</p>
        <p style={{ color: '#3fb950' }}>✅ App ouverte : onMessage Firebase</p>
        <p style={{ color: '#3fb950' }}>✅ App background/fermée : SW firebase-messaging-sw.js</p>
      </div>

      <p style={{ fontSize: '10px', color: '#8b949e', marginTop: '12px', textAlign: 'center' }}>
        /fcm-diagnostic — CDL v3 (Web SDK)
      </p>
    </div>
  );
}