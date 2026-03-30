import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import moment from "moment";

export default function AdminTrash() {
  const navigate = useNavigate();
  const [deleted, setDeleted] = useState([]);
  const [suspended, setSuspended] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("deleted");
  const [selectedItem, setSelectedItem] = useState(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    const load = async () => {
      const deletedItems = await base44.entities.Partenaire.filter({ deleted: true });
      const suspendedItems = await base44.entities.Partenaire.filter({ suspended: true });
      const deletedCodes = await base44.entities.CodePromo.filter({ deleted: true });
      const suspendedCodes = await base44.entities.CodePromo.filter({ suspended: true });
      const deletedAds = await base44.entities.Publicite.filter({ deleted: true });
      const suspendedAds = await base44.entities.Publicite.filter({ suspended: true });

      setDeleted([
        ...deletedItems.map(p => ({ type: 'partenaire', data: p })),
        ...deletedCodes.map(c => ({ type: 'commercial', data: c })),
        ...deletedAds.map(a => ({ type: 'publicite', data: a })),
      ]);

      setSuspended([
        ...suspendedItems.map(p => ({ type: 'partenaire', data: p })),
        ...suspendedCodes.map(c => ({ type: 'commercial', data: c })),
        ...suspendedAds.map(a => ({ type: 'publicite', data: a })),
      ]);

      setLoading(false);
    };
    load();
  }, []);

  const handleRestore = async (item) => {
    setRestoring(true);
    try {
      if (item.type === 'partenaire') {
        await base44.functions.invoke('adminActionPartner', {
          partenaire_id: item.data.id,
          action: 'restore',
        });
        setDeleted(prev => prev.filter(x => x.data.id !== item.data.id));
      } else if (item.type === 'commercial') {
        await base44.functions.invoke('adminActionCommercial', {
          code_promo_id: item.data.id,
          commercial_email: item.data.commercial_email,
          action: 'restore',
        });
        setDeleted(prev => prev.filter(x => x.data.id !== item.data.id));
      } else if (item.type === 'publicite') {
        await base44.functions.invoke('adminActionAd', {
          pub_id: item.data.id,
          action: 'restore',
        });
        setDeleted(prev => prev.filter(x => x.data.id !== item.data.id));
      }
      toast.success('Restauré avec succès');
      setSelectedItem(null);
    } catch (err) {
      toast.error('Erreur : ' + err.message);
    } finally {
      setRestoring(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const items = filter === "deleted" ? deleted : suspended;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold flex-1">Corbeille / Historique</h1>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setFilter("deleted")}
          className={`p-3 rounded-lg border font-medium text-sm ${
            filter === "deleted" ? "border-red-400 bg-red-50 text-red-700" : "border-border"
          }`}
        >
          🗑️ Supprimés ({deleted.length})
        </button>
        <button
          onClick={() => setFilter("suspended")}
          className={`p-3 rounded-lg border font-medium text-sm ${
            filter === "suspended" ? "border-amber-400 bg-amber-50 text-amber-700" : "border-border"
          }`}
        >
          🔒 Suspendus ({suspended.length})
        </button>
      </div>

      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">Aucun élément</p>
        ) : (
          items.map((item) => {
            const name =
              item.type === 'partenaire'
                ? item.data.nom_commerce
                : item.type === 'commercial'
                ? item.data.code
                : item.data.titre;
            return (
              <Card key={`${item.type}-${item.data.id}`} className="opacity-70">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.type === 'partenaire' && `📍 ${item.data.quartier}`}
                      {item.type === 'commercial' && `📣 ${item.data.commercial_email}`}
                      {item.type === 'publicite' && `📢 ${item.data.nom_annonceur || 'Annonceur'}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {filter === "deleted"
                        ? `Supprimé: ${moment(item.data.deleted_at).format('DD/MM/YYYY HH:mm')}`
                        : `Suspendu: ${moment(item.data.suspended_at).format('DD/MM/YYYY HH:mm')}`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setSelectedItem(item)}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" /> Restaurer
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={!!selectedItem} onOpenChange={(v) => { if (!v) setSelectedItem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la restauration</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                <p className="font-semibold text-sm">
                  {selectedItem.type === 'partenaire' && selectedItem.data.nom_commerce}
                  {selectedItem.type === 'commercial' && selectedItem.data.code}
                  {selectedItem.type === 'publicite' && selectedItem.data.titre}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Êtes-vous sûr de vouloir restaurer cet élément ?
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setSelectedItem(null)}>
                  Annuler
                </Button>
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={() => handleRestore(selectedItem)}
                  disabled={restoring}
                >
                  {restoring ? "Restauration..." : "✓ Restaurer"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}