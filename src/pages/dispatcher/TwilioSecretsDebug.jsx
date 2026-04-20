import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export default function TwilioSecretsDebug() {
  const [secrets, setSecrets] = useState({
    accountSid: "???",
    authToken: "???",
    verifySid: "???",
  });

  const [appId, setAppId] = useState("???");
  const [testResult, setTestResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Récupérer appId via une fonction backend
    testSecrets();
  }, []);

  const testSecrets = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/functions/checkTwilioSecrets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      console.log("Secrets check:", data);

      setSecrets({
        accountSid: data.accountSid ? "✅ Défini" : "❌ MANQUANT",
        authToken: data.authToken ? "✅ Défini" : "❌ MANQUANT",
        verifySid: data.verifySid ? "✅ Défini" : "❌ MANQUANT",
      });

      setAppId(data.appId || "???");
      setTestResult(data);
    } catch (err) {
      console.error("Error:", err);
      setTestResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">🔑 Twilio Secrets Debug</h1>
          <p className="text-slate-600 mb-6">Vérifier que les secrets Twilio sont correctement définis</p>

          {/* APPID */}
          <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <h2 className="font-semibold text-slate-900 mb-2">📱 App ID</h2>
            <code className="text-sm text-slate-700 font-mono">{appId}</code>
          </div>

          {/* SECRETS STATUS */}
          <div className="space-y-3 mb-6">
            <h2 className="font-semibold text-slate-900">🔐 Status des Secrets</h2>

            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded border border-slate-200">
              <div className={secrets.accountSid.includes("✅") ? "text-green-600" : "text-red-600"}>
                {secrets.accountSid.includes("✅") ? <CheckCircle2 /> : <AlertCircle />}
              </div>
              <div>
                <p className="font-medium text-slate-900">TWILIO_ACCOUNT_SID</p>
                <p className="text-sm text-slate-600">{secrets.accountSid}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded border border-slate-200">
              <div className={secrets.authToken.includes("✅") ? "text-green-600" : "text-red-600"}>
                {secrets.authToken.includes("✅") ? <CheckCircle2 /> : <AlertCircle />}
              </div>
              <div>
                <p className="font-medium text-slate-900">TWILIO_AUTH_TOKEN</p>
                <p className="text-sm text-slate-600">{secrets.authToken}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded border border-slate-200">
              <div className={secrets.verifySid.includes("✅") ? "text-green-600" : "text-red-600"}>
                {secrets.verifySid.includes("✅") ? <CheckCircle2 /> : <AlertCircle />}
              </div>
              <div>
                <p className="font-medium text-slate-900">TWILIO_VERIFY_SERVICE_SID</p>
                <p className="text-sm text-slate-600">{secrets.verifySid}</p>
              </div>
            </div>
          </div>

          {/* TEST RESULT */}
          {testResult && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h2 className="font-semibold text-blue-900 mb-3">📊 Résultat Test</h2>
              <pre className="text-sm text-blue-800 overflow-auto max-h-48 bg-white p-3 rounded border border-blue-100">
                {JSON.stringify(testResult, null, 2)}
              </pre>
            </div>
          )}

          {/* ACTIONS */}
          <div className="mt-6 flex gap-3">
            <button
              onClick={testSecrets}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Vérification..." : "🔄 Vérifier secrets"}
            </button>

            <a
              href="/phone-auth"
              className="px-4 py-2 bg-slate-600 text-white font-semibold rounded-lg hover:bg-slate-700"
            >
              → Aller à PhoneAuth
            </a>
          </div>

          {/* TROUBLESHOOTING */}
          <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <h3 className="font-semibold text-amber-900 mb-2">⚠️ Troubleshooting</h3>
            <ul className="text-sm text-amber-800 space-y-1">
              <li>❌ MANQUANT → Aller au dashboard → Settings → Secrets → Ajouter</li>
              <li>✅ Tous définis → Aller à /phone-auth → Tester sendOTP</li>
              <li>Erreur Twilio → Vérifier la clé est correcte (copier-coller)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}