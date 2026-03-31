import { Button } from "@/components/ui/button";

export default function LivreurBienvenue({ onContinuer }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-5 bg-gradient-to-br from-primary to-blue-700">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-primary to-blue-700 p-6 text-white text-center space-y-2">
          <div className="text-5xl">🛵</div>
          <h1 className="text-xl font-bold">Compte créé avec succès !</h1>
          <p className="text-sm text-white/80">Bienvenue chez CDL</p>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="p-4 rounded-2xl bg-green-50 border border-green-200">
            <p className="text-sm text-green-800 font-medium leading-relaxed">
              ✅ Votre compte a bien été créé.
            </p>
          </div>

          <p className="text-sm text-foreground leading-relaxed">
            Pour devenir <strong>livreur actif sur CDL</strong>, vous devez maintenant compléter votre dossier de validation en envoyant les documents demandés :
          </p>

          <ul className="space-y-2 text-sm text-foreground">
            {[
              { emoji: "🤳", label: "Selfie (photo de vous)" },
              { emoji: "🪪", label: "CNI recto" },
              { emoji: "🪪", label: "CNI verso" },
              { emoji: "🛵", label: "Photo du moyen de déplacement" },
            ].map(d => (
              <li key={d.label} className="flex items-center gap-3 p-2 rounded-lg bg-muted">
                <span className="text-xl">{d.emoji}</span>
                <span className="font-medium">{d.label}</span>
              </li>
            ))}
          </ul>

          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 leading-relaxed">
            ⚠️ <strong>Tant que votre dossier n'est pas validé</strong> par l'administrateur, votre compte livreur restera en attente et vous ne pourrez pas encore recevoir de courses.
          </div>

          <Button
            className="w-full h-12 text-base font-semibold"
            onClick={onContinuer}
          >
            Continuer — Envoyer mes documents →
          </Button>
        </div>
      </div>
    </div>
  );
}