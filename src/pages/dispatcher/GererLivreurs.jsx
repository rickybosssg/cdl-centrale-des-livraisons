import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, CheckCircle2, XCircle, MapPin, Phone, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export default function GererLivreurs() {
  const navigate = useNavigate();
  const [livreurs, setLivreurs] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadLivreurs = async () => {
    const data = await base44.entities.User.filter({ role: "livreur" });
    setLivreurs(data);
    setLoading(false);
  };

  useEffect(() => { loadLivreurs(); }, []);

  const toggleVerified = async (livreur) => {
    await base44.entities.User.update(livreur.id, { verified: !livreur.verified });
    loadLivreurs();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Gérer les livreurs</h1>
      </div>

      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>{livreurs.length} livreurs</span>
        <span>•</span>
        <span className="text-green-600">{livreurs.filter(l => l.disponible).length} en ligne</span>
        <span>•</span>
        <span className="text-primary">{livreurs.filter(l => l.verified).length} vérifiés</span>
      </div>

      <div className="space-y-3">
        {livreurs.map((livreur) => (
          <Card key={livreur.id}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="relative">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                    {livreur.full_name?.charAt(0) || "?"}
                  </div>
                  <div className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card ${
                    livreur.disponible ? "bg-green-500" : "bg-muted-foreground"
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold truncate">{livreur.full_name}</p>
                    {livreur.verified && (
                      <Shield className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <MapPin className="h-3 w-3" />
                    <span>{livreur.quartier || "Non défini"}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    <span>{livreur.telephone || "Non défini"}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Vérifié</span>
                    <Switch
                      checked={livreur.verified || false}
                      onCheckedChange={() => toggleVerified(livreur)}
                    />
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    livreur.disponible
                      ? "bg-green-100 text-green-700"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {livreur.disponible ? "En ligne" : "Hors ligne"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {livreurs.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-sm">Aucun livreur inscrit</p>
          </div>
        )}
      </div>
    </div>
  );
}