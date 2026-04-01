import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Wallet } from "lucide-react";
import { toast } from "sonner";

export default function EffectuerDeplacement() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [soldeBedou, setSoldeBedou] = useState(null);
  
  useEffect(() => {
    base44.auth.me().then(setUser);
    base44.functions.invoke('bedouEngine', { action: 'get_bedou' }).then(res => {
      setSoldeBedou(res.data.bedou?.solde_disponible || 0);
    });
  }, []);
  const [step, setStep] = useState(1);
  const [moyenDeplacement, setMoyenDeplacement] = useState(null);
  const [urgent, setUrgent] = useState(false);
  const [tresUrgent, setTresUrgent] = useState(false);
  const [prixBase, setPrixBase] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [quartier_depart, setQuartierDepart] = useState("");
  const [quartier_arrivee, setQuartierArrivee] = useState("");

  const prixBaseNum = parseInt(prixBase, 10) || 0;
  const supplement = tresUrgent ? 1000 : urgent ? 500 : 0;
  const prixTotal = prixBaseNum + supplement;
  const niveauUrgence = tresUrgent ? "tres_urgent" : urgent ? "urgent" : "normal";

  const handleUrgent = (val) => { setUrgent(val); if (val) setTresUrgent(false); };
  const handleTresUrgent = (val) => { setTresUrgent(val); if (val) setUrgent(false); };

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

  const soldeInsuffisant = soldeBedou !== null && prixTotal > 0 && soldeBedou < prixTotal;

  const handleSubmit = async () => {
    if (!moyenDeplacement || !prixBaseNum || !quartier_depart || !quartier_arrivee) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }

    if (soldeInsuffisant) {
      toast.error("Solde Bedou insuffisant. Rechargez votre Bedou.");
      return;
    }
    setLoading(true);

    // Débiter Bedou avant assignation
    const courseRef = `tmp_deplacement_${user.email}_${Date.now()}`;
    const payRes = await base44.functions.invoke('bedouEngine', { action: 'payer_course', montant: prixTotal, course_ref: courseRef });
    if (!payRes.data.success) {
      toast.error(payRes.data.error || "Erreur de paiement Bedou");
      setLoading(false);
      return;
    }
    setSoldeBedou(payRes.data.nouveau_solde);

    try {
      const livreur = await searchAndAssignLivreur();
      
      if (!livreur) {
        setLoading(false);
        return;
      }

      // Créer la course
      const commission_cdl = Math.round(prixTotal * 0.2 * 100) / 100;
      const gain_livreur = Math.round((prixTotal - commission_cdl) * 100) / 100;

      const course = await base44.entities.Course.create({
        quartier_depart,
        quartier_arrivee,
        telephone_expediteur: user.telephone,
        telephone_destinataire: "",
        type_colis: "Personne",
        description: notes,
        statut: "assignee_attente",
        mode_paiement: "Bedou",
        statut_paiement: "paye",
        client_email: user.email,
        client_name: user.full_name,
        livreur_email: livreur.email,
        livreur_name: livreur.full_name,
        telephone_livreur: livreur.telephone,
        prix: prixTotal,
        montant_base: prixBaseNum,
        supplement_urgence: supplement,
        commission: commission_cdl,
        commission_active: true,
        commission_cdl: commission_cdl,
        gain_livreur: gain_livreur,
        statut_paiement_livreur: "Commission due",
        mode_assignation: "auto",
        heure_assignation: new Date().toISOString(),
        nombre_tentatives: 1,
        moyen_transport: moyenDeplacement,
        urgence: tresUrgent ? "tres_urgent" : urgent ? "urgent" : null,
        niveau_urgence: niveauUrgence,
      });

      // Notifier le livreur
      await base44.entities.Notification.create({
        destinataire_email: livreur.email,
        destinataire_role: "livreur",
        titre: "📦 Nouvelle course disponible",
        message: `${quartier_depart} → ${quartier_arrivee} · ${prixTotal} FCFA`,
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
            <div className="relative">
              <Input
                type="number"
                min="0"
                placeholder="Ex: 2000"
                value={prixBase}
                onChange={e => setPrixBase(e.target.value)}
                className="pr-16"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">FCFA</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Niveau d'urgence (optionnel)</Label>
            <div className="space-y-2">
              <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${urgent ? 'border-amber-400 bg-amber-50' : 'border-border'}`}>
                <input type="checkbox" checked={urgent} onChange={e => handleUrgent(e.target.checked)} className="h-4 w-4 accent-amber-500" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-700">🔔 Urgent <span className="text-amber-600 font-bold">+500 FCFA</span></p>
                  <p className="text-xs text-muted-foreground">(moins de 30 min)</p>
                </div>
              </label>
              <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${tresUrgent ? 'border-red-400 bg-red-50' : 'border-border'}`}>
                <input type="checkbox" checked={tresUrgent} onChange={e => handleTresUrgent(e.target.checked)} className="h-4 w-4 accent-red-500" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-700">🚨 Très urgent <span className="text-red-600 font-bold">+1000 FCFA</span></p>
                  <p className="text-xs text-muted-foreground">(moins de 20 min)</p>
                </div>
              </label>
            </div>
          </div>

          {prixBaseNum > 0 && (
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
              <p className="text-sm font-semibold">📋 Récapitulatif</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Prix de base</span>
                  <span>{prixBaseNum} FCFA</span>
                </div>
                {supplement > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span>{tresUrgent ? '🚨 Très urgent' : '🔔 Urgent'}</span>
                    <span>+{supplement} FCFA</span>
                  </div>
                )}
                <div className="border-t pt-2 flex justify-between font-bold text-base">
                  <span>Total</span>
                  <span className="text-primary text-xl">{prixTotal} FCFA</span>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Notes supplémentaires</Label>
            <Input 
              placeholder="Instructions pour le livreur..." 
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          {/* Bloc paiement Bedou */}
          <Card className={`border-2 ${soldeInsuffisant ? 'border-red-300 bg-red-50' : prixTotal > 0 ? 'border-green-300 bg-green-50' : 'border-border'}`}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Paiement via Bedou</p>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Mon solde</span>
                <span className="font-bold">{soldeBedou !== null ? `${soldeBedou.toLocaleString()} F CFA` : '...'}</span>
              </div>
              {prixTotal > 0 && (
                <div className={`flex items-center gap-2 p-2 rounded-lg text-sm font-semibold ${soldeInsuffisant ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                  {soldeInsuffisant ? '❌ Solde insuffisant' : `✅ Total : ${prixTotal} FCFA`}
                </div>
              )}
              {soldeInsuffisant && (
                <Button size="sm" className="w-full" variant="outline" onClick={() => navigate('/mon-bedou')}>
                  🔄 Recharger mon Bedou
                </Button>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
              Retour
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading || soldeInsuffisant || !prixBaseNum}
              className="flex-1"
            >
              {loading ? "Paiement & recherche..." : "Payer et créer"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}