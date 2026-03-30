import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";

const PROFIL_LABELS = {
  livreur: { emoji: "🛵", label: "Livreur", color: "bg-blue-50 border-blue-200 text-blue-800" },
  partenaire: { emoji: "🏪", label: "Partenaire", color: "bg-orange-50 border-orange-200 text-orange-800" },
  commercial: { emoji: "📣", label: "Commercial", color: "bg-purple-50 border-purple-200 text-purple-800" },
};

export default function AttentePage({ profile, isBlocked = false, blockReason = "" }) {
  const info = PROFIL_LABELS[profile] || { emoji: "⏳", label: profile, color: "bg-gray-50 border-gray-200 text-gray-800" };

  const handleLogout = () => base44.auth.logout(window.location.href);

  if (isBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="text-6xl">🚫</div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-red-600">Compte bloqué</h2>
            <p className="text-sm text-muted-foreground">
              Votre compte a été suspendu par l'administration CDL.
            </p>
            {blockReason && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-left">
                <p className="text-xs font-semibold text-red-700">Motif :</p>
                <p className="text-sm text-red-600">{blockReason}</p>
              </div>
            )}
          </div>
          <div className="p-4 rounded-xl bg-gray-50 border text-sm text-muted-foreground space-y-1">
            <p className="font-medium">Besoin d'aide ?</p>
            <p>Contactez-nous via WhatsApp :</p>
            <a
              href="https://wa.me/22600000000"
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-600 font-semibold underline"
            >
              WhatsApp CDL Support
            </a>
          </div>
          <Button variant="outline" className="w-full" onClick={handleLogout}>
            Se déconnecter
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="relative">
          <div className="text-6xl">{info.emoji}</div>
          <div className="absolute -top-1 -right-1 w-6 h-6 bg-amber-400 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">⏳</span>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold">Demande en cours</h2>
          <p className="text-sm text-muted-foreground">
            Votre compte <strong>{info.label}</strong> est en attente de validation par l'équipe CDL.
          </p>
        </div>

        <div className={`p-4 rounded-xl border text-left space-y-2 ${info.color}`}>
          <p className="text-sm font-semibold">📋 Ce qui se passe maintenant :</p>
          <ul className="text-xs space-y-1 list-disc list-inside opacity-90">
            <li>Notre équipe examine votre dossier</li>
            <li>Vous serez notifié par email ou WhatsApp</li>
            <li>Délai habituel : 24 à 48h</li>
          </ul>
        </div>

        <div className="p-4 rounded-xl bg-gray-50 border text-sm text-muted-foreground space-y-1">
          <p className="font-medium">Une question ?</p>
          <a
            href="https://wa.me/22600000000"
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-600 font-semibold underline text-sm"
          >
            💬 Contacter CDL sur WhatsApp
          </a>
        </div>

        <Button variant="outline" className="w-full" onClick={handleLogout}>
          Se déconnecter
        </Button>
      </div>
    </div>
  );
}