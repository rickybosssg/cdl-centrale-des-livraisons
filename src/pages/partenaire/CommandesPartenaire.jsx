import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, XCircle, Clock, Package, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { vibrateSuccess, vibrateLight } from "@/lib/vibration";
import { lancerDispatch } from "@/lib/dispatch";
import moment from "moment";

const STATUT_CONFIG = {
  en_attente_partenaire: { label: "En attente", color: "bg-amber-100 text-amber-700 border-amber-200" },
  acceptee:             { label: "Acceptée",   color: "bg-blue-100 text-blue-700 border-blue-200" },
  refusee:              { label: "Refusée",    color: "bg-red-100 text-red-700 border-red-200" },
  en_preparation:       { label: "En préparation", color: "bg-purple-100 text-purple-700 border-purple-200" },
  prete:                { label: "Prête",      color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  en_livraison:         { label: "En livraison", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  livree:               { label: "Livrée",     color: "bg-green-100 text-green-700 border-green-200" },
};

const TABS = [
  { key: "en_attente_partenaire", label: "En attente" },
  { key: "acceptee,en_preparation,prete", label: "En cours" },
  { key: "livree,en_livraison", label: "Livrées" },
  { key: "refusee", label: "Refusées" },
];

export default function CommandesPartenaire({ user }) {
  const navigate = useNavigate();
  const [partenaire, setPartenaire] = useState(null);
  const [commandes, setCommandes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [processing, setProcessing] = useState(null);
  const partRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      const parts = await base44.entities.Partenaire.filter({ user_email: user.email });
      if (parts.length > 0) {
        setPartenaire(parts[0]);
        partRef.current = parts[0];
        const cmds = await base44.entities.CommandePartenaire.filter(
          { partenaire_id: parts[0].id }, "-created_date", 200
        );
        setCommandes(cmds);
      }
      setLoading(false);
    };
    load();
  }, [user.email]);

  // Souscription temps réel
  useEffect(() => {
    if (!partenaire) return;
    const unsub = base44.entities.CommandePartenaire.subscribe((event) => {
      if (event.data?.partenaire_id !== partenaire.id) return;
      if (event.type === "create") {
        setCommandes(prev => [event.data, ...prev]);
        vibrateLight();
        toast.info("🛒 Nouvelle commande reçue !", { description: `De : ${event.data.client_nom || event.data.client_email}`, duration: 5000 });
      } else if (event.type === "update") {
        setCommandes(prev => prev.map(c => c.id === event.id ? event.data : c));
      }
    });
    return unsub;
  }, [partenaire]);

  const accepter = async (cmd) => {
    setProcessing(cmd.id);
    await base44.entities.CommandePartenaire.update(cmd.id, {
      statut: "en_preparation",
      date_acceptation: new Date().toISOString(),
    });
    // Créer la course CDL
    const courseData = await base44.entities.Course.create({
      quartier_depart: partenaire.quartier,
      quartier_arrivee: cmd.quartier_livraison,
      telephone_expediteur: partenaire.telephone,
      telephone_destinataire: cmd.client_telephone,
      type_colis: "Petit colis",
      description: `Commande chez ${partenaire.nom_commerce}`,
      statut: "en_attente",
      statut_paiement: "paiement_livraison",
      mode_paiement: "Paiement à la livraison",
      client_email: cmd.client_email,
      client_name: cmd.client_nom,
      prix: cmd.montant_livraison || 1500,
      commission: Math.round((cmd.montant_livraison || 1500) * 0.2),
      commission_active: true,
      commission_cdl: Math.round((cmd.montant_livraison || 1500) * 0.2),
      gain_livreur: Math.round((cmd.montant_livraison || 1500) * 0.8),
      statut_paiement_livreur: "Commission due",
      nombre_tentatives: 0,
    });
    await base44.entities.CommandePartenaire.update(cmd.id, { course_id: courseData.id, statut: "acceptee" });
    lancerDispatch(courseData);
    vibrateSuccess();
    toast.success("✅ Commande acceptée ! Livreur en recherche...");
    setProcessing(null);
  };

  const refuser = async (cmd) => {
    setProcessing(cmd.id);
    await base44.entities.CommandePartenaire.update(cmd.id, {
      statut: "refusee",
      date_refus: new Date().toISOString(),
    });
    vibrateLight();
    toast.success("Commande refusée");
    setProcessing(null);
  };

  const marquerPrete = async (cmd) => {
    setProcessing(cmd.id);
    await base44.entities.CommandePartenaire.update(cmd.id, { statut: "prete" });
    toast.success("Commande marquée comme prête !");
    setProcessing(null);
  };

  const tabKeys = TABS[activeTab].key.split(",");
  const filtered = commandes.filter(c => tabKeys.includes(c.statut));
  const nbAttente = commandes.filter(c => c.statut === "en_attente_partenaire").length;

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-xl font-bold flex-1">Mes commandes</h1>
        <Button variant="outline" size="icon" onClick={() => window.location.reload()}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map((tab, i) => {
          const isAttente = tab.key === "en_attente_partenaire";
          return (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border transition-colors flex items-center gap-1 ${
                activeTab === i ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border"
              }`}
            >
              {tab.label}
              {isAttente && nbAttente > 0 && (
                <span className="h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {nbAttente}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <Package className="h-10 w-10 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">Aucune commande ici</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(cmd => {
            const cfg = STATUT_CONFIG[cmd.statut] || STATUT_CONFIG.en_attente_partenaire;
            const isProcessing = processing === cmd.id;
            return (
              <Card key={cmd.id} className={cmd.statut === "en_attente_partenaire" ? "border-amber-300 shadow-md" : ""}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{cmd.client_nom || "Client"}</p>
                      <p className="text-xs text-muted-foreground">{cmd.client_telephone}</p>
                      {cmd.quartier_livraison && (
                        <p className="text-xs text-muted-foreground">📍 {cmd.quartier_livraison}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      <p className="text-xs text-muted-foreground mt-1">{moment(cmd.created_date).fromNow()}</p>
                    </div>
                  </div>

                  {cmd.note_client && (
                    <div className="bg-muted/50 rounded-lg p-2 text-xs text-muted-foreground">
                      💬 {cmd.note_client}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Livraison</span>
                    <span className="font-bold text-primary">{(cmd.montant_livraison || 1500).toLocaleString()} FCFA</span>
                  </div>

                  {/* Actions */}
                  {cmd.statut === "en_attente_partenaire" && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="flex-1"
                        disabled={isProcessing}
                        onClick={() => refuser(cmd)}
                      >
                        <XCircle className="h-4 w-4 mr-1" />Refuser
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 bg-green-600 hover:bg-green-700"
                        disabled={isProcessing}
                        onClick={() => accepter(cmd)}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />{isProcessing ? "..." : "Accepter"}
                      </Button>
                    </div>
                  )}

                  {cmd.statut === "en_preparation" && (
                    <Button
                      size="sm"
                      className="w-full bg-indigo-600 hover:bg-indigo-700"
                      disabled={isProcessing}
                      onClick={() => marquerPrete(cmd)}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />{isProcessing ? "..." : "Commande prête pour le livreur"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}