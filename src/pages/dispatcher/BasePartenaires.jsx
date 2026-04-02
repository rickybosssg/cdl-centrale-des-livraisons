import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Search, Store, RefreshCw, Phone, MessageCircle, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import moment from "moment";

const STATUT_CONFIG = {
  "en_attente": { color: "bg-amber-100 text-amber-700" },
  "actif": { color: "bg-green-100 text-green-700" },
  "suspendu": { color: "bg-red-100 text-red-700" },
};

export default function BasePartenaires() {
  const navigate = useNavigate();
  const [partenaires, setPartenaires] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedPartenaire, setSelectedPartenaire] = useState(null);
  const [filtre, setFiltre] = useState("tous");

  const loadPartenaires = async () => {
    setLoading(true);
    const users = await base44.entities.User.filter({ user_type: "partenaire" });
    const profiles = await base44.entities.Partenaire.list("-created_date", 500);
    
    // Combiner User partenaire avec profil Partenaire
    const combined = users.map(u => {
      const profile = profiles.find(p => p.user_email === u.email);
      return { ...u, ...profile };
    });
    
    setPartenaires(combined.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
    setLoading(false);
  };

  useEffect(() => { loadPartenaires(); }, []);

  const filtered = partenaires.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.full_name?.toLowerCase().includes(q) || p.nom_commerce?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q) || p.telephone?.includes(q);
    const s = p.statut || "en_attente";
    let matchFiltre = true;
    if (filtre === "actifs") matchFiltre = s === "actif";
    else if (filtre === "en_attente") matchFiltre = s === "en_attente";
    else if (filtre === "suspendus") matchFiltre = s === "suspendu" || !!p.suspended;
    return matchSearch && matchFiltre;
  });

  const stats = {
    total: partenaires.length,
    actifs: partenaires.filter(p => p.ouvert || p.statut === "actif").length,
    attente: partenaires.filter(p => p.statut === "en_attente").length,
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4 pb-3 border-b">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center text-white font-bold">CDL</div>
          <div>
            <p className="font-bold text-lg">CDL APP</p>
            <p className="text-[10px] text-muted-foreground">Centrale des Livraisons</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold flex-1">Base partenaires</h1>
        <Button variant="outline" size="icon" onClick={loadPartenaires}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="text-center"><CardContent className="p-3"><p className="text-2xl font-bold text-primary">{stats.total}</p><p className="text-[10px] text-muted-foreground">Total</p></CardContent></Card>
        <Card className="text-center"><CardContent className="p-3"><p className="text-2xl font-bold text-green-600">{stats.actifs}</p><p className="text-[10px] text-muted-foreground">Actifs</p></CardContent></Card>
        <Card className="text-center"><CardContent className="p-3"><p className="text-2xl font-bold text-amber-600">{stats.attente}</p><p className="text-[10px] text-muted-foreground">En attente</p></CardContent></Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Rechercher par nom, commerce, tél..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[{val:"tous",label:"Tous"},{val:"actifs",label:"✅ Actifs"},{val:"en_attente",label:"⏳ En attente"},{val:"suspendus",label:"🔒 Suspendus"}]
          .map(f => (
          <button key={f.val} onClick={() => setFiltre(f.val)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all ${
              filtre === f.val ? "bg-primary text-primary-foreground border-primary" : "border-border"
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} partenaire(s)</p>
      <div className="space-y-2">
        {filtered.map(partenaire => {
          const statut = partenaire.statut || "en_attente";
          const cfg = STATUT_CONFIG[statut] || STATUT_CONFIG.en_attente;
          const tel = partenaire.telephone || partenaire.user_telephone;
          return (
            <Card key={partenaire.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2" onClick={() => setSelectedPartenaire(partenaire)}>
                  <div className="flex-1 min-w-0 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">{partenaire.nom_commerce || partenaire.full_name}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{statut}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{partenaire.type_commerce || "—"} · {partenaire.quartier || "—"}</p>
                    <p className="text-xs font-medium">{tel || "non renseigné"}</p>
                    <p className="text-xs text-muted-foreground">{partenaire.email || partenaire.user_email}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {partenaire.statut_abonnement && <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      partenaire.statut_abonnement === 'Expiré' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                    }`}>{partenaire.statut_abonnement}</span>}
                    <p className="text-[10px] text-muted-foreground mt-1">{moment(partenaire.created_date).fromNow()}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {tel ? (
                    <a href={`tel:${tel}`} className="flex-1">
                      <button className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-primary/30 text-primary text-xs font-medium hover:bg-primary/5">
                        <Phone className="h-3.5 w-3.5" /> Appeler
                      </button>
                    </a>
                  ) : <div className="flex-1" />}
                  {tel ? (
                    <a href={`https://wa.me/${tel?.replace(/[^0-9]/g,'')}`} target="_blank" rel="noreferrer" className="flex-1">
                      <button className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-green-300 text-green-700 text-xs font-medium hover:bg-green-50">
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                      </button>
                    </a>
                  ) : <div className="flex-1" />}
                  <button onClick={() => setSelectedPartenaire(partenaire)} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-xs font-medium hover:bg-muted">
                    <Eye className="h-3.5 w-3.5" /> Fiche
                  </button>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Fiche partenaire détaillée */}
        {selectedPartenaire && (
          <Dialog open={!!selectedPartenaire} onOpenChange={() => setSelectedPartenaire(null)}>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Fiche partenaire</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 space-y-2">
                  <p className="text-xs font-bold uppercase text-blue-700">📞 Contacts</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><p className="text-[10px] text-muted-foreground">Responsable</p><p className="font-semibold">{selectedPartenaire.nom_responsable || selectedPartenaire.full_name || "non renseigné"}</p></div>
                    <div><p className="text-[10px] text-muted-foreground">Commerce</p><p className="font-semibold">{selectedPartenaire.nom_commerce || "—"}</p></div>
                    <div><p className="text-[10px] text-muted-foreground">Téléphone</p><p className="font-semibold">{selectedPartenaire.telephone || "non renseigné"}</p></div>
                    <div><p className="text-[10px] text-muted-foreground">Email</p><p className="text-xs">{selectedPartenaire.email || selectedPartenaire.user_email || "—"}</p></div>
                    <div><p className="text-[10px] text-muted-foreground">Catégorie</p><p>{selectedPartenaire.type_commerce || "—"}</p></div>
                    <div><p className="text-[10px] text-muted-foreground">Quartier</p><p>{selectedPartenaire.quartier || "—"}</p></div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    {(selectedPartenaire.telephone) && (
                      <a href={`tel:${selectedPartenaire.telephone}`} className="flex-1">
                        <button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-white text-xs font-semibold"><Phone className="h-3.5 w-3.5" /> Appeler</button>
                      </a>
                    )}
                    {(selectedPartenaire.telephone) && (
                      <a href={`https://wa.me/${selectedPartenaire.telephone?.replace(/[^0-9]/g,'')}`} target="_blank" rel="noreferrer" className="flex-1">
                        <button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</button>
                      </a>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg border text-center"><p className="text-lg font-bold text-primary">{selectedPartenaire.nombre_vues || 0}</p><p className="text-xs text-muted-foreground">Vues</p></div>
                  <div className="p-3 rounded-lg border text-center"><p className="text-lg font-bold text-green-600">{selectedPartenaire.nombre_commandes || 0}</p><p className="text-xs text-muted-foreground">Commandes</p></div>
                </div>
                <div className="p-3 rounded-lg border space-y-1 text-sm">
                  <p className="font-semibold text-xs uppercase text-muted-foreground">Abonnement</p>
                  <div className="flex justify-between"><span>Statut</span><span className={`font-bold ${
                    selectedPartenaire.statut_abonnement === 'Expiré' ? 'text-red-600' : 'text-green-600'
                  }`}>{selectedPartenaire.statut_abonnement || "Actif"}</span></div>
                  {selectedPartenaire.date_expiration_abonnement && <div className="flex justify-between"><span>Expire</span><span>{moment(selectedPartenaire.date_expiration_abonnement).format("DD/MM/YYYY")}</span></div>}
                  <div className="flex justify-between"><span>1er mois</span><span className="font-bold">10 000 F</span></div>
                  <div className="flex justify-between"><span>Suivants</span><span className="font-bold">30 000 F</span></div>
                </div>
                <div className="p-3 rounded-lg border text-sm space-y-1">
                  <div className="flex justify-between"><span>Statut profil</span><span className="font-bold">{selectedPartenaire.statut || "—"}</span></div>
                  <div className="flex justify-between"><span>Inscription</span><span>{moment(selectedPartenaire.created_date).format("DD/MM/YYYY")}</span></div>
                  {selectedPartenaire.ouvert !== undefined && <div className="flex justify-between"><span>Visibilité</span><span className={selectedPartenaire.ouvert ? "text-green-600 font-bold" : "text-muted-foreground"}>{selectedPartenaire.ouvert ? "🟢 Visible" : "⚪ Masqué"}</span></div>}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
        {filtered.length === 0 && <div className="text-center py-12"><Store className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">Aucun partenaire trouvé</p></div>}
      </div>
    </div>
  );
}