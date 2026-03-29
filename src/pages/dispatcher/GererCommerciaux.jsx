import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useMessageNotification } from "@/hooks/useMessageNotification";
import MessageAlert from "@/components/MessageAlert";
import { ArrowLeft, CheckCircle2, XCircle, Users, Tag, Wallet, Eye } from "lucide-react";
import ChatAdmin from "@/components/ChatAdmin";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import moment from "moment";

const MODES_PAIEMENT = ["Espèces", "Orange Money", "Moov Money", "Telecel Money"];

export default function GererCommerciaux() {
  const navigate = useNavigate();
  const [commerciaux, setCommerciaux] = useState([]);
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [selectedCode, setSelectedCode] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogPaiement, setDialogPaiement] = useState(false);
  const [motifRefus, setMotifRefus] = useState("");
  const [formPaiement, setFormPaiement] = useState({ montant: "", mode: "" });
  const [saving, setSaving] = useState(false);
  const [filtre, setFiltre] = useState("tous");
  const [adminUser, setAdminUser] = useState(null);
  const [dialogTab, setDialogTab] = useState("profil");

  useEffect(() => { base44.auth.me().then(setAdminUser); }, []);
  const [showCommissionsDues, setShowCommissionsDues] = useState(false);
  const [paiementEnCours, setPaiementEnCours] = useState({});
  const newMsg = useMessageNotification(selected?.email);

  const loadData = async () => {
    const [usersData, codesData] = await Promise.all([
      base44.entities.User.filter({ user_type: "commercial" }),
      base44.entities.CodePromo.list("-created_date", 200),
    ]);
    setCommerciaux(usersData);
    setCodes(codesData);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const getCodeForCommercial = (email) => codes.find(c => c.commercial_email === email);

  const validerProfil = async (commercial) => {
    await base44.entities.User.update(commercial.id, { profil_valide: true, statut_validation_commercial: "valide" });
    toast.success("Profil commercial validé !");
    loadData();
  };

  const refuserProfil = async (commercial) => {
    await base44.entities.User.update(commercial.id, { profil_valide: false, statut_validation_commercial: "refuse" });
    toast.success("Profil refusé");
    loadData();
  };

  const validerCode = async (code) => {
    await base44.entities.CodePromo.update(code.id, { statut: "valide", actif: true, motif_refus: "" });
    toast.success("Code promo validé !");
    setDialogOpen(false);
    loadData();
  };

  const refuserCode = async (code) => {
    if (!motifRefus.trim()) { toast.error("Veuillez indiquer un motif"); return; }
    await base44.entities.CodePromo.update(code.id, { statut: "refuse", actif: false, motif_refus: motifRefus });
    toast.success("Code refusé");
    setMotifRefus("");
    setDialogOpen(false);
    loadData();
  };

  const enregistrerPaiement = async () => {
    if (!formPaiement.montant || !formPaiement.mode) { toast.error("Remplissez tous les champs"); return; }
    setSaving(true);
    const montant = parseFloat(formPaiement.montant);
    const nouvellePaye = (selectedCode.commission_payee || 0) + montant;
    const nouvelleRestante = (selectedCode.commission_due || 0) - nouvellePaye;
    await base44.entities.CodePromo.update(selectedCode.id, {
      commission_payee: nouvellePaye,
      statut_paiement: nouvelleRestante <= 0 ? "À jour" : "Doit",
    });
    toast.success("Paiement enregistré !");
    setDialogPaiement(false);
    setFormPaiement({ montant: "", mode: "" });
    setSaving(false);
    loadData();
  };

  const marquerCommePayeDirectement = async (code) => {
    setPaiementEnCours(prev => ({ ...prev, [code.id]: true }));
    const montantDu = (code.commission_due || 0) - (code.commission_payee || 0);
    await base44.entities.CodePromo.update(code.id, {
      commission_payee: code.commission_due,
      statut_paiement: "À jour",
    });
    toast.success("Commission marquée comme payée !");
    setPaiementEnCours(prev => ({ ...prev, [code.id]: false }));
    loadData();
  };

  const filtres = [
    { val: "tous", label: "Tous" },
    { val: "en_attente", label: "À valider" },
    { val: "valide", label: "Validés" },
    { val: "doit", label: "Commission due" },
  ];

  const filtres_commerciaux = commerciaux.filter(c => {
    if (filtre === "en_attente") return !c.profil_valide || c.statut_validation_commercial === "en_attente";
    if (filtre === "valide") return c.profil_valide;
    if (filtre === "doit") {
      const code = getCodeForCommercial(c.email);
      return code && code.statut_paiement === "Doit";
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MessageAlert newMsg={newMsg} />
      {newMsg && <div className="h-24" />}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Gérer les commerciaux</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="p-3 rounded-xl bg-card border">
          <p className="font-bold text-lg">{commerciaux.length}</p>
          <p className="text-muted-foreground">Total</p>
        </div>
        <div className="p-3 rounded-xl bg-card border">
          <p className="font-bold text-lg text-green-600">{codes.filter(c => c.statut === "valide").length}</p>
          <p className="text-muted-foreground">Codes actifs</p>
        </div>
        <div className="p-3 rounded-xl bg-card border">
          <p className="font-bold text-lg text-amber-600">{codes.reduce((s, c) => s + ((c.commission_due || 0) - (c.commission_payee || 0)), 0).toLocaleString()} F</p>
          <p className="text-muted-foreground">Dû total</p>
        </div>
      </div>

      {/* Btn commissions dues */}
      <Button className="w-full" onClick={() => setShowCommissionsDues(true)}>
        💰 Voir les commissions dues
      </Button>

      {/* Filtres */}
      <div className="grid grid-cols-2 gap-2">
        {filtres.map(f => {
          const FILTRE_EMOJI = { tous: "👥", en_attente: "⏳", valide: "✅", doit: "💰" };
          return (
            <button
              key={f.val}
              onClick={() => setFiltre(f.val)}
              className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl border transition-all ${
                filtre === f.val
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card border-border hover:bg-muted"
              }`}
            >
              <span className="text-2xl">{FILTRE_EMOJI[f.val]}</span>
              <span className="text-xs font-medium">{f.label}</span>
            </button>
          );
        })}
      </div>

      {/* Liste */}
      <div className="space-y-3">
        {filtres_commerciaux.map(commercial => {
          const code = getCodeForCommercial(commercial.email);
          const commissionRestante = code ? (code.commission_due || 0) - (code.commission_payee || 0) : 0;
          return (
            <Card key={commercial.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary flex-shrink-0">
                    {commercial.full_name?.charAt(0) || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{commercial.full_name}</p>
                    <p className="text-xs text-muted-foreground">{commercial.telephone}</p>
                    <p className="text-xs text-muted-foreground">{commercial.quartier}</p>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      commercial.profil_valide ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      {commercial.profil_valide ? "Validé" : "En attente"}
                    </span>
                    {code && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        code.statut === "valide" ? "bg-green-100 text-green-700" :
                        code.statut === "refuse" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        Code: {code.statut === "valide" ? "Actif" : code.statut === "refuse" ? "Refusé" : "À valider"}
                      </span>
                    )}
                    {code && commissionRestante > 0 && (
                      <div className="text-right mt-1 pt-1 border-t border-border/50">
                        <p className="text-[11px] font-bold text-amber-600">{commissionRestante.toLocaleString()} F</p>
                        <p className="text-[10px] text-muted-foreground">À payer</p>
                      </div>
                    )}
                  </div>
                </div>

                {code && (
                  <div className="grid grid-cols-3 gap-2 text-center text-xs bg-muted/50 rounded-lg p-2">
                    <div>
                      <p className="font-bold text-base">{code.code}</p>
                      <p className="text-muted-foreground">Code</p>
                    </div>
                    <div>
                      <p className="font-bold text-base">{code.nombre_utilisations || 0}</p>
                      <p className="text-muted-foreground">Clients</p>
                    </div>
                    <div>
                      <p className={`font-bold text-base ${commissionRestante > 0 ? "text-amber-600" : "text-green-600"}`}>
                        {commissionRestante} F
                      </p>
                      <p className="text-muted-foreground">Dû</p>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm" variant="outline" className="h-7 text-xs flex-1"
                    onClick={() => { setSelected(commercial); setSelectedCode(code); setDialogOpen(true); }}
                  >
                    <Eye className="h-3 w-3 mr-1" /> Voir profil
                  </Button>
                  {code && commissionRestante > 0 && (
                    <Button
                      size="sm" variant="outline" className="h-7 text-xs flex-1"
                      onClick={() => { setSelected(commercial); setSelectedCode(code); setDialogPaiement(true); setFormPaiement({ montant: String(commissionRestante), mode: "" }); }}
                    >
                      <Wallet className="h-3 w-3 mr-1" /> Payer comm.
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtres_commerciaux.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-sm">Aucun commercial trouvé</p>
          </div>
        )}
      </div>

      {/* Dialog profil */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setDialogTab("profil"); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Profil commercial</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              {/* Tabs */}
              <div className="flex gap-2 border-b pb-2">
                {[{val:"profil",label:"Profil"},{val:"messages",label:"💬 Chat"}].map(t => (
                  <button key={t.val} onClick={() => setDialogTab(t.val)}
                    className={`text-sm font-medium px-3 py-1 rounded-full transition-colors ${
                      dialogTab === t.val ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"
                    }`}>{t.label}</button>
                ))}
              </div>

              {dialogTab === "messages" ? (
                <ChatAdmin userEmail={selected.email} userRole="commercial" currentUser={adminUser} />
              ) : (
                <>
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                  {selected.full_name?.charAt(0)}
                </div>
                <div>
                  <p className="font-bold">{selected.full_name}</p>
                  <p className="text-sm text-muted-foreground">{selected.telephone}</p>
                  <p className="text-sm text-muted-foreground">{selected.quartier}</p>
                  <p className="text-xs text-muted-foreground">Inscrit le {moment(selected.created_date).format("DD/MM/YYYY")}</p>
                </div>
              </div>

              {/* Validation profil */}
              {!selected.profil_valide && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Validation du profil</p>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 border-red-300 text-red-600" onClick={() => refuserProfil(selected)}>
                      <XCircle className="h-4 w-4 mr-1" /> Refuser
                    </Button>
                    <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => validerProfil(selected)}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Valider profil
                    </Button>
                  </div>
                </div>
              )}

              {/* Validation code */}
              {selectedCode && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Code promo : <span className="font-black text-primary">{selectedCode.code}</span></p>
                  <div className="grid grid-cols-2 gap-2 text-xs text-center bg-muted/50 rounded-lg p-3">
                    <div><p className="font-bold">{selectedCode.nombre_utilisations || 0}</p><p className="text-muted-foreground">Utilisations</p></div>
                    <div><p className="font-bold text-amber-600">{(selectedCode.commission_due || 0) - (selectedCode.commission_payee || 0)} F</p><p className="text-muted-foreground">Dû</p></div>
                  </div>
                  {selectedCode.statut === "en_attente" && (
                    <>
                      <div className="space-y-1">
                        <Label>Motif de refus (si refus)</Label>
                        <Input placeholder="Ex: Code inapproprié..." value={motifRefus} onChange={e => setMotifRefus(e.target.value)} />
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1 border-red-300 text-red-600" onClick={() => refuserCode(selectedCode)}>
                          <XCircle className="h-4 w-4 mr-1" /> Refuser code
                        </Button>
                        <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => validerCode(selectedCode)}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Valider code
                        </Button>
                      </div>
                    </>
                  )}
                  {selectedCode.statut === "valide" && (
                    <Button variant="outline" className="w-full border-red-300 text-red-600" onClick={() => { setMotifRefus("Suspendu par l'administration"); refuserCode({...selectedCode}); }}>
                      Suspendre le code
                    </Button>
                  )}
                </div>
              )}
              </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog paiement */}
      <Dialog open={dialogPaiement} onOpenChange={setDialogPaiement}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payer la commission</DialogTitle>
          </DialogHeader>
          {selected && selectedCode && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted text-sm">
                <p className="font-medium">{selected.full_name}</p>
                <p className="text-muted-foreground">Commission restante : <strong className="text-amber-600">{(selectedCode.commission_due || 0) - (selectedCode.commission_payee || 0)} FCFA</strong></p>
              </div>
              <div className="space-y-1">
                <Label>Montant (FCFA)</Label>
                <Input type="number" value={formPaiement.montant} onChange={e => setFormPaiement({ ...formPaiement, montant: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Mode de paiement</Label>
                <div className="grid grid-cols-2 gap-2">
                  {MODES_PAIEMENT.map(m => (
                    <button
                      key={m}
                      onClick={() => setFormPaiement({ ...formPaiement, mode: m })}
                      className={`p-2 rounded-lg border text-xs font-medium transition-all ${formPaiement.mode === m ? "border-primary bg-primary/10 text-primary" : "border-border"}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <Button className="w-full" onClick={enregistrerPaiement} disabled={saving}>
                {saving ? "Enregistrement..." : "Confirmer le paiement"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Commissions dues */}
      <Dialog open={showCommissionsDues} onOpenChange={setShowCommissionsDues}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Commissions dues</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {codes
              .filter(c => c.statut === "valide" && (c.commission_due || 0) - (c.commission_payee || 0) > 0)
              .map(code => {
                const commercial = commerciaux.find(c => c.email === code.commercial_email);
                const montantDu = (code.commission_due || 0) - (code.commission_payee || 0);
                return (
                  <div key={code.id} className="p-3 rounded-lg border bg-card space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-sm">{commercial?.full_name || "Commercial"}</p>
                        <p className="text-xs text-muted-foreground">{code.code}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-amber-600">{montantDu} F</p>
                        <p className="text-xs text-muted-foreground">Dû</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="w-full h-7 text-xs"
                      onClick={() => marquerCommePayeDirectement(code)}
                      disabled={paiementEnCours[code.id]}
                    >
                      {paiementEnCours[code.id] ? "Enregistrement..." : "✅ Marquer comme payé"}
                    </Button>
                  </div>
                );
              })}
            {codes.filter(c => c.statut === "valide" && (c.commission_due || 0) - (c.commission_payee || 0) > 0).length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">Aucune commission due</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
      </div>
      );
      }