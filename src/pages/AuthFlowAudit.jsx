/**
 * /auth-flow-audit — Page de test et diagnostic du flow inscription CDL
 * Route : /auth-flow-audit
 */
import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, XCircle, Loader2, Play, Trash2 } from "lucide-react";

const APP_ID = import.meta.env?.VITE_BASE44_APP_ID || "69c3c74fc4b62396dca61751";
const AUTH_BASE = `https://app.base44.com/api/apps/${APP_ID}/auth`;

function LogLine({ log }) {
  const color = log.level === "error" ? "#EF4444" : log.level === "success" ? "#22C55E" : log.level === "warn" ? "#F59E0B" : "#94A3B8";
  return (
    <div style={{ fontFamily: "monospace", fontSize: "11px", color, padding: "2px 0", borderBottom: "1px solid #1e293b" }}>
      <span style={{ color: "#475569", marginRight: "8px" }}>{log.ts}</span>{log.msg}
    </div>
  );
}

function TestRow({ label, status, detail }) {
  const icon = status === "ok"      ? <CheckCircle2 size={16} style={{ color: "#22C55E", flexShrink: 0 }} /> :
               status === "fail"    ? <XCircle      size={16} style={{ color: "#EF4444", flexShrink: 0 }} /> :
               status === "running" ? <Loader2      size={16} style={{ color: "#60A5FA", flexShrink: 0, animation: "spin 1s linear infinite" }} /> :
               <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid #475569", flexShrink: 0 }} />;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "8px 0", borderBottom: "1px solid #1e293b" }}>
      <div style={{ marginTop: 2 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: "13px", fontWeight: "600", color: "#f1f5f9" }}>{label}</p>
        {detail && <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#64748b", wordBreak: "break-all" }}>{detail}</p>}
      </div>
    </div>
  );
}

export default function AuthFlowAudit() {
  const [logs, setLogs] = useState([]);
  const [tests, setTests] = useState([]);
  const [running, setRunning] = useState(false);
  const testEmail = useRef(`audit_${Date.now()}@cdl-test.com`).current;
  const testPassword = "Test@1234!";
  const logsRef = useRef(null);

  const addLog = (msg, level = "info") => {
    const ts = new Date().toISOString().slice(11, 23);
    setLogs(prev => {
      const next = [...prev, { ts, msg, level }];
      setTimeout(() => logsRef.current?.scrollTo(0, logsRef.current.scrollHeight), 50);
      return next;
    });
  };

  const setTest = (id, status, detail = "") =>
    setTests(prev => prev.find(t => t.id === id)
      ? prev.map(t => t.id === id ? { ...t, status, detail } : t)
      : [...prev, { id, status, detail }]);

  const runAudit = async () => {
    setLogs([]); setTests([]); setRunning(true);
    const t0 = Date.now();
    addLog("═══ AUTH FLOW AUDIT CDL ═══");

    // 1 — Validation email format
    setTest("1. Validation email", "running");
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail);
    addLog(`[SIGNUP_VALIDATION] email=${testEmail} valid=${emailOk}`, emailOk ? "success" : "error");
    setTest("1. Validation email", emailOk ? "ok" : "fail", testEmail);

    // 2 — Réseau
    setTest("2. Connectivité réseau", "running");
    const online = navigator.onLine;
    addLog(`[SIGNUP_NETWORK] navigator.onLine=${online}`, online ? "success" : "warn");
    setTest("2. Connectivité réseau", online ? "ok" : "fail", `navigator.onLine=${online}`);

    // 3 — API /register
    setTest("3. API /register (création compte)", "running");
    let token = null;
    try {
      addLog(`[SIGNUP_API_CALL] POST ${AUTH_BASE}/register | email=${testEmail}`);
      const res = await fetch(`${AUTH_BASE}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail, password: testPassword, full_name: "Audit Test CDL" }),
      });
      const data = await res.json().catch(() => ({}));
      token = data?.access_token || data?.token;
      addLog(`[SIGNUP_API_RESPONSE] status=${res.status} | token=${!!token} | error=${data?.error || "none"}`, res.ok ? "success" : "error");
      setTest("3. API /register (création compte)", res.ok ? "ok" : "fail",
        `status=${res.status} | token=${token ? "✅ reçu" : "❌ absent"} | erreur=${data?.error || "—"}`);
    } catch (e) {
      addLog(`[SIGNUP_ERROR] Exception: ${e.message}`, "error");
      setTest("3. API /register (création compte)", "fail", e.message);
    }

    // 4 — localStorage write/read
    setTest("4. localStorage (token)", "running");
    if (token) {
      try {
        localStorage.setItem("_cdl_audit_tk", token);
        const ok = localStorage.getItem("_cdl_audit_tk") === token;
        localStorage.removeItem("_cdl_audit_tk");
        addLog(`[SIGNUP_TOKEN] localStorage: ${ok ? "OK" : "FAIL"}`, ok ? "success" : "error");
        setTest("4. localStorage (token)", ok ? "ok" : "fail", `${token.slice(0, 20)}...`);
      } catch (e) { setTest("4. localStorage (token)", "fail", e.message); }
    } else {
      setTest("4. localStorage (token)", "fail", "Pas de token — étape 3 échouée");
    }

    // 5 — User en BDD (/auth/me avec le nouveau token)
    setTest("5. User créé en BDD (/auth/me)", "running");
    if (token) {
      try {
        const meRes = await fetch(`https://app.base44.com/api/apps/${APP_ID}/auth/me`, {
          headers: { "Authorization": `Bearer ${token}` },
        });
        const meData = await meRes.json().catch(() => ({}));
        const userId = meData?.id;
        addLog(`[SIGNUP_DB] /auth/me status=${meRes.status} | userId=${userId || "—"}`, meRes.ok && userId ? "success" : "error");
        setTest("5. User créé en BDD (/auth/me)", meRes.ok && userId ? "ok" : "fail",
          `userId=${userId || "non créé"} | email=${meData?.email || "—"}`);
      } catch (e) { setTest("5. User créé en BDD (/auth/me)", "fail", e.message); }
    } else { setTest("5. User créé en BDD (/auth/me)", "fail", "Skip — pas de token"); }

    // 6 — base44.auth.isAuthenticated (session courante)
    setTest("6. Session SDK (base44.auth)", "running");
    try {
      const isAuth = await base44.auth.isAuthenticated();
      addLog(`[SIGNUP_SESSION] isAuthenticated=${isAuth}`);
      setTest("6. Session SDK (base44.auth)", "ok", `isAuthenticated=${isAuth}`);
    } catch (e) { setTest("6. Session SDK (base44.auth)", "fail", e.message); }

    // 7 — Token session stocké
    setTest("7. Token session active (localStorage)", "running");
    const storedTk = localStorage.getItem("base44_access_token");
    const hasTk = !!storedTk && storedTk.length > 20;
    addLog(`[SIGNUP_SESSION] token courant: ${hasTk ? storedTk.slice(0, 16) + "..." : "ABSENT"}`, hasTk ? "success" : "warn");
    setTest("7. Token session active (localStorage)", hasTk ? "ok" : "fail",
      hasTk ? `${storedTk.slice(0, 20)}...` : "Aucun token — non connecté");

    // 8 — HTML5 History API
    setTest("8. Navigation (HTML5 pushState)", "running");
    const hasHistory = !!window.history?.pushState;
    addLog(`[SIGNUP_NAV] pushState=${hasHistory}`, hasHistory ? "success" : "error");
    setTest("8. Navigation (HTML5 pushState)", hasHistory ? "ok" : "fail", `available=${hasHistory}`);

    addLog(`═══ AUDIT TERMINÉ en ${Date.now() - t0}ms ═══`, "success");
    setRunning(false);
  };

  const allOk = tests.length > 0 && tests.every(t => t.status === "ok");
  const hasErrors = tests.some(t => t.status === "fail");

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", color: "white", padding: "24px 16px", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ maxWidth: "600px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "22px", fontWeight: "800", margin: "0 0 4px" }}>🔬 Auth Flow Audit CDL</h1>
        <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 16px" }}>Diagnostic inscription — {new Date().toLocaleDateString()}</p>

        <div style={{ background: "#1e293b", borderRadius: "12px", padding: "12px 14px", marginBottom: "16px", fontSize: "11px", color: "#94a3b8", fontFamily: "monospace", lineHeight: "1.9" }}>
          <div>Email test : <span style={{ color: "#60a5fa" }}>{testEmail}</span></div>
          <div>Mot de passe : <span style={{ color: "#60a5fa" }}>{testPassword}</span></div>
          <div>APP_ID : <span style={{ color: "#60a5fa" }}>{APP_ID}</span></div>
          <div>AUTH_BASE : <span style={{ color: "#60a5fa" }}>{AUTH_BASE}</span></div>
        </div>

        <button onClick={runAudit} disabled={running}
          style={{ width: "100%", height: "52px", background: running ? "#334155" : "linear-gradient(135deg,#1E6BFF,#1558D6)", color: "white", border: "none", borderRadius: "14px", fontWeight: "800", fontSize: "15px", cursor: running ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "20px" }}>
          {running ? <><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Audit en cours...</> : <><Play size={18} /> Lancer l'audit</>}
        </button>

        {tests.length > 0 && !running && (
          <div style={{ background: allOk ? "#14532d" : hasErrors ? "#450a0a" : "#172554", border: `1.5px solid ${allOk ? "#22c55e" : hasErrors ? "#ef4444" : "#3b82f6"}`, borderRadius: "12px", padding: "12px 16px", marginBottom: "16px", textAlign: "center", fontSize: "15px", fontWeight: "800", color: allOk ? "#4ade80" : hasErrors ? "#f87171" : "#93c5fd" }}>
            {allOk ? "✅ Tous les tests OK — Inscription opérationnelle" : hasErrors ? "❌ Erreurs détectées — voir détails" : "⚠️ Partiel"}
          </div>
        )}

        {tests.length > 0 && (
          <div style={{ background: "#1e293b", borderRadius: "12px", padding: "16px", marginBottom: "16px" }}>
            <p style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Résultats des tests</p>
            {tests.map(t => <TestRow key={t.id} label={t.id} status={t.status} detail={t.detail} />)}
          </div>
        )}

        {logs.length > 0 && (
          <div style={{ background: "#020617", border: "1px solid #1e293b", borderRadius: "12px", overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase" }}>Console ({logs.length} lignes)</span>
              <button onClick={() => setLogs([])} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontSize: "11px" }}>
                <Trash2 size={12} /> Vider
              </button>
            </div>
            <div ref={logsRef} style={{ height: "260px", overflowY: "auto", padding: "8px 12px" }}>
              {logs.map((l, i) => <LogLine key={i} log={l} />)}
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}