import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShoppingBag, RefreshCw } from "lucide-react";
import moment from "moment";

const STATUT_CONFIG = {
  en_attente_partenaire: { label: "En attente", color: "bg-amber-100 text-amber-700" },
  acceptee:              { label: "Acceptée",   color: "bg-blue-100 text-blue-700" },
  refusee:               { label: "Refusée",    color: "bg-red-100 text-red-700" },
  en_preparation:        { label: "En préparation", color: "bg-purple-100 text-purple-700" },
  prete:                 { label: "Prête",      color: "bg-indigo-100 text-indigo-700" },
  en_livraison:          { label: "En livraison", color: "bg-cyan-100 text-cyan-700" },
  livree:                { label: "Livrée",     color: "bg-green-100 text-green-700" },
  annulee:               { label: "Annulée",    color: "bg-gray-100 text-gray-600" },
};

export default function MesCommandesMarketplace() {
  const navigate = useNavigate();
  const [commandes, setCommandes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      setUser(me);
      const data = await base44.entities.CommandePartenaire.filter(
        { client_email: me.email }, "-created_date", 100
      );
      setCommandes(data);
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = base44.entities.CommandePartenaire.subscribe((event) => {
      if (!event.data || event.data.client_email !== user.email) return;
      if (event.type === "create") setCommandes(prev => [event.data, ...prev]);
      else if (event.type === "update") setCommandes(prev => prev.map(c => c.id === event.id ? event.data : c));
    });
    return unsub;
  }, [user]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  const actives = commandes.filter(c => !["livree", "annulee", "refusee"].includes(c.statut));
  const terminees = commandes.filter(c => ["livree", "annulee", "refusee"].includes(c.statut));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-xl font-bold flex-1">Mes commandes</h1>
      </div>

      {commandes.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <ShoppingBag className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">Aucune commande pour le moment</p>
          <Button variant="outline" onClick={() => navigate("/vitrines")}>Découvrir les boutiques</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {actives.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">En cours</p>
              {actives.map(cmd => <CommandeCard key={cmd.id} cmd={cmd} navigate={navigate} />)}
            </div>
          )}
          {terminees.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Terminées</p>
              {terminees.map(cmd => <CommandeCard key={cmd.id} cmd={cmd} navigate={navigate} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CommandeCard({ cmd, navigate }) {
  const cfg = STATUT_CONFIG[cmd.statut] || STATUT_CONFIG.en_attente_partenaire;
  const items = (() => { try { return JSON.parse(cmd.items_json || "[]"); } catch (_) { return []; } })();

  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/commande-marketplace/${cmd.id}`)}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-sm">{cmd.partenaire_nom}</p>
            <p className="text-xs text-muted-foreground">{moment(cmd.created_date).format("DD/MM/YYYY à HH:mm")}</p>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${cfg.color}`}>
            {cfg.label}
          </span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-1">
          {items.map(i => `${i.nom} ×${i.qty}`).join(", ")}
        </p>
        <div className="flex justify-between items-center">
          <p className="text-xs text-muted-foreground">{items.length} article(s)</p>
          <p className="font-bold text-sm text-primary">{(cmd.total_commande || 0).toLocaleString()} FCFA</p>
        </div>
      </CardContent>
    </Card>
  );
}