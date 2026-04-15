import { Phone, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * ContactCard — Carte de contact style Uber
 * Affiche nom, téléphone, statut + boutons appel/WhatsApp
 */
export default function ContactCard({ 
  name, 
  phone, 
  status, 
  avatar = null,
  className = "" 
}) {
  // Validation téléphone
  const hasValidPhone = phone && phone.trim().length > 0;
  
  // Formater le téléphone pour l'appel (nettoyer les caractères spéciaux)
  const cleanPhone = phone?.replace(/[^\d+]/g, "") || "";
  const whatsappPhone = cleanPhone.replace(/^\+/, "") || "";

  const handleCall = () => {
    if (!hasValidPhone) {
      alert("Numéro non disponible");
      return;
    }
    // Ouvrir l'appel téléphone
    window.location.href = `tel:${cleanPhone}`;
  };

  const handleWhatsApp = () => {
    if (!hasValidPhone) {
      alert("Numéro non disponible");
      return;
    }
    // Ouvrir WhatsApp
    window.open(`https://wa.me/${whatsappPhone}`, "_blank");
  };

  return (
    <div className={`rounded-2xl border border-border bg-white shadow-sm p-4 space-y-3 ${className}`}>
      {/* En-tête: Avatar + Infos */}
      <div className="flex items-center gap-3">
        {/* Avatar */}
        {avatar ? (
          <img 
            src={avatar} 
            alt={name} 
            className="h-12 w-12 rounded-full object-cover border border-border" 
          />
        ) : (
          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            {name?.charAt(0)?.toUpperCase() || "?"}
          </div>
        )}

        {/* Nom et statut */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-foreground truncate">{name || "Utilisateur"}</p>
          {status && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-muted-foreground">{status}</span>
            </div>
          )}
          {hasValidPhone && (
            <p className="text-xs text-muted-foreground mt-0.5">{phone}</p>
          )}
        </div>
      </div>

      {/* Boutons d'action */}
      <div className="flex gap-2 pt-2 border-t border-border/50">
        <Button
          size="sm"
          onClick={handleCall}
          disabled={!hasValidPhone}
          className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold h-10"
        >
          <Phone className="h-4 w-4" />
          Appeler
        </Button>
        <Button
          size="sm"
          onClick={handleWhatsApp}
          disabled={!hasValidPhone}
          className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold h-10"
        >
          <MessageCircle className="h-4 w-4" />
          WhatsApp
        </Button>
      </div>

      {/* Alerte si téléphone manquant */}
      {!hasValidPhone && (
        <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-[10px] text-amber-700 font-medium">📱 Numéro non disponible</p>
        </div>
      )}
    </div>
  );
}