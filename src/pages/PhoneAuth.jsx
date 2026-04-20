import { useEffect } from "react";
import { base44 } from "@/api/base44Client";

export default function PhoneAuth() {
  useEffect(() => {
    base44.auth.redirectToLogin(window.location.origin + '/');
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary to-blue-700 flex flex-col items-center justify-center">
      <img
        src="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/1eb51398f_Screenshot_20260330_132434_WhatsApp.jpg"
        alt="CDL"
        className="h-20 w-20 rounded-2xl object-cover shadow-lg mb-6"
      />
      <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      <p className="text-white/80 text-sm mt-4">Redirection vers la connexion...</p>
    </div>
  );
}