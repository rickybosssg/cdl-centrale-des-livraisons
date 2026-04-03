import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Plus, TrendingUp, Eye, Calendar, AlertCircle, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BedouWidget from "@/components/BedouWidget";
import moment from "moment";

export default function DashboardAnnonceur({ user }) {
  const navigate = useNavigate();
  const [annonceur, setAnnonceur] = useState(null);
  const [pubs, setPubs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const ann = await base44.entities.Annonceur.filter({ user_email: user.email }, "-created_date", 1);
        if (ann && ann.length > 0) {
          setAnnonceur(ann[0]);
        }
        const pubsData = await base44.entities.Publicite.filter(
          { created_by: user.email },
          "-created_date",
          100
        );
        setPubs(pubsData || []);
      } catch (e) {
        console.error("[DashboardAnnonceur] Error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user.email]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!annonceur) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Profil annonceur non trouvé</p>
        <Button onClick={() => navigate(-1)}>Retour</Button>
      </div>
    );
  }

  const pubsValides = pubs.filter(p => p.statut === "validée");
  const pubsEnAttente = pubs.filter(p => p.statut === "en_attente");
  const pubsExpires = pubs.filter(p => p.statut === "expirée");
  const totalDepense = pubs
    .filter(p => ["validée", "expirée"].includes(p.statut))
    .reduce((s, p) => s + (p.cout || 5000), 0);

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Mon espace Annonceur 📢</h1>
        <p className="text-sm text-muted-foreground">Créez et gérez vos publicités CDL</p>
      </div>

      {/* Bedou */}
      <BedouWidget user={user} />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <TrendingUp className="h-5 w-5 text-primary mx-auto mb-1" />
            <p className="text-xl font-bold">{pubs.length}</p>
            <p className="text-[10px] text-muted-foreground">Publicités créées</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Eye className="h-5 w-5 text-blue-600 mx-auto mb-1" />
            <p className="text-xl font-bold">{pubsValides.length}</p>
            <p className="text-[10px] text-muted-foreground">Actives</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <DollarSign className="h-5 w-5 text-amber-600 mx-auto mb-1" />
            <p className="text-lg font-bold">{totalDepense.toLocaleString()}F</p>
            <p className="text-[10px] text-muted-foreground">Dépensé</p>
          </CardContent>
        </Card>
      </div>

      {/* Bouton créer pub */}
      <Link to="/creer-publicite">
        <Button className="w-full gap-2 py-6 text-base">
          <Plus className="h-5 w-5" />
          Créer une nouvelle publicité
        </Button>
      </Link>

      {/* Tabs pubs */}
      <Tabs defaultValue="tous">
        <TabsList className="w-full grid grid-cols-4 text-[10px]">
          <TabsTrigger value="tous">Tous ({pubs.length})</TabsTrigger>
          <TabsTrigger value="actives">Actives ({pubsValides.length})</TabsTrigger>
          <TabsTrigger value="attente">Attente ({pubsEnAttente.length})</TabsTrigger>
          <TabsTrigger value="expirees">Expirées ({pubsExpires.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="tous" className="mt-4 space-y-2">
          {pubs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Aucune publicité créée</div>
          ) : (
            pubs.map(p => <PubCard key={p.id} pub={p} />)
          )}
        </TabsContent>

        <TabsContent value="actives" className="mt-4 space-y-2">
          {pubsValides.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Aucune publicité active</div>
          ) : (
            pubsValides.map(p => <PubCard key={p.id} pub={p} />)
          )}
        </TabsContent>

        <TabsContent value="attente" className="mt-4 space-y-2">
          {pubsEnAttente.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Aucune pub en attente</div>
          ) : (
            pubsEnAttente.map(p => <PubCard key={p.id} pub={p} />)
          )}
        </TabsContent>

        <TabsContent value="expirees" className="mt-4 space-y-2">
          {pubsExpires.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Aucune pub expirée</div>
          ) : (
            pubsExpires.map(p => <PubCard key={p.id} pub={p} />)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PubCard({ pub }) {
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
    <Card>
      <CardContent className="p-3 space-y-2">
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
      </CardContent>
    </Card>
  );
}