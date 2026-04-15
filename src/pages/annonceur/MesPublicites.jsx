import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PubsGrid from "@/components/PubsGrid";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const TABS = [
  { key: "tous", label: "Toutes les pubs" },
  { key: "actives", label: "Actives" },
  { key: "en_attente", label: "En attente" },
  { key: "expirees", label: "Expirées" },
];

export default function MesPublicites({ user }) {
  const navigate = useNavigate();
  const [pubs, setPubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("tous");
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        if (!user?.email) {
          setError('Utilisateur non authentifié');
          setLoading(false);
          return;
        }

        const pubsData = await base44.entities.Publicite.filter(
          { created_by: user.email },
          "-created_date",
          100
        );
        setPubs(pubsData || []);
      } catch (e) {
        console.error("[MesPublicites] Error:", e);
        setError('Erreur lors du chargement des publicités');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.email]);

  const handleToggle = async (pub) => {
    try {
      await base44.entities.Publicite.update(pub.id, { active: !pub.active });
      setPubs(prev => prev.map(p => p.id === pub.id ? { ...p, active: !p.active } : p));
      toast.success(pub.active ? "Publicité mise en pause" : "Publicité activée");
    } catch (e) {
      console.error("[MesPublicites] Toggle error:", e);
      toast.error("Erreur lors de la mise à jour");
    }
  };

  const handleDelete = async (pubId) => {
    try {
      await base44.entities.Publicite.delete(pubId);
      setPubs(prev => prev.filter(p => p.id !== pubId));
      setDeleteConfirm(null);
      toast.success("Publicité supprimée");
    } catch (e) {
      console.error("[MesPublicites] Delete error:", e);
      toast.error("Erreur lors de la suppression");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-red-600 font-semibold">{error}</p>
        <Button onClick={() => window.location.reload()}>Réessayer</Button>
      </div>
    );
  }

  // Filtrés par statut et activation
  const getFilteredPubs = () => {
    const now = new Date();
    switch (activeTab) {
      case "actives":
        return pubs.filter(p => p.active && p.statut === "validée" && (!p.date_fin || new Date(p.date_fin) > now));
      case "en_attente":
        return pubs.filter(p => p.statut === "en_attente");
      case "expirees":
        return pubs.filter(p => p.date_fin && new Date(p.date_fin) <= now);
      case "tous":
      default:
        return pubs;
    }
  };

  const filteredPubs = getFilteredPubs();

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard-annonceur")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Mes publicités</h1>
          <p className="text-xs text-muted-foreground">{pubs.length} publicité(s) créée(s)</p>
        </div>
        <Button size="sm" onClick={() => navigate("/creer-publicite")}>
          <Plus className="h-4 w-4 mr-1" /> Créer
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 border-b border-border">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`whitespace-nowrap text-sm font-medium px-4 py-2 border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {filteredPubs.length === 0 ? (
        <div className="text-center py-12 space-y-4 bg-muted/30 rounded-xl p-6">
          <div className="text-4xl">📢</div>
          <p className="font-semibold text-gray-700">
            {activeTab === "actives" ? "Aucune pub active" : "Aucune publicité dans cette catégorie"}
          </p>
          {activeTab === "tous" && (
            <>
              <p className="text-sm text-muted-foreground">Lance ta première pub pour attirer des clients</p>
              <Button className="mx-auto gap-2" onClick={() => navigate("/creer-publicite")}>
                <Plus className="h-4 w-4" /> Créer une publicité
              </Button>
            </>
          )}
        </div>
      ) : (
        <PubsGrid
          pubs={filteredPubs}
          onToggle={handleToggle}
          onDelete={(pubId) => setDeleteConfirm(pubId)}
        />
      )}

      {/* Dialog confirmation suppression */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Êtes-vous sûr de vouloir supprimer cette publicité ? Cette action est irréversible.</p>
          <div className="flex gap-2 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirm(null)}>Annuler</Button>
            <Button variant="destructive" className="flex-1" onClick={() => handleDelete(deleteConfirm)}>Supprimer</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}