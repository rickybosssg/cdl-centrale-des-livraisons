import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, TrendingUp, Wallet, Tag, CheckCircle2, Clock, XCircle, MessageCircle, User, BarChart2 } from "lucide-react";
import ChatAdmin from "@/components/ChatAdmin";
import PromoShare from "@/components/PromoShare";
import { toast } from "sonner";
import moment from "moment";

export default function DashboardCommercial({ user }) {
  const navigate = useNavigate();
  const [code, setCode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newCode, setNewCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [tab, setTab] = useState("apercu");
  const [clients, setClients] = useState([]); // users who used the code
  const [clientStats, setClientStats] = useState({}); // email -> { firstCourseValidated, firstCourseDate }
  const [loadingPerf, setLoadingPerf] = useState(false);

  useEffect(() => {
    loadCode();
  }, []);

  const loadCode = async () => {
    const codes = await base44.entities.CodePromo.filter({ commercial_email: user.email });
    if (codes.length > 0) {
      setCode(codes[0]);
      await loadPerformances(codes[0].code);
    }
    setLoading(false);
  };

  const loadPerformances = async (codeValue) => {
    setLoadingPerf(true);
    // Get all users who used this promo code
    const usersWithCode = await base44.entities.User.filter({ code_promo_utilise: codeValue });
    setClients(usersWithCode);
    if (usersWithCode.length === 0) { setLoadingPerf(false); return; }
    // Fetch all completed courses and cross-reference
    const allCourses = await base44.entities.Course.filter({ statut: "livree" }, "-date_livraison", 500);
    const stats = {};
    for (const u of usersWithCode) {
      const userCourses = allCourses.filter(c => c.client_email === u.email);
      if (userCourses.length > 0) {
        // Sort by created_date to find the first course
        const sorted = [...userCourses].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
        stats[u.email] = { firstCourseValidated: true, firstCourseDate: sorted[0].date_livraison || sorted[0].created_date };
      } else {
        stats[u.email] = { firstCourseValidated: false, firstCourseDate: null };
      }
    }
    setClientStats(stats);
    setLoadingPerf(false);
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
  const nbInscriptions = clients.length;
  const nbPremieresCoursesValidees = Object.values(clientStats).filter(s => s.firstCourseValidated).length;
  const gainReel = nbPremieresCoursesValidees * 50;

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

      {/* Tabs (only when code exists) */}
      {code && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[{k:"apercu",l:"Aperçu"},{k:"performances",l:"Performances"},{k:"historique",l:"Historique"}].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                tab === t.k ? "bg-primary text-white" : "bg-muted text-muted-foreground"
              }`}>{t.l}</button>
          ))}
        </div>
      )}

      {/* Code promo — pas encore de code */}
      {!code ? (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="text-center space-y-2">
              <Tag className="h-10 w-10 text-primary mx-auto" />
              <p className="font-semibold">Créez votre code promo</p>
              <p className="text-xs text-muted-foreground">Votre code permettra à de nouveaux clients de s'inscrire. Vous gagnerez 50 F CFA par client ayant effectué sa 1ère course.</p>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Ex: JEAN2024"
                value={newCode}
                onChange={e => setNewCode(e.target.value.toUpperCase())}
                maxLength={12}
              />
              <Button onClick={creerCode} disabled={creating || !newCode.trim() || newCode.length < 4}>
                {creating ? "..." : "Créer"}
              </Button>
            </div>
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
                <Icon className={`h-5 w-5 ${cfg.color} flex-shrink-0`} />
                <div className="flex-1">
                  <p className={`font-semibold text-sm ${cfg.color}`}>{cfg.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Code : <strong className="font-mono text-base tracking-widest">{code.code}</strong></p>
                </div>
                <button
                  onClick={() => { navigator.clipboard.writeText(code.code); toast.success('Code copié !'); }}
                  className="px-3 py-1.5 rounded-lg bg-white border text-xs font-bold hover:bg-primary hover:text-white hover:border-primary transition-colors"
                >
                  📋 Copier
                </button>
              </div>
            );
          })()}

          {/* Message UX */}
          <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-xs text-green-800">
            💡 <strong>Votre code promo est votre source de revenu.</strong> Partagez-le pour gagner <strong>50 F CFA</strong> par client actif !
          </div>

          {/* PROMO SHARE - WhatsApp + Copy link */}
          {code.statut === 'valide' && (
            <PromoShare code={code.code} commercialEmail={user.email} commercialName={user.full_name} />
          )}

          {/* Onglet Aperçu */}
          {tab === "apercu" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <CardContent className="p-4 text-center">
                    <Users className="h-6 w-6 text-primary mx-auto mb-1" />
                    <p className="text-2xl font-bold">{nbInscriptions}</p>
                    <p className="text-xs text-muted-foreground">Inscriptions</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-green-600">{nbPremieresCoursesValidees}</p>
                    <p className="text-xs text-muted-foreground">1ères courses</p>
                  </CardContent>
                </Card>
              </div>
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
                      <p className="font-bold text-base">{gainReel} F</p>
                      <p className="text-muted-foreground">Gagné réel</p>
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
                  <p className="text-[10px] text-muted-foreground text-center">50 F CFA par client ayant effectué sa 1ère course validée</p>
                </CardContent>
              </Card>
            </>
          )}

          {/* ONGLET PERFORMANCES */}
          {tab === "performances" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Inscriptions avec code</p>
                    <p className="text-3xl font-black text-primary">{nbInscriptions}</p>
                  </CardContent>
                </Card>
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">1ères courses validées</p>
                    <p className="text-3xl font-black text-green-700">{nbPremieresCoursesValidees}</p>
                  </CardContent>
                </Card>
                <Card className="bg-amber-50 border-amber-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-amber-700 mb-1">Taux de conversion</p>
                    <p className="text-3xl font-black text-amber-700">{nbInscriptions > 0 ? Math.round(nbPremieresCoursesValidees / nbInscriptions * 100) : 0}%</p>
                  </CardContent>
                </Card>
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-green-700 mb-1">Gains réels</p>
                    <p className="text-3xl font-black text-green-700">{gainReel} <span className="text-sm">F</span></p>
                  </CardContent>
                </Card>
              </div>
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800">
                💡 Vous gagnez <strong>50 F CFA</strong> uniquement quand un client inscrit avec votre code effectue sa <strong>toute première course validée</strong>. Une seule fois par client.
              </div>
              {loadingPerf && <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" /></div>}
            </div>
          )}

          {/* ONGLET HISTORIQUE */}
          {tab === "historique" && (
            <div className="space-y-3">
              <p className="text-sm font-semibold">Clients inscrits avec votre code</p>
              {loadingPerf && <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" /></div>}
              {!loadingPerf && clients.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-6">Aucun client n'a encore utilisé votre code</p>
              )}
              {!loadingPerf && clients.map(client => {
                const stat = clientStats[client.email] || {};
                const isValidated = stat.firstCourseValidated;
                return (
                  <div key={client.id} className="p-3 rounded-xl border bg-card space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold">{client.full_name || client.email}</p>
                        <p className="text-xs text-muted-foreground">Inscrit le {moment(client.created_date).format("DD/MM/YYYY")}</p>
                        {stat.firstCourseDate && (
                          <p className="text-xs text-muted-foreground">1ère course : {moment(stat.firstCourseDate).format("DD/MM/YYYY")}</p>
                        )}
                      </div>
                      <div className="text-right">
                        {isValidated
                          ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Gain validé ✅</span>
                          : <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">1ère course manquante</span>
                        }
                        <p className={`text-sm font-bold mt-1 ${isValidated ? "text-green-600" : "text-muted-foreground"}`}>
                          {isValidated ? "+50 F CFA" : "0 F CFA"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}