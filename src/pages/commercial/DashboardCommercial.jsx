import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, TrendingUp, Wallet, Tag, CheckCircle2, Clock, XCircle, MessageCircle, User } from "lucide-react";
import ChatAdmin from "@/components/ChatAdmin";
import { toast } from "sonner";

export default function DashboardCommercial({ user }) {
  const navigate = useNavigate();
  const [code, setCode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newCode, setNewCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [showMessages, setShowMessages] = useState(false);

  useEffect(() => {
    loadCode();
  }, []);

  const loadCode = async () => {
    const codes = await base44.entities.CodePromo.filter({ commercial_email: user.email });
    if (codes.length > 0) setCode(codes[0]);
    setLoading(false);
  };

  const creerCode = async () => {
    if (!newCode.trim() || newCode.length < 4) {
      toast.error("Le code doit avoir au moins 4 caractères");
      return;
    }
    setCreating(true);
    // Vérifier si le code existe déjà
    const existing = await base44.entities.CodePromo.filter({ code: newCode.toUpperCase() });
    if (existing.length > 0) {
      toast.error("Ce code est déjà utilisé, choisissez-en un autre");
      setCreating(false);
      return;
    }
    const created = await base44.entities.CodePromo.create({
      commercial_email: user.email,
      commercial_name: user.full_name,
      code: newCode.toUpperCase(),
      statut: "en_attente",
      actif: false,
      nombre_utilisations: 0,
      commission_due: 0,
      commission_payee: 0,
      statut_paiement: "À jour",
    });
    setCode(created);
    toast.success("Code créé ! En attente de validation par l'administration.");
    setCreating(false);
  };

  const statutConfig = {
    en_attente: { label: "En attente de validation", color: "text-amber-600", bg: "bg-amber-50 border-amber-200", icon: Clock },
    valide: { label: "Code validé et actif", color: "text-green-600", bg: "bg-green-50 border-green-200", icon: CheckCircle2 },
    refuse: { label: "Code refusé", color: "text-red-600", bg: "bg-red-50 border-red-200", icon: XCircle },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const commissionRestante = (code?.commission_due || 0) - (code?.commission_payee || 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Mon espace commercial</h1>
          <p className="text-sm text-muted-foreground">Bienvenue, {user.full_name}</p>
        </div>
        <button
          onClick={() => setShowMessages(!showMessages)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
            showMessages ? "bg-primary text-white border-primary" : "bg-card border-border"
          }`}
        >
          <MessageCircle className="h-4 w-4" />
          Messages
        </button>
      </div>

      {showMessages && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold mb-3">💬 Discussion avec l'Administration</p>
            <ChatAdmin userEmail={user.email} userRole="commercial" currentUser={user} />
          </CardContent>
        </Card>
      )}

      {/* Profil en attente de validation */}
      {!user.profil_valide && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600" />
            <p className="text-sm font-semibold text-amber-700">Profil en attente de validation</p>
          </div>
          <p className="text-xs text-amber-600 mt-1">L'administration doit valider votre compte avant que vous puissiez utiliser votre code promo.</p>
        </div>
      )}

      {/* Code promo */}
      {!code ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" />
              Créer mon code promotionnel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Choisissez un code unique (ex: JOHN2024). Vos clients l'utiliseront pour bénéficier de 20% de réduction sur leur première course.
            </p>
            <div className="space-y-2">
              <Label>Votre code promo</Label>
              <Input
                placeholder="Ex: JOHN2024"
                value={newCode}
                onChange={e => setNewCode(e.target.value.toUpperCase())}
                maxLength={15}
              />
            </div>
            <Button className="w-full" onClick={creerCode} disabled={creating || !newCode.trim()}>
              {creating ? "Création..." : "Créer le code"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Statut du code */}
          {(() => {
            const cfg = statutConfig[code.statut] || statutConfig.en_attente;
            const Icon = cfg.icon;
            return (
              <div className={`p-4 rounded-xl border ${cfg.bg} flex items-center gap-3`}>
                <Icon className={`h-5 w-5 ${cfg.color}`} />
                <div>
                  <p className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</p>
                  {code.motif_refus && <p className="text-xs text-red-600 mt-0.5">Motif : {code.motif_refus}</p>}
                </div>
              </div>
            );
          })()}

          {/* Code affiché */}
          <Card className="bg-primary text-white">
            <CardContent className="p-6 text-center">
              <p className="text-xs text-white/70 mb-1">Mon code promotionnel</p>
              <p className="text-4xl font-black tracking-widest">{code.code}</p>
              <p className="text-xs text-white/70 mt-2">Partagez ce code pour que vos clients bénéficient de 20% de réduction</p>
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4 text-center">
                <Users className="h-6 w-6 text-primary mx-auto mb-1" />
                <p className="text-2xl font-bold">{code.nombre_utilisations || 0}</p>
                <p className="text-xs text-muted-foreground">Clients recrutés</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <TrendingUp className="h-6 w-6 text-green-600 mx-auto mb-1" />
                <p className="text-2xl font-bold">{(code.nombre_utilisations || 0) * 50}</p>
                <p className="text-xs text-muted-foreground">FCFA gagnés</p>
              </CardContent>
            </Card>
          </div>

          {/* Paiement */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                Mes commissions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 rounded-lg bg-muted">
                  <p className="font-bold text-base">{code.commission_due || 0} F</p>
                  <p className="text-muted-foreground">Total dû</p>
                </div>
                <div className="p-2 rounded-lg bg-green-50">
                  <p className="font-bold text-base text-green-600">{code.commission_payee || 0} F</p>
                  <p className="text-muted-foreground">Payé</p>
                </div>
                <div className={`p-2 rounded-lg ${commissionRestante > 0 ? "bg-amber-50" : "bg-green-50"}`}>
                  <p className={`font-bold text-base ${commissionRestante > 0 ? "text-amber-600" : "text-green-600"}`}>
                    {commissionRestante} F
                  </p>
                  <p className="text-muted-foreground">Restant</p>
                </div>
              </div>
              <div className={`p-3 rounded-lg border text-center text-sm font-medium ${
                code.statut_paiement === "À jour" ? "bg-green-50 border-green-200 text-green-700" : "bg-amber-50 border-amber-200 text-amber-700"
              }`}>
                {code.statut_paiement === "À jour" ? "✅ Vous êtes à jour" : "⏳ Paiement en attente"}
              </div>
              <p className="text-[10px] text-muted-foreground text-center">50 FCFA par nouveau client utilisant votre code</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}