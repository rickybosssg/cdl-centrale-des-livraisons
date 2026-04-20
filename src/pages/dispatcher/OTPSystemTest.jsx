import { useState } from "react";
import { appParams } from "@/lib/app-params";
import { Loader2 } from "lucide-react";

export default function OTPSystemTest() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const log = (title, data) => {
    setResults((prev) => [...prev, { title, data, time: new Date().toLocaleTimeString() }]);
  };

  const runTests = async () => {
    setResults([]);
    setLoading(true);

    const appId = appParams.appId;
    const tests = [];

    // ═══════════════════════════════════════════════════════════════
    // TEST 1 : sendOTP +22655738247
    // ═══════════════════════════════════════════════════════════════
    log("TEST 1", "🧪 Envoi OTP vers +22655738247 (ADMIN)");
    try {
      const res = await fetch(`/api/apps/${appId}/functions/sendOTP`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "+22655738247" }),
      });
      const data = await res.json();
      log("TEST 1 RESULT", {
        status: res.status,
        success: data.success,
        error: data.error,
        message: data.message,
        full: data,
      });
      tests.push({
        name: "sendOTP Admin",
        result: data.success ? "✅ PASS" : "❌ FAIL",
        data,
      });
    } catch (err) {
      log("TEST 1 ERROR", { error: err.message });
      tests.push({ name: "sendOTP Admin", result: "❌ EXCEPTION", error: err.message });
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 2 : sendOTP valid test user
    // ═══════════════════════════════════════════════════════════════
    log("TEST 2", "🧪 Envoi OTP vers +22612345678 (TEST USER)");
    try {
      const res = await fetch(`/api/apps/${appId}/functions/sendOTP`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "+22612345678" }),
      });
      const data = await res.json();
      log("TEST 2 RESULT", {
        status: res.status,
        success: data.success,
        error: data.error,
        message: data.message,
      });
      tests.push({
        name: "sendOTP Test User",
        result: data.success ? "✅ PASS" : "❌ FAIL",
        data,
      });
    } catch (err) {
      log("TEST 2 ERROR", { error: err.message });
      tests.push({
        name: "sendOTP Test User",
        result: "❌ EXCEPTION",
        error: err.message,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 3 : sendOTP invalid format
    // ═══════════════════════════════════════════════════════════════
    log("TEST 3", "🧪 Envoi OTP vers +999999999 (INVALID FORMAT)");
    try {
      const res = await fetch(`/api/apps/${appId}/functions/sendOTP`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "+999999999" }),
      });
      const data = await res.json();
      log("TEST 3 RESULT", {
        status: res.status,
        success: data.success,
        error: data.error,
      });
      tests.push({
        name: "sendOTP Invalid Format",
        result: !data.success ? "✅ PASS (correctly rejected)" : "❌ FAIL",
        data,
      });
    } catch (err) {
      log("TEST 3 ERROR", { error: err.message });
      tests.push({
        name: "sendOTP Invalid Format",
        result: "❌ EXCEPTION",
        error: err.message,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // TEST 4 : Verify with test code (expected to fail — no real OTP)
    // ═══════════════════════════════════════════════════════════════
    log("TEST 4", "🧪 Verify OTP +22655738247 with dummy code 000000");
    try {
      const res = await fetch(`/api/apps/${appId}/functions/verifyOTPWithRedirect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "+22655738247", code: "000000" }),
      });
      const data = await res.json();
      log("TEST 4 RESULT", {
        status: res.status,
        success: data.success,
        error: data.error,
        expected: "should fail (invalid code)",
        full: data,
      });
      tests.push({
        name: "Verify Invalid Code",
        result: !data.success ? "✅ PASS (correctly rejected)" : "❌ FAIL",
        data,
      });
    } catch (err) {
      log("TEST 4 ERROR", { error: err.message });
      tests.push({
        name: "Verify Invalid Code",
        result: "❌ EXCEPTION",
        error: err.message,
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════════
    log("SUMMARY", {
      totalTests: tests.length,
      testResults: tests.map((t) => `${t.name}: ${t.result}`),
    });

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">🧪 OTP System Test</h1>
          <p className="text-slate-600 mb-6">
            Test complète du système d'authentification par OTP CDL
          </p>

          <button
            onClick={runTests}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Tests en cours..." : "Lancer tous les tests"}
          </button>

          <div className="mt-8 space-y-4">
            {results.map((r, i) => (
              <div key={i} className="border-l-4 border-blue-500 bg-slate-50 p-4 rounded">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-slate-900">{r.title}</h3>
                  <span className="text-xs text-slate-500">{r.time}</span>
                </div>
                <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-auto max-h-48">
                  {JSON.stringify(r.data, null, 2)}
                </pre>
              </div>
            ))}
          </div>

          {results.length > 0 && (
            <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h3 className="font-semibold text-blue-900 mb-2">📋 Résumé des tests</h3>
              <div className="space-y-1 text-sm text-blue-800">
                {results
                  .filter((r) => r.title.includes("RESULT") || r.title === "SUMMARY")
                  .map((r, i) => (
                    <div key={i}>{JSON.stringify(r.data)}</div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}