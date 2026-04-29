/**
 * DownloadApp — Page de téléchargement de l'APK CDL
 * Accessible publiquement via /telecharger-app
 */
import { useState, useEffect } from "react";
import { Download, Bell, MapPin, Zap, Shield, ChevronDown } from "lucide-react";

// URL directe vers l'APK CDL (à mettre à jour quand disponible)
const APK_URL = "https://drive.google.com/uc?export=download&id=1MZa0ck1igwUGfzlu1sCpMYj3vrqmVo5G";

function detectPlatform() {
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return "other";
}

const AVANTAGES = [
  { icon: MapPin,  text: "Suivi GPS en temps réel",       desc: "Voyez votre livreur se déplacer en direct" },
  { icon: Bell,    text: "Notifications instantanées",     desc: "Alertes dès que votre colis bouge" },
  { icon: Zap,     text: "Livraison rapide",               desc: "Livreur disponible en moins de 10 min" },
  { icon: Shield,  text: "Livreurs vérifiés",              desc: "Tous les livreurs sont contrôlés par CDL" },
];

export default function DownloadApp() {
  const [platform, setPlatform] = useState("other");
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  const handleDownload = () => {
    window.open(APK_URL, "_blank");
    setShowInstructions(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary via-blue-700 to-blue-900 flex flex-col">

      {/* Hero */}
      <div className="text-white text-center px-6 pt-12 pb-8 space-y-4">
        <img
          src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg"
          alt="CDL"
          className="h-24 w-24 rounded-3xl object-cover mx-auto shadow-2xl border-4 border-white/30"
        />
        <div>
          <h1 className="text-3xl font-extrabold">CDL</h1>
          <p className="text-white/80 text-sm font-medium">Centrale des Livraisons</p>
        </div>
        <p className="text-lg font-bold leading-snug">
          Téléchargez l'application CDL
        </p>
        <p className="text-white/70 text-sm">
          Suivez votre livraison en temps réel et recevez des notifications instantanées
        </p>
      </div>

      {/* Carte principale */}
      <div className="flex-1 bg-gray-50 rounded-t-3xl px-5 py-6 space-y-5">

        {/* Android */}
        {(platform === "android" || platform === "other") && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-green-100 flex items-center justify-center text-2xl flex-shrink-0">🤖</div>
              <div>
                <p className="font-bold text-gray-900">Application Android</p>
                <p className="text-xs text-gray-400">Version APK · Installation directe</p>
              </div>
            </div>

            <button
              onClick={handleDownload}
              className="w-full flex items-center justify-center gap-3 py-4 bg-green-500 hover:bg-green-600 text-white rounded-2xl font-extrabold text-base active:scale-95 transition-all shadow-md shadow-green-200"
            >
              <Download className="h-5 w-5" />
              Télécharger l'APK CDL
            </button>

            {/* Instructions installation */}
            <button
              onClick={() => setShowInstructions(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold"
            >
              <span>⚠️ Autoriser les sources inconnues ?</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showInstructions ? "rotate-180" : ""}`} />
            </button>

            {showInstructions && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2 text-sm text-amber-800">
                <p className="font-bold">Comment installer l'APK :</p>
                <ol className="space-y-1.5 list-decimal list-inside text-xs leading-relaxed">
                  <li>Téléchargez l'APK en appuyant sur le bouton ci-dessus</li>
                  <li>Ouvrez le fichier téléchargé depuis votre gestionnaire de fichiers</li>
                  <li>Si un avertissement apparaît, appuyez sur <strong>"Paramètres"</strong></li>
                  <li>Activez <strong>"Autoriser depuis cette source"</strong></li>
                  <li>Revenez en arrière et appuyez sur <strong>"Installer"</strong></li>
                  <li>L'application CDL est prête ! 🎉</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* iPhone */}
        {platform === "ios" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-gray-100 flex items-center justify-center text-2xl flex-shrink-0">🍎</div>
              <div>
                <p className="font-bold text-gray-900">Application iPhone</p>
                <p className="text-xs text-gray-400">App Store · Bientôt disponible</p>
              </div>
            </div>
            <div className="px-4 py-5 rounded-2xl bg-blue-50 border border-blue-200 text-center space-y-2">
              <p className="text-4xl">⏳</p>
              <p className="font-bold text-blue-800">La version iPhone arrive bientôt !</p>
              <p className="text-sm text-blue-600">Nous travaillons activement sur la version iOS. Elle sera disponible sur l'App Store très prochainement.</p>
            </div>
            <a
              href="https://cdl.base44.app"
              className="block w-full py-3 bg-primary text-white rounded-2xl font-bold text-center text-sm active:scale-95"
            >
              Utiliser CDL sur le navigateur →
            </a>
          </div>
        )}

        {/* Avantages */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Pourquoi télécharger l'app ?</p>
          <div className="space-y-3">
            {AVANTAGES.map(({ icon: Icon, text, desc }) => (
              <div key={text} className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">{text}</p>
                  <p className="text-xs text-gray-400">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA commander */}
        <a
          href="https://cdl.base44.app/commander"
          className="block w-full py-4 bg-primary text-white rounded-2xl font-extrabold text-center text-base active:scale-95 shadow-md shadow-primary/30"
        >
          🛵 Commander une course maintenant
        </a>

        <p className="text-[10px] text-gray-400 text-center pb-4">
          CDL — Centrale des Livraisons · Ouagadougou, Burkina Faso
        </p>
      </div>
    </div>
  );
}