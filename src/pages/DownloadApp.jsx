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
          src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/1eb51398f_Screenshot_20260330_132434_WhatsApp.jpg"
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

        {/* Section contact WhatsApp */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div className="space-y-1">
            <p className="font-bold text-gray-900 text-base">Besoin d'aide ?</p>
            <p className="text-sm text-gray-500">Contactez CDL directement sur WhatsApp</p>
          </div>
          <a
            href="https://wa.me/22666925190"
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center justify-center gap-3 py-4 bg-green-500 hover:bg-green-600 text-white rounded-2xl font-extrabold text-base active:scale-95 transition-all shadow-md shadow-green-200"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Contacter CDL sur WhatsApp
          </a>
        </div>

        <p className="text-[10px] text-gray-400 text-center pb-4">
          CDL — Centrale des Livraisons · Ouagadougou, Burkina Faso
        </p>
      </div>
    </div>
  );
}