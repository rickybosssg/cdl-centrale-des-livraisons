import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, TrendingUp, Wallet, Tag, CheckCircle2, Clock, XCircle, MessageCircle, BarChart2, AlertCircle, Share2, Lock } from "lucide-react";
import ChatAdmin from "@/components/ChatAdmin";
import PromoShare from "@/components/PromoShare";
import { toast } from "sonner";
import moment from "moment";
import { fmt } from "@/lib/formatMoney";

export default function DashboardCommercial({ user }) {
  const navigate = useNavigate();
  const [code, setCode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newCode, setNewCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [tab, setTab] = useState("apercu");
  const [clients, setClients] = useState([]);
  const [clientStats, setClientStats] = useState({});
  const [loadingPerf, setLoadingPerf] = useState(false);
  const [error, setError] = useState(null);
  const [bedou, setBedou] = useState(null);

  // Guard: sécuriser user
  if (!user?.email) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-muted-foreground">Profil non disponible</p>
      </div>
    );
  }

  // Charger code au mount
  useEffect(() => {
    if (user?.email) {
      loadCode();
    }
  }, [user?.email]);

  const loadCode = async () => {
    try {
      setError(null);
      setLoading(true);
      const codes = await base44.entities.CodePromo.filter({ commercial_email: user.email });
      
      if (codes && codes.length > 0) {
        setCode(codes[0]);
        await loadPerformances(codes[0].code);
      } else {
        setCode(null);
        setClients([]);
        setClientStats({});
        setLoadingPerf(false);
      }

      // Charger Bedou
      const bedouRecords = await base44.entities.Bedou.filter({ user_email: user.email });
      if (bedouRecords && bedouRecords.length > 0) {
        setBedou(bedouRecords[0]);
      } else {
        setBedou(null);
      }
    } catch (err) {
      console.error('[DashboardCommercial] loadCode error:', err);
      setError('Erreur chargement: ' + (err?.message || ''));
      setCode(null);
      setClients([]);
      setClientStats({});
      setBedou(null);
    } finally {
      setLoading(false);
    }
  };

  const loadPerformances = async (codeValue) => {
    if (!codeValue) return;
    try {
      setLoadingPerf(true);
      
      const usersWithCode = await base44.entities.User.filter({ code_promo_utilise: codeValue });
      const usersArray = Array.isArray(usersWithCode) ? usersWithCode : [];
      setClients(usersArray);
      
      if (usersArray.length === 0) {
        setClientStats({});
        setLoadingPerf(false);
        return;
      }
      
      const allCourses = await base44.entities.Course.filter({ statut: "livree" }, "-date_livraison", 500);
      const coursesArray = Array.isArray(allCourses) ? allCourses : [];
      
      const stats = {};
      for (const u of usersArray) {
        if (!u?.email) continue;
        const userCourses = coursesArray.filter(c => c?.client_email === u.email);
        if (userCourses.length > 0) {
          const sorted = [...userCourses].sort((a, b) => new Date(a?.created_date) - new Date(b?.created_date));
          const firstCourse = sorted[0];
          stats[u.email] = { 
            firstCourseValidated: true, 
            firstCourseDate: firstCourse?.date_livraison || firstCourse?.created_date 
          };
        } else {
          stats[u.email] = { firstCourseValidated: false, firstCourseDate: null };
        }
      }
      setClientStats(stats || {});
    } catch (err) {
      console.error('[DashboardCommercial] loadPerformances error:', err);
      setClients([]);
      setClientStats({});
    } finally {
      setLoadingPerf(false);
    }
  };

  const creerCode = async () => {
    if (!newCode?.trim() || newCode.length < 4) {
      toast.error("Code: min 4 caractères");
      return;
    }
    if (!user?.email) {
      toast.error("Utilisateur non identifié");
      return;
    }
    
    setCreating(true);
    try {
      const existing = await base44.entities.CodePromo.filter({ code: newCode.toUpperCase() });
      if (existing && existing.length > 0) {
        toast.error("Code déjà utilisé");
        return;
      }
      
      const created = await base44.entities.CodePromo.create({
        commercial_email: user.email,
        commercial_name: user.full_name || '',
        code: newCode.toUpperCase(),
        statut: "en_attente",
        actif: false,
        nombre_utilisations: 0,
        commission_due: 0,
        commission_payee: 0,
        statut_paiement: "À jour",
      });
      
      if (created) {
        setCode(created);
        setNewCode("");
        toast.success("Code créé ! En attente de validation.");
      }
    } catch (err) {
      console.error('[DashboardCommercial] creerCode error:', err);
      toast.error('Erreur: ' + (err?.message || ''));
    } finally {
      setCreating(false);
    }
  };

  // Calculs sécurisés
  const clientsArray = Array.isArray(clients) ? clients : [];
  const statsValues = Object.values(clientStats || {}) || [];
  const nbInscriptions = code?.nombre_utilisations || 0;
  const nbValidations = code?.nombre_validations || 0;
  const nbPremieresCoursesValidees = statsValues.filter(s => s?.firstCourseValidated).length;
  const gainReel = nbValidations * 50; // 50 F par validation
  const balanceBlocked = bedou?.balance_blocked || 0;
  const targetAmount = 5000;
  const progressPercent = Math.min(100, (balanceBlocked / targetAmount) * 100);
  const canWithdraw = balanceBlocked >= targetAmount;

  const statutConfig = {
    en_attente: { label: "En attente", color: "text-amber-600", bg: "bg-amber-50 border-amber-200", icon: Clock },
    valide: { label: "Validé et actif", color: "text-green-600", bg: "bg-green-50 border-green-200", icon: CheckCircle2 },
    refuse: { label: "Refusé", color: "text-red-600", bg: "bg-red-50 border-red-200", icon: XCircle },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
          <p className="text-xs text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 pb-10">
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="font-semibold text-red-700">Erreur</p>
          </div>
          <p className="text-sm text-red-600">{error}</p>
          <Button size="sm" onClick={() => { setError(null); setLoading(true); loadCode(); }}>
            Réessayer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Espace commercial</h1>
          <p className="text-sm text-muted-foreground">Bienvenue, {user?.full_name}</p>
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
            <p className="text-sm font-semibold mb-3">💬 Messages</p>
            <ChatAdmin userEmail={user?.email} userRole="commercial" currentUser={user} />
          </CardContent>
        </Card>
      )}

      {/* NOUVEAU: Afficher progression balance_blocked + règle retrait */}
      {code && (
      <div className="p-4 rounded-xl bg-gradient-to-br from-primary to-blue-600 text-white space-y-3">
      <div className="flex items-center justify-between">
       <div>
         <p className="text-sm font-semibold">Gains bloqués (Parrainage)</p>
         <p className="text-3xl font-black mt-1">{fmt(balanceBlocked)} F</p>
       </div>
       <Lock className={`h-8 w-8 ${canWithdraw ? 'text-green-300' : 'text-white/50'}`} />
      </div>
      <div className="space-y-1">
       <div className="flex justify-between text-xs font-medium">
         <span>Progression déverrouillage</span>
         <span>{Math.round(progressPercent)}%</span>
       </div>
       <div className="w-full bg-white/20 rounded-full h-2">
         <div
           className={`h-2 rounded-full transition-all ${canWithdraw ? 'bg-green-300' : 'bg-white/70'}`}
           style={{ width: `${progressPercent}%` }}
         />
       </div>
       <p className="text-xs text-white/80 pt-1">{canWithdraw ? '✅ Retrait déverrouillé !' : `Encore ${fmt(targetAmount - balanceBlocked)} F`}</p>
      </div>
      </div>
      )}

      {/* Code promo — pas encore de code */}
      {!code ? (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="text-center space-y-2">
              <Tag className="h-10 w-10 text-primary mx-auto" />
              <p className="font-semibold">Créez votre code promo</p>
              <p className="text-xs text-muted-foreground">Gagnez 50 F CFA par client actif</p>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Ex: JEAN2024"
                value={newCode}
                onChange={e => setNewCode(e.target.value.toUpperCase())}
                maxLength={12}
              />
              <Button onClick={creerCode} disabled={creating || !newCode?.trim() || newCode.length < 4}>
                {creating ? "..." : "Créer"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Statut + Actions */}
          <div className="space-y-3">
            {/* Statut du code */}
            {(() => {
              const cfg = statutConfig[code?.statut] || statutConfig.en_attente;
              const Icon = cfg.icon;
              return (
                <div className={`p-4 rounded-xl border ${cfg.bg} flex items-center gap-3`}>
                  <Icon className={`h-5 w-5 ${cfg.color} flex-shrink-0`} />
                  <div className="flex-1">
                    <p className={`font-semibold text-sm ${cfg.color}`}>{cfg.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Code: <strong className="font-mono">{code?.code}</strong>
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Boutons parrainage */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => {
                    navigator.clipboard.writeText(`https://cdl.base44.app/signup?ref=${code?.code}`);
                    toast.success('Lien copié !');
                  }}
                >
                  📋 Copier lien
                </Button>
                <Button
                  className="flex-1 gap-2 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => {
                    const message = encodeURIComponent(
                      `🚀 Rejoins CDL et gagne de l'argent !\n\nUtilise mon code promo : ${code?.code}\n\nInscris-toi ici :\nhttps://cdl.base44.app/signup?ref=${code?.code}`
                    );
                    window.open(`https://wa.me/?text=${message}`, '_blank');
                  }}
                >
                  📲 Partager WhatsApp
                </Button>
              </div>
              <div className="text-xs text-muted-foreground text-center">
                Lien: <span className="font-mono bg-muted px-2 py-1 rounded text-primary font-semibold">https://cdl.base44.app/signup?ref={code?.code}</span>
              </div>
            </div>
          </div>

          {/* UX message */}
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800">
            💡 Partagez votre code pour gagner <strong>50 F CFA</strong> par client ayant complété sa première course !
          </div>

          {/* Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[{k:"apercu",l:"Aperçu"},{k:"performances",l:"Performances"},{k:"historique",l:"Historique"}].map(t => (
              <button key={t.k} onClick={() => setTab(t.k)}
                className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                  tab === t.k ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                }`}>{t.l}</button>
            ))}
          </div>

          {/* APERÇU */}
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
                    <p className="text-2xl font-bold text-green-600">{nbValidations}</p>
                    <p className="text-xs text-muted-foreground">Validées</p>
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-primary" />
                    Commissions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-center text-xs">
                      <div className="p-2 rounded-lg bg-blue-50">
                        <p className="font-bold text-base text-blue-600">{fmt(gainReel)} F</p>
                        <p className="text-muted-foreground">Gains bloqués</p>
                      </div>
                      <div className="p-2 rounded-lg bg-green-50">
                        <p className="font-bold text-base text-green-600">{canWithdraw ? '✅ Possible' : '🔒 Min 5000 F'}</p>
                        <p className="text-muted-foreground">Retrait</p>
                      </div>
                    </div>
                  </CardContent>
              </Card>
            </>
          )}

          {/* PERFORMANCES */}
          {tab === "performances" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Inscriptions</p>
                    <p className="text-3xl font-black text-primary">{nbInscriptions}</p>
                  </CardContent>
                </Card>
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">1ères courses</p>
                    <p className="text-3xl font-black text-green-700">{nbPremieresCoursesValidees}</p>
                  </CardContent>
                </Card>
                <Card className="bg-amber-50 border-amber-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-amber-700 mb-1">Taux conversion</p>
                    <p className="text-3xl font-black text-amber-700">{nbInscriptions > 0 ? Math.round(nbPremieresCoursesValidees / nbInscriptions * 100) : 0}%</p>
                  </CardContent>
                </Card>
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-green-700 mb-1">Gains</p>
                    <p className="text-3xl font-black text-green-700">{gainReel} <span className="text-sm">F</span></p>
                  </CardContent>
                </Card>
              </div>
              {loadingPerf && <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" /></div>}
            </div>
          )}

          {/* HISTORIQUE */}
          {tab === "historique" && (
            <div className="space-y-3">
              <p className="text-sm font-semibold">Clients</p>
              {loadingPerf && <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" /></div>}
              {!loadingPerf && clientsArray.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-6">Aucun client</p>
              )}
              {!loadingPerf && clientsArray.map(client => {
                const stat = clientStats?.[client?.email] || {};
                const isValidated = stat?.firstCourseValidated;
                return (
                  <div key={client?.id} className="p-3 rounded-xl border bg-card space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold">{client?.full_name || client?.email}</p>
                        <p className="text-xs text-muted-foreground">Inscrit {moment(client?.created_date).format("DD/MM")}</p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        isValidated ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {isValidated ? "Validé ✅" : "Pending"}
                      </span>
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