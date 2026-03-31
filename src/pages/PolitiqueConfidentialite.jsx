import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PolitiqueConfidentialite() {
  const navigate = useNavigate();
  return (
    <div className="max-w-2xl mx-auto p-4 pb-16 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Politique de confidentialité</h1>
      </div>

      <p className="text-xs text-muted-foreground">Dernière mise à jour : 31 mars 2026</p>

      {[
        {
          title: "1. Collecte des données",
          content: `CDL (Centrale Des Livraisons) collecte les informations suivantes lors de votre inscription et utilisation de l'application :
• Nom complet, adresse e-mail
• Numéro de téléphone
• Photos de profil et documents d'identité (pour les livreurs uniquement)
• Position GPS (uniquement lorsque vous utilisez l'application et avec votre autorisation)
• Historique des commandes et livraisons`,
        },
        {
          title: "2. Utilisation des données",
          content: `Vos données sont utilisées pour :
• Créer et gérer votre compte
• Faciliter la mise en relation entre clients et livreurs
• Assurer le suivi en temps réel des livraisons
• Vous envoyer des notifications liées à vos commandes
• Améliorer la qualité de nos services
• Respecter nos obligations légales`,
        },
        {
          title: "3. Localisation (GPS)",
          content: `L'application CDL utilise votre position GPS uniquement dans les cas suivants :
• Pour les livreurs : afin de leur attribuer des courses à proximité et permettre le suivi en temps réel
• Pour les clients : pour identifier les livreurs disponibles dans leur zone
La localisation n'est jamais collectée en arrière-plan sans votre consentement explicite.`,
        },
        {
          title: "4. Partage des données",
          content: `Nous ne vendons ni ne louons vos données personnelles à des tiers. Vos informations peuvent être partagées uniquement :
• Avec les autres utilisateurs impliqués dans une transaction (ex : le livreur voit le quartier de livraison)
• Avec nos prestataires techniques (hébergement, notifications)
• Lorsque la loi l'exige`,
        },
        {
          title: "5. Conservation des données",
          content: `Vos données sont conservées tant que votre compte est actif. En cas de suppression de compte, vos données personnelles sont effacées sous 30 jours, à l'exception des données requises par la loi (historique des transactions).`,
        },
        {
          title: "6. Vos droits",
          content: `Conformément à la réglementation en vigueur, vous disposez des droits suivants :
• Droit d'accès à vos données
• Droit de rectification
• Droit à la suppression ("droit à l'oubli")
• Droit à la portabilité
Pour exercer ces droits, contactez-nous via WhatsApp ou à l'adresse indiquée dans les paramètres de l'application.`,
        },
        {
          title: "7. Sécurité",
          content: `CDL met en œuvre des mesures techniques et organisationnelles pour protéger vos données contre tout accès non autorisé, perte ou divulgation. Les données sensibles (documents d'identité) sont stockées de manière chiffrée.`,
        },
        {
          title: "8. Contact",
          content: `Pour toute question relative à la protection de vos données personnelles, contactez-nous via :
• WhatsApp : disponible dans l'application
• Email : support@cdl-livraison.com`,
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