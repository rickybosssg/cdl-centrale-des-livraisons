import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Plus, Eye, EyeOff, Trash2, Calendar, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import moment from "moment";

export default function MesPublicites({ user }) {
  const navigate = useNavigate();
  const [pubs, setPubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
      await base44.entities.Publicite.update(pub.id, {
        active: !pub.active,
      });
      setPubs(prev => prev.map(p => p.id === pub.id ? { ...p, active: !p.active } : p));
      toast.success(pub.active ? "Publicité désactivée" : "Publicité activée");
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

  if (pubs.length === 0) {
    return (
      <div className="space-y-6 pb-20 max-w-md mx-auto pt-12">
        <div className="text-center space-y-4">
          <div className="text-5xl">📢</div>
          <h1 className="text-2xl font-bold">Aucune publicité</h1>
          <p className="text-muted-foreground">Vous n'avez pas encore créé de publicité. Lancez votre première campagne dès maintenant !</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => navigate("/dashboard-annonceur")}>Retour</Button>
          <Button className="flex-1" onClick={() => navigate("/creer-publicite")}><Plus className="h-4 w-4 mr-1" />Créer</Button>
        </div>
      </div>
    );
  }

  const statusColors = {
    "en_attente": "bg-amber-100 text-amber-700",
    "validée": "bg-green-100 text-green-700",
    "refusée": "bg-red-100 text-red-700",
    "expirée": "bg-gray-100 text-gray-700",
  };

  const statusLabels = {
    "en_attente": "⏳ En attente",
    "validée": "✅ Validée",
    "refusée": "❌ Refusée",
    "expirée": "⌛ Expirée",
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard-annonceur")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Mes publicités</h1>
          <p className="text-xs text-muted-foreground">{pubs.length} publicité(s)</p>
        </div>
        <Button size="sm" onClick={() => navigate("/creer-publicite")}>
          <Plus className="h-4 w-4 mr-1" /> Créer
        </Button>
      </div>

      <div className="space-y-3">
        {pubs.map(pub => (
          <Card key={pub.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{pub.titre || "Sans titre"}</p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {pub.date_debut ? moment(pub.date_debut).format("DD/MM/YY") : "—"} →{" "}
                      {pub.date_fin ? moment(pub.date_fin).format("DD/MM/YY") : "—"}
                    </span>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 whitespace-nowrap ${statusColors[pub.statut] || "bg-muted"}`}>
                  {statusLabels[pub.statut] || pub.statut}
                </span>
              </div>

              <p className="text-xs text-muted-foreground">
                📍 {pub.placement || "—"} · {(pub.cout || 5000).toLocaleString()} FCFA
              </p>

              {pub.statut === "refusée" && pub.motif_refus && (
                <div className="flex items-start gap-2 p-2 rounded bg-red-50 border border-red-200">
                  <AlertCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] text-red-700">{pub.motif_refus}</p>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t">
                {pub.statut === "validée" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5 text-xs"
                    onClick={() => handleToggle(pub)}
                  >
                    {pub.active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {pub.active ? "Désactiver" : "Activer"}
                  </Button>
                )}
                {pub.statut === "en_attente" && (
                  <Button size="sm" variant="outline" className="flex-1 text-xs" disabled>
                    En attente de validation
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:bg-red-50 gap-1.5 text-xs"
                  onClick={() => setDeleteConfirm(pub.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Supprimer
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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