import { useState } from "react";
import { Share2, Copy, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function PromoShare({ code, commercialEmail, commercialName }) {
  const promoLink = `https://cdl.base44.app/register?promo=${code}`;
  const whatsappMessage = `Salut 👋  
Je t'offre 15% de réduction sur ta première course avec CDL 🎁  

Inscris-toi ici :  
${promoLink}  

👉 Ton code promo : ${code}  

Avec CDL tu peux :  
📦 envoyer un colis  
🏍️ te déplacer facilement  
🛍️ accéder à plusieurs services  

💥 Crée ton compte et profite directement de la réduction`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(promoLink);
    toast.success("Lien copié dans le presse-papiers !");
  };

  const handleWhatsapp = () => {
    // Encode message for WhatsApp
    const encoded = encodeURIComponent(whatsappMessage);
    const whatsappUrl = `https://wa.me/?text=${encoded}`;
    window.open(whatsappUrl, "_blank");
    
    // Track usage
    fetch("/.base44/functions/trackPromoUsage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "share",
        code,
        commercial_email: commercialEmail,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {});
  };

  return (
    <div className="space-y-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
      <div className="flex items-center gap-2 mb-2">
        <Share2 className="h-4 w-4 text-blue-600" />
        <p className="text-sm font-semibold text-blue-700">Partager votre lien de parrainage</p>
      </div>

      {/* Code promo display */}
      <div className="p-3 rounded-lg bg-white border border-blue-200">
        <p className="text-xs text-muted-foreground mb-1">Votre lien personnalisé :</p>
        <p className="text-xs font-mono break-all text-foreground">{promoLink}</p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1 gap-1.5 border-blue-300 text-blue-600 hover:bg-blue-50"
          onClick={handleCopyLink}
        >
          <Copy className="h-4 w-4" />
          <span className="hidden sm:inline">Copier lien</span>
          <span className="sm:hidden">Copier</span>
        </Button>
        <Button
          className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700"
          onClick={handleWhatsapp}
        >
          <MessageCircle className="h-4 w-4" />
          <span className="hidden sm:inline">Envoyer sur WhatsApp</span>
          <span className="sm:hidden">WhatsApp</span>
        </Button>
      </div>

      {/* Info message */}
      <p className="text-xs text-blue-700 leading-relaxed">
        ✨ Les utilisateurs qui s'inscrivent via votre lien bénéficient automatiquement de <strong>15% de réduction</strong> sur leur première course.
      </p>
    </div>
  );
}