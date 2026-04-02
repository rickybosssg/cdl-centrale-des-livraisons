import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Search, Megaphone, RefreshCw, Phone, MessageCircle, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import moment from "moment";

const STATUT_CONFIG = {
  "en_attente": { color: "bg-amber-100 text-amber-700" },
  "valide": { color: "bg-green-100 text-green-700" },
  "refuse": { color: "bg-red-100 text-red-700" },
};

export default function BaseCommerciaux() {
  const navigate = useNavigate();
  const [commerciaux, setCommerciaux] = useState([]);
  const [codesPromo, setCodesPromo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtre, setFiltre] = useState("tous");
  const [selected, setSelected] = useState(null);

  const loadCommerciaux = async () => {
    setLoading(true);
    const [data, codes] = await Promise.all([
      base44.entities.User.filter({ user_type: "commercial" }),
      base44.entities.CodePromo.list("-created_date", 200),
    ]);
    setCommerciaux(data.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
    setCodesPromo(codes);
    setLoading(false);
  };

  useEffect(() => { loadCommerciaux(); }, []);

  const filtered = commerciaux.filter(c => {
    const q = search.toLowerCase();
    const code = codesPromo.find(cp => cp.commercial_email === c.email);
    const matchSearch = !q || c.full_name?.toLowerCase().includes(q) || c.telephone?.includes(q) || c.email?.toLowerCase().includes(q) || code?.code?.toLowerCase().includes(q);
    const statut = c.statut_validation_commercial || "en_attente";
    let matchFiltre = true;
    if (filtre === "valides") matchFiltre = statut === "valide";
    else if (filtre === "en_attente") matchFiltre = statut === "en_attente";
    else if (filtre === "refuses") matchFiltre = statut === "refuse";
    return matchSearch && matchFiltre;
  });

  const stats = {
    total: commerciaux.length,
    valides: commerciaux.filter(c => c.statut_validation_commercial === "valide").length,
    attente: commerciaux.filter(c => !c.statut_validation_commercial || c.statut_validation_commercial === "en_attente").length,
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
        <h1 className="text-xl font-bold flex-1">Base commerciaux</h1>
        <Button variant="outline" size="icon" onClick={loadCommerciaux}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="text-center"><CardContent className="p-3"><p className="text-2xl font-bold text-primary">{stats.total}</p><p className="text-[10px] text-muted-foreground">Total</p></CardContent></Card>
        <Card className="text-center"><CardContent className="p-3"><p className="text-2xl font-bold text-green-600">{stats.valides}</p><p className="text-[10px] text-muted-foreground">Validés</p></CardContent></Card>
        <Card className="text-center"><CardContent className="p-3"><p className="text-2xl font-bold text-amber-600">{stats.attente}</p><p className="text-[10px] text-muted-foreground">En attente</p></CardContent></Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Rechercher par nom, tél, code promo..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[{val:"tous",label:"Tous"},{val:"valides",label:"✅ Validés"},{val:"en_attente",label:"⏳ En attente"},{val:"refuses",label:"❌ Refusés"}]
          .map(f => (
          <button key={f.val} onClick={() => setFiltre(f.val)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all ${
              filtre === f.val ? "bg-primary text-primary-foreground border-primary" : "border-border"
            }`}>{f.label}</button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} commercial(aux)</p>
      <div className="space-y-2">
        {filtered.map(commercial => {
          const statut = commercial.statut_validation_commercial || "en_attente";
          const cfg = STATUT_CONFIG[statut] || STATUT_CONFIG.en_attente;
          const code = codesPromo.find(cp => cp.commercial_email === commercial.email);
          return (
            <Card key={commercial.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">{commercial.full_name}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{statut === "en_attente" ? "En attente" : statut === "valide" ? "Validé" : "Refusé"}</span>
                    </div>
                    <p className="text-xs font-medium">{commercial.telephone || "non renseigné"}</p>
                    <p className="text-xs text-muted-foreground">{commercial.email}</p>
                    <p className="text-xs text-muted-foreground">{commercial.quartier || "—"}</p>
                    {code && <p className="text-xs font-bold text-accent">Code : {code.code} · {code.nombre_utilisations || 0} utilisations</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-primary">{code ? (code.commission_due || 0).toLocaleString() + " F" : "—"}</p>
                    <p className="text-[10px] text-muted-foreground">Gains dus</p>
                    <p className="text-[10px] text-muted-foreground">{moment(commercial.created_date).fromNow()}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {commercial.telephone ? (
                    <a href={`tel:${commercial.telephone}`} className="flex-1">
                      <button className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-primary/30 text-primary text-xs font-medium hover:bg-primary/5">
                        <Phone className="h-3.5 w-3.5" /> Appeler
                      </button>
                    </a>
                  ) : <div className="flex-1" />}
                  {commercial.telephone ? (
                    <a href={`https://wa.me/${commercial.telephone?.replace(/[^0-9]/g,'')}`} target="_blank" rel="noreferrer" className="flex-1">
                      <button className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-green-300 text-green-700 text-xs font-medium hover:bg-green-50">
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                      </button>
                    </a>
                  ) : <div className="flex-1" />}
                  <button onClick={() => setSelected({...commercial, code})} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-xs font-medium hover:bg-muted">
                    <Eye className="h-3.5 w-3.5" /> Fiche
                  </button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && <div className="text-center py-12"><Megaphone className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" /><p className="text-sm text-muted-foreground">Aucun commercial trouvé</p></div>}
      </div>

      {/* Fiche commerciale détaillée */}
      {selected && (
        <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Fiche commercial</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 space-y-2">
                <p className="text-xs font-bold uppercase text-blue-700">📞 Contacts</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><p className="text-[10px] text-muted-foreground">Nom</p><p className="font-semibold">{selected.full_name}</p></div>
                  <div><p className="text-[10px] text-muted-foreground">Téléphone</p><p className="font-semibold">{selected.telephone || "non renseigné"}</p></div>
                  <div><p className="text-[10px] text-muted-foreground">Email</p><p className="text-xs">{selected.email}</p></div>
                  <div><p className="text-[10px] text-muted-foreground">Quartier</p><p>{selected.quartier || "—"}</p></div>
                </div>
                <div className="flex gap-2 pt-1">
                  {selected.telephone && <a href={`tel:${selected.telephone}`} className="flex-1"><button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-white text-xs font-semibold"><Phone className="h-3.5 w-3.5" /> Appeler</button></a>}
                  {selected.telephone && <a href={`https://wa.me/${selected.telephone?.replace(/[^0-9]/g,'')}`} target="_blank" rel="noreferrer" className="flex-1"><button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</button></a>}
                </div>
              </div>
              <div className="p-3 rounded-lg border space-y-2">
                <p className="text-xs font-bold uppercase text-muted-foreground">Code Promo</p>
                {selected.code ? (
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span>Code</span><span className="font-bold text-accent">{selected.code.code}</span></div>
                    <div className="flex justify-between"><span>Utilisations</span><span className="font-bold">{selected.code.nombre_utilisations || 0}</span></div>
                    <div className="flex justify-between"><span>Commission due</span><span className="font-bold text-amber-600">{(selected.code.commission_due || 0).toLocaleString()} F</span></div>
                    <div className="flex justify-between"><span>Commission payée</span><span className="font-bold text-green-600">{(selected.code.commission_payee || 0).toLocaleString()} F</span></div>
                    <div className="flex justify-between"><span>Statut</span><span className={`font-bold ${selected.code.actif ? 'text-green-600' : 'text-red-600'}`}>{selected.code.actif ? '✅ Actif' : '❌ Inactif'}</span></div>
                  </div>
                ) : <p className="text-sm text-muted-foreground">Aucun code promo attribué</p>}
              </div>
              <div className="p-3 rounded-lg border text-sm space-y-1">
                <div className="flex justify-between"><span>Statut profil</span><span className="font-bold">{selected.statut_validation_commercial || "—"}</span></div>
                <div className="flex justify-between"><span>Inscription</span><span>{moment(selected.created_date).format("DD/MM/YYYY")}</span></div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}