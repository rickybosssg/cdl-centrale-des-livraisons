import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CGU() {
  const navigate = useNavigate();
  return (
    <div className="max-w-2xl mx-auto p-4 pb-16 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Conditions Générales d'Utilisation</h1>
      </div>

      <p className="text-xs text-muted-foreground">Dernière mise à jour : 31 mars 2026</p>

      {[
        {
          title: "1. Objet",
          content: `CDL – Centrale Des Livraisons est une plateforme de mise en relation entre expéditeurs (clients) et livreurs indépendants opérant à Ouagadougou, Burkina Faso. CDL agit uniquement en tant qu'intermédiaire et n'est pas partie aux contrats de livraison conclus entre clients et livreurs.`,
        },
        {
          title: "2. Inscription et compte",
          content: `L'utilisation de l'application nécessite la création d'un compte. Vous vous engagez à :
• Fournir des informations exactes et à jour
• Maintenir la confidentialité de vos identifiants
• Ne pas créer de faux comptes ou usurper l'identité d'autrui
CDL se réserve le droit de suspendre tout compte ne respectant pas ces conditions.`,
        },
        {
          title: "3. Responsabilité des livreurs",
          content: `Les livreurs sont des prestataires indépendants. En acceptant une course, le livreur reconnaît être entièrement responsable du colis qui lui est confié. CDL ne peut être tenu responsable en cas de :
• Perte, vol ou détérioration d'un colis
• Retard de livraison
• Tout incident survenant pendant la livraison
Le livreur s'engage à indemniser le client en cas de faute avérée.`,
        },
        {
          title: "4. Tarification",
          content: `Les prix des courses sont fixés par les clients. CDL prélève une commission sur chaque course réalisée. Les tarifs de commission sont communiqués au livreur lors de son inscription et peuvent évoluer avec préavis de 7 jours.`,
        },
        {
          title: "5. Comportement interdit",
          content: `Il est strictement interdit de :
• Transporter des marchandises illicites, dangereuses ou prohibées
• Harceler ou menacer d'autres utilisateurs
• Manipuler le système de courses ou de notation
• Contourner la plateforme pour effectuer des transactions directes après mise en relation via CDL
Toute violation entraîne la suspension immédiate et définitive du compte.`,
        },
        {
          title: "6. Partenaires",
          content: `Les partenaires (commerces) s'engagent à fournir des informations exactes sur leurs produits et services. CDL se réserve le droit de suspendre un partenaire en cas de non-conformité ou de non-paiement de l'abonnement.`,
        },
        {
          title: "7. Modifications",
          content: `CDL peut modifier les présentes CGU à tout moment. Les modifications entrent en vigueur dès leur publication dans l'application. La poursuite de l'utilisation de l'application vaut acceptation des nouvelles conditions.`,
        },
        {
          title: "8. Droit applicable",
          content: `Les présentes CGU sont soumises au droit burkinabè. Tout litige sera soumis aux juridictions compétentes de Ouagadougou, Burkina Faso.`,
        },
      ].map((section) => (
        <div key={section.title} className="space-y-2">
          <h2 className="font-semibold text-base">{section.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{section.content}</p>
        </div>
      ))}
    </div>
  );
}