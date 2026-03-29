import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function EffectuerDeplacement() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  
  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);
  const [step, setStep] = useState(1);
  const [moyenDeplacement, setMoyenDeplacement] = useState(null);
  const [urgence, setUrgence] = useState("normal");
  const [prix, setPrix] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [quartier_depart, setQuartierDepart] = useState("");
  const [quartier_arrivee, setQuartierArrivee] = useState("");

  const searchAndAssignLivreur = async (courseData) => {
    // Chercher un livreur disponible avec le mode de transport sélectionné
    const livreurs = await base44.entities.User.filter({ 
      disponible: true,
      profil_valide: true,
      livreur_bloque: false
    });

    const livreursFiltres = livreurs.filter(l => {
      if (!l.moyen_deplacement) return false;
      try {
        const modes = JSON.parse(l.moyen_deplacement);
        return modes.includes(moyenDeplacement);
      } catch {
        return false;
      }
    });

    if (livreursFiltres.length === 0) {
      toast.error(`Aucun livreur disponible avec ce mode de transport. Veuillez réessayer.`);
      return null;
    }

    // Prendre le livreur le plus proche (aléatoire pour maintenant)
    const livreur = livreursFiltres[Math.floor(Math.random() * livreursFiltres.length)];
    
    return livreur;
  };

  const handleSubmit = async () => {
    if (!moyenDeplacement || !prix || !quartier_depart || !quartier_arrivee) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }

    setLoading(true);

    try {
      const livreur = await searchAndAssignLivreur();
      
      if (!livreur) {
        setLoading(false);
        return;
      }

      // Créer la course
      const commission_cdl = Math.round((parseFloat(prix) * 0.2) * 100) / 100;
      const gain_livreur = Math.round((parseFloat(prix) - commission_cdl) * 100) / 100;

      const course = await base44.entities.Course.create({
        quartier_depart,
        quartier_arrivee,
        telephone_expediteur: user.telephone,
        telephone_destinataire: "",
        type_colis: "Personne",
        description: notes,
        statut: "assignee_attente",
        mode_paiement: "Paiement à la livraison",
        statut_paiement: "paiement_livraison",
        client_email: user.email,
        client_name: user.full_name,
        livreur_email: livreur.email,
        livreur_name: livreur.full_name,
        telephone_livreur: livreur.telephone,
        prix: parseFloat(prix),
        commission: commission_cdl,
        commission_active: true,
        commission_cdl: commission_cdl,
        gain_livreur: gain_livreur,
        statut_paiement_livreur: "Commission due",
        mode_assignation: "auto",
        heure_assignation: new Date().toISOString(),
        nombre_tentatives: 1,
        moyen_transport: moyenDeplacement,
        niveau_urgence: urgence,
      });

      // Notifier le livreur
      await base44.entities.Notification.create({
        destinataire_email: livreur.email,
        destinataire_role: "livreur",
        titre: "📦 Nouvelle course disponible",
        message: `${quartier_depart} → ${quartier_arrivee} · ${prix} FCFA`,
        type: "info",
        lue: false,
        course_id: course.id,
      });

      toast.success("Course créée et assignée au livreur!");
      navigate("/mes-courses");
    } catch (error) {
      toast.error("Erreur lors de la création de la course");
      console.error(error);
    }

    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Effectuer un déplacement</h1>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="font-semibold">Quel mode de transport ?</p>
              <div className="space-y-2">
                {[
                  { val: "moto", label: "🏍️ Motocyclette", desc: "Plus rapide, prix réduit" },
                  { val: "vehicule", label: "🚗 Véhicule", desc: "Plus d'espace, confortable" },
                ].map(mode => (
                  <button
                    key={mode.val}
                    onClick={() => setMoyenDeplacement(mode.val)}
                    className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                      moyenDeplacement === mode.val
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <p className="font-semibold">{mode.label}</p>
                    <p className="text-xs text-muted-foreground">{mode.desc}</p>
                  </button>
                ))}
              </div>
              <Button 
                className="w-full" 
                disabled={!moyenDeplacement}
                onClick={() => setStep(2)}
              >
                Continuer →
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Quartier de départ *</Label>
            <Input 
              placeholder="Ex: Koulouba" 
              value={quartier_depart}
              onChange={e => setQuartierDepart(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Quartier d'arrivée *</Label>
            <Input 
              placeholder="Ex: Ouaga 2000" 
              value={quartier_arrivee}
              onChange={e => setQuartierArrivee(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Prix du déplacement (FCFA) *</Label>
            <Input 
              type="number" 
              placeholder="2000" 
              value={prix}
              onChange={e => setPrix(e.target.value)}
            />
            {prix && (
              <p className="text-xs text-muted-foreground">
                Commission CDL (20%): {Math.round(parseFloat(prix) * 0.2)} FCFA
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Niveau d'urgence</Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { val: "normal", label: "Normal" },
                { val: "urgent", label: "⚡ Urgent" },
                { val: "tres_urgent", label: "🔥 Très urgent" },
              ].map(opt => (
                <button
                  key={opt.val}
                  onClick={() => setUrgence(opt.val)}
                  className={`p-2 rounded-lg border text-sm font-medium transition-all ${
                    urgence === opt.val
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes supplémentaires</Label>
            <Input 
              placeholder="Instructions pour le livreur..." 
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
              Retour
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1"
            >
              {loading ? "Recherche du livreur..." : "Créer la course"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}