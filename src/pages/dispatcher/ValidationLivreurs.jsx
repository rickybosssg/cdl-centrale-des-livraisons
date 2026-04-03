import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, User, Eye, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";
import moment from "moment";

export default function ValidationLivreurs() {
  const navigate = useNavigate();
  const [livreurs, setLivreurs] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    const data = await base44.entities.User.filter({ user_type: "livreur" });
    setLivreurs(data);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const unsub = base44.entities.User.subscribe((event) => {
      if (event.data?.user_type !== 'livreur') return;
      if (event.type === 'create') setLivreurs(prev => [...prev, event.data]);
      else if (event.type === 'update') setLivreurs(prev => prev.map(l => l.id === event.id ? event.data : l));
      else if (event.type === 'delete') setLivreurs(prev => prev.filter(l => l.id !== event.id));
    });
    return () => unsub();
  }, []);

  const enAttente = livreurs.filter(l => !l.statut_validation_livreur || l.statut_validation_livreur === "en_attente");
  const valides = livreurs.filter(l => l.statut_validation_livreur === "valide");
  const refuses = livreurs.filter(l => l.statut_validation_livreur === "refuse");

  const StatutBadge = ({ statut }) => {
    const cfg = { en_attente: "bg-amber-100 text-amber-700", valide: "bg-green-100 text-green-700", refuse: "bg-red-100 text-red-700" };
    const labels = { en_attente: "En attente", valide: "Validé", refuse: "Refusé" };
    const key = statut || "en_attente";
    return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg[key]}`}>{labels[key]}</span>;
  };

  const LivreurCard = ({ livreur }) => (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          {livreur.photo_profil ? (
            <img src={livreur.photo_profil} alt="Photo" className="h-12 w-12 rounded-full object-cover border" />
          ) : (
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-6 w-6 text-primary" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm">{livreur.full_name}</p>
              <StatutBadge statut={livreur.statut_validation_livreur} />
            </div>
            <p className="text-xs font-medium text-foreground">{livreur.telephone || <span className="text-muted-foreground">non renseigné</span>}</p>
            <p className="text-xs text-muted-foreground">{livreur.email}</p>
            <p className="text-xs text-muted-foreground">{livreur.quartier || "—"} · Inscrit le {moment(livreur.created_date).format("DD/MM/YYYY")}</p>
            {livreur.date_validation && <p className="text-xs text-green-600">Validé le {moment(livreur.date_validation).format("DD/MM/YYYY")}</p>}
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs flex-shrink-0"
            onClick={() => navigate(`/admin/profil/${livreur.id}`)}>
            <Eye className="h-3 w-3 mr-1" />Voir
          </Button>
        </div>
        <div className="flex gap-2">
          {livreur.telephone ? (
            <a href={`tel:${livreur.telephone}`} className="flex-1">
              <button className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-primary/30 text-primary text-xs font-medium hover:bg-primary/5">
                <Phone className="h-3.5 w-3.5" /> Appeler
              </button>
            </a>
          ) : <div className="flex-1" />}
          {livreur.telephone ? (
            <a href={`https://wa.me/${livreur.telephone?.replace(/[^0-9]/g,'')}`} target="_blank" rel="noreferrer" className="flex-1">
              <button className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-green-300 text-green-700 text-xs font-medium hover:bg-green-50">
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </button>
            </a>
          ) : <div className="flex-1" />}
        </div>
      </CardContent>
    </Card>
  );

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
        <h1 className="text-xl font-bold">Validation des livreurs</h1>
      </div>

      <Tabs defaultValue="attente">
        <TabsList className="w-full">
          <TabsTrigger value="attente" className="flex-1 text-xs">En attente ({enAttente.length})</TabsTrigger>
          <TabsTrigger value="valides" className="flex-1 text-xs">Validés ({valides.length})</TabsTrigger>
          <TabsTrigger value="refuses" className="flex-1 text-xs">Refusés ({refuses.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="attente" className="space-y-3 mt-3">
          {enAttente.map(l => <LivreurCard key={l.id} livreur={l} />)}
          {enAttente.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Aucun livreur en attente</p>}
        </TabsContent>
        <TabsContent value="valides" className="space-y-3 mt-3">
          {valides.map(l => <LivreurCard key={l.id} livreur={l} />)}
          {valides.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Aucun livreur validé</p>}
        </TabsContent>
        <TabsContent value="refuses" className="space-y-3 mt-3">
          {refuses.map(l => <LivreurCard key={l.id} livreur={l} />)}
          {refuses.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Aucun livreur refusé</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}