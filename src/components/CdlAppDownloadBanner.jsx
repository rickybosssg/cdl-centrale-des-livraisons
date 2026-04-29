/**
 * CdlAppDownloadBanner — Bannière d'installation de l'app CDL
 * Détecte Android / iOS et adapte le message
 * Tente d'abord un deep link, sinon redirige vers le téléchargement
 */
import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";

const APP_URL = "https://cdl.base44.app";
const DEEP_LINK_SCHEME = "cdl://track/"; // scheme de l'app native

function detectPlatform() {
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return "other";
}

export default function CdlAppDownloadBanner({ courseId }) {
  const [platform, setPlatform] = useState("other");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    // Ne pas réafficher si l'utilisateur l'a déjà fermée dans cette session
    if (sessionStorage.getItem("cdl_banner_dismissed")) setDismissed(true);
  }, []);

  if (dismissed || platform === "other") return null;

  const handleDismiss = () => {
    sessionStorage.setItem("cdl_banner_dismissed", "1");
    setDismissed(true);
  };

  const handleAndroidClick = () => {
    // Tenter d'ouvrir l'app via deep link
    const deepLink = `${DEEP_LINK_SCHEME}${courseId}`;
    const fallback = `${APP_URL}/telecharger-app`;
    
    // Lance le deep link — si l'app n'est pas installée, on redirige vers le téléchargement
    const start = Date.now();
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = deepLink;
    document.body.appendChild(iframe);

    setTimeout(() => {
      document.body.removeChild(iframe);
      // Si la page est encore visible après 1.5s, l'app n'est probablement pas installée
      if (Date.now() - start < 2000) {
        window.location.href = fallback;
      }
    }, 1500);
  };

  const handleIosClick = () => {
    // Tenter d'abord le deep link universal link
    const deepLink = `${DEEP_LINK_SCHEME}${courseId}`;
    window.location.href = deepLink;
    // Fallback vers page info iOS
    setTimeout(() => {
      window.location.href = `${APP_URL}/telecharger-app`;
    }, 1500);
  };

  if (platform === "android") {
    return (
      <div className="flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-lg">
        <img
          src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg"
          alt="CDL"
          className="h-10 w-10 rounded-xl flex-shrink-0 object-cover"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight">Suivi en temps réel + notifications</p>
          <p className="text-xs text-gray-400">Téléchargez CDL pour Android</p>
        </div>
        <button
          onClick={handleAndroidClick}
          className="flex-shrink-0 flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-2 rounded-xl active:scale-95 transition-all"
        >
          <Download className="h-3.5 w-3.5" />
          Installer
        </button>
        <button onClick={handleDismiss} className="flex-shrink-0 p-1 text-gray-500 active:scale-90">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (platform === "ios") {
    return (
      <div className="flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-2xl shadow-lg">
        <img
          src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg"
          alt="CDL"
          className="h-10 w-10 rounded-xl flex-shrink-0 object-cover"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight">Suivi en temps réel + notifications</p>
          <p className="text-xs text-gray-400 leading-tight">iPhone — bientôt sur l'App Store</p>
        </div>
        <button
          onClick={handleIosClick}
          className="flex-shrink-0 text-xs font-bold px-3 py-2 rounded-xl bg-white/10 border border-white/20 active:scale-95 transition-all whitespace-nowrap"
        >
          En savoir +
        </button>
        <button onClick={handleDismiss} className="flex-shrink-0 p-1 text-gray-500 active:scale-90">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return null;
}