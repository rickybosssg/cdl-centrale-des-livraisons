import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { appParams } from "@/lib/app-params";

export default function AppPublicLink() {
  const [copied, setCopied] = useState(false);
  const [publicUrl, setPublicUrl] = useState("");

  useEffect(() => {
    // Déterminer le sous-domaine public
    if (typeof window !== "undefined") {
      const hostname = window.location.hostname;
      const isLocalDev = hostname.includes("localhost") || hostname.includes("127.0.0.1");
      
      let url = "";
      if (isLocalDev) {
        // En dev local: utiliser le localhost courant
        url = `${window.location.protocol}//${hostname}:${window.location.port || 5173}`;
      } else if (hostname.includes("base44.app")) {
        // En production: extraire le sous-domaine
        const subdomain = hostname.split(".")[0];
        url = `https://${subdomain}.base44.app`;
      } else {
        // Fallback: utiliser l'URL courante
        url = `${window.location.protocol}//${hostname}`;
      }
      
      setPublicUrl(url);
      console.log("[AppPublicLink] Subdomain URL:", url);
    }
  }, []);

  const copyToClipboard = () => {
    navigator.clipboard?.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-blue-900">🚀 CDL Public URL</h1>
          <p className="text-blue-700">Lien public exact de l'application CDL</p>
        </div>

        {/* Public URL Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Sous-domaine Public</h2>
          
          <div className="relative">
            <input
              type="text"
              readOnly
              value={publicUrl}
              className="w-full px-4 py-3 border-2 border-blue-300 rounded-lg bg-blue-50 font-mono text-blue-900 font-bold text-lg"
            />
            <button
              onClick={copyToClipboard}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 hover:bg-blue-100 rounded-lg transition-colors"
              title="Copier"
            >
              {copied ? (
                <Check className="h-5 w-5 text-green-600" />
              ) : (
                <Copy className="h-5 w-5 text-blue-600" />
              )}
            </button>
          </div>

          {copied && (
            <p className="text-sm text-green-600 font-medium">✅ Copié !</p>
          )}
        </div>

        {/* App Details */}
        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Détails App</h2>
          
          <div className="grid grid-cols-1 gap-3">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 font-semibold mb-1">App ID</p>
              <code className="text-sm text-gray-900 font-mono">{appParams.appId}</code>
            </div>
            
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 font-semibold mb-1">Base URL (env)</p>
              <code className="text-sm text-gray-900 font-mono break-all">
                {appParams.appBaseUrl || "non défini"}
              </code>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 font-semibold mb-1">Hostname courant</p>
              <code className="text-sm text-gray-900 font-mono">
                {typeof window !== "undefined" ? window.location.hostname : "N/A"}
              </code>
            </div>
          </div>
        </div>

        {/* Info Tests */}
        <div className="bg-blue-50 rounded-2xl shadow-xl p-8 border-2 border-blue-200 space-y-4">
          <h2 className="text-lg font-semibold text-blue-900">🧪 Pour Tester</h2>
          
          <ol className="space-y-2 text-blue-800 ml-4 list-decimal">
            <li><strong>Copier le lien public</strong> ci-dessus</li>
            <li><strong>Ouvrir dans le navigateur</strong></li>
            <li><strong>Aller à `/phone-auth`</strong></li>
            <li><strong>Cliquer "🧪 Tester sendOTP"</strong></li>
            <li>
              <strong>Vérifier:</strong>
              <ul className="mt-1 ml-4 space-y-1 list-disc">
                <li>✅ Pas d'erreur 403 "Platform domain"</li>
                <li>✅ sendOTP appelé depuis le bon sous-domaine</li>
                <li>✅ Erreur Twilio affichée clairement</li>
              </ul>
            </li>
          </ol>
        </div>

        {/* Navigation */}
        <div className="text-center space-y-3">
          <a
            href="/phone-auth"
            className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            → Aller à Phone Auth
          </a>
        </div>
      </div>
    </div>
  );
}