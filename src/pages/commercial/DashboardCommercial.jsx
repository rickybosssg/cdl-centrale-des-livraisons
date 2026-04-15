import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Users, CheckCircle2, Clock, XCircle, MessageCircle,
  Share2, Lock, Copy, TrendingUp, Wallet, Tag, ChevronRight,
  Lightbulb, AlertCircle
} from "lucide-react";
import ChatAdmin from "@/components/ChatAdmin";
import PubCDLBanner from "@/components/PubCDLBanner";
import { toast } from "sonner";
import moment from "moment";
import { fmt } from "@/lib/formatMoney";

// ─── Statut dynamique du code (correction rétroactive) ───────────────────────
// Un code est considéré "actif" si :
// - explicitement marqué actif ET valide, OU
// - a déjà des utilisations (lien parrainage déjà utilisé), OU
// - profil commercial validé (actif) avec un code existant
function getCodeStatut(code, profileActif = false) {
  if (!code) return null;
  // Bloqué/refusé en priorité
  if (code.statut === "refuse" || code.statut === "bloque") return "bloque";
  // Actif si marqué actif, OU si utilisations > 0, OU si profil validé avec code
  const hasUsages = (code.nombre_utilisations || 0) > 0;
  const isExplicitlyActive = code.actif === true;
  const isValidStatut = !code.statut || code.statut === "valide" || code.statut === "actif" || code.statut === "en_attente";
  if (isExplicitlyActive || hasUsages || (profileActif && isValidStatut)) return "actif";
  if (code.statut === "refuse") return "bloque";
  return "attente";
}

const CODE_STATUT_CFG = {
  actif:   { label: "Code actif ✅",    color: "text-green-700", bg: "bg-green-50 border-green-300", dot: "bg-green-500" },
  attente: { label: "En attente",        color: "text-amber-700", bg: "bg-amber-50 border-amber-300", dot: "bg-amber-500" },
  bloque:  { label: "Code bloqué",       color: "text-red-700",   bg: "bg-red-50 border-red-300",     dot: "bg-red-500" },
};

// ─── Conseils dynamiques ─────────────────────────────────────────────────────
function getConseils(nbInscriptions, nbValidations, canWithdraw) {
  const tips = [];
  if (nbInscriptions === 0) {
    tips.push("📲 Partagez votre lien WhatsApp à au moins 5 contacts pour commencer à gagner.");
    tips.push("💬 Envoyez votre code dans vos groupes WhatsApp, il sera utilisé rapidement !");
  } else if (nbValidations === 0) {
    tips.push("⏳ Des clients ont utilisé votre code mais n'ont pas encore commandé. Relancez-les !");
    tips.push("💡 Rappel : vous gagnez 50 F dès qu'un filleul effectue sa première course.");
  } else if (!canWithdraw) {
    tips.push(`🎯 Plus que ${fmt(5000 - (nbValidations * 50))} F pour débloquer votre retrait. Continuez !`);
    tips.push("🚀 Plus vous parrainez, plus vite vous atteignez 5 000 F et débloquez vos gains.");
  } else {
    tips.push("🎉 Félicitations ! Votre retrait est débloqué. Continuez à parrainer pour gagner plus.");
  }
  return tips;
}

export default function DashboardCommercial({ user }) {
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
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (user?.email) loadCode();
  }, [user?.email]);

  const loadCode = async () => {
    try {
      setError(null);
      setLoading(true);
      const [codes, bedouRecords, profiles] = await Promise.all([
        base44.entities.CodePromo.filter({ commercial_email: user.email }),
        base44.entities.Bedou.filter({ user_email: user.email }),
        base44.entities.UserProfile.filter({ user_email: user.email, profile_type: "commercial" }),
      ]);
      const c = codes?.[0] || null;
      const prof = profiles?.[0] || null;
      setCode(c);
      setBedou(bedouRecords?.[0] || null);
      setProfile(prof);
      // Correction rétroactive : si le code existe, que le profil est validé et que le code n'est pas encore actif → l'activer
      if (c && prof?.status === "actif" && !c.actif && c.statut !== "refuse") {
        base44.entities.CodePromo.update(c.id, { actif: true, statut: "valide" }).catch(() => {});
      }
      if (c?.code) await loadPerformances(c.code);
    } catch (err) {
      console.error('[DashboardCommercial] loadCode error:', err);
      setError('Erreur chargement: ' + (err?.message || ''));
      setCode(null); setClients([]); setClientStats({}); setBedou(null);
    } finally {
      setLoading(false);
    }
  };

  const loadPerformances = async (codeValue) => {
    if (!codeValue) return;
    try {
      setLoadingPerf(true);
      const usersWithCode = await base44.entities.User.filter({ code_promo_utilise: codeValue });
      const usersArr = Array.isArray(usersWithCode) ? usersWithCode : [];
      setClients(usersArr);
      if (usersArr.length === 0) { setClientStats({}); return; }
      const allCourses = await base44.entities.Course.filter({ statut: "livree" }, "-date_livraison", 500);
      const coursesArr = Array.isArray(allCourses) ? allCourses : [];
      const stats = {};
      for (const u of usersArr) {
        if (!u?.email) continue;
        const userCourses = coursesArr.filter(c => c?.client_email === u.email);
        if (userCourses.length > 0) {
          const sorted = [...userCourses].sort((a, b) => new Date(a?.created_date) - new Date(b?.created_date));
          stats[u.email] = { firstCourseValidated: true, firstCourseDate: sorted[0]?.date_livraison || sorted[0]?.created_date };
        } else {
          stats[u.email] = { firstCourseValidated: false, firstCourseDate: null };
        }
      }
      setClientStats(stats);
    } catch (err) {
      console.error('[DashboardCommercial] loadPerformances error:', err);
      setClients([]); setClientStats({});
    } finally {
      setLoadingPerf(false);
    }
  };

  const creerCode = async () => {
    if (!newCode?.trim() || newCode.length < 4) { toast.error("Code: min 4 caractères"); return; }
    if (!user?.email) { toast.error("Utilisateur non identifié"); return; }
    setCreating(true);
    try {
      const existing = await base44.entities.CodePromo.filter({ code: newCode.toUpperCase() });
      if (existing?.length > 0) { toast.error("Code déjà utilisé"); return; }
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
      if (created) { setCode(created); setNewCode(""); toast.success("Code créé ! En attente de validation."); }
    } catch (err) {
      toast.error('Erreur: ' + (err?.message || ''));
    } finally {
      setCreating(false);
    }
  };

  if (!user?.email) return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-sm text-muted-foreground">Profil non disponible</p></div>;

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-2">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
        <p className="text-xs text-muted-foreground">Chargement...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="p-4 rounded-xl bg-red-50 border border-red-200 space-y-2 m-4">
      <div className="flex items-center gap-2"><AlertCircle className="h-5 w-5 text-red-600" /><p className="font-semibold text-red-700">Erreur</p></div>
      <p className="text-sm text-red-600">{error}</p>
      <Button size="sm" onClick={() => { setError(null); setLoading(true); loadCode(); }}>Réessayer</Button>
    </div>
  );

  // ─── Calculs ───────────────────────────────────────────────────────────────
  const statsValues = Object.values(clientStats || {});
  const nbInscriptions = code?.nombre_utilisations || 0;
  const nbValidations = code?.nombre_validations || 0;
  const nbPremieresCoursesValidees = statsValues.filter(s => s?.firstCourseValidated).length;
  const gainReel = nbValidations * 50;
  const gainDisponible = bedou?.solde_disponible || 0;
  const gainBloque = bedou?.balance_blocked || 0;
  const gainTotal = bedou?.gains_totaux || gainReel;
  const targetAmount = 5000;
  const progressPercent = Math.min(100, (gainBloque / targetAmount) * 100);
  const canWithdraw = gainBloque >= targetAmount;
  const profileActif = profile?.status === "actif";
  const codeStatut = getCodeStatut(code, profileActif);
  const statutCfg = CODE_STATUT_CFG[codeStatut] || CODE_STATUT_CFG.attente;
  const isCodeActif = codeStatut === "actif";
  const shareLink = `https://cdl.base44.app/signup?ref=${code?.code}`;
  const shareMsg = `🚀 Rejoins CDL — livraison rapide à Ouaga !\nUtilise mon code : *${code?.code}*\n👉 ${shareLink}`;
  const conseils = getConseils(nbInscriptions, nbValidations, canWithdraw);
  const prenom = user.full_name?.split(" ")[0] || "Commercial";

  return (
    <div className="space-y-5 pb-20">

      {/* ── 1. HEADER ── */}
      <div className="bg-gradient-to-br from-primary to-blue-700 px-4 pt-4 pb-6 rounded-b-3xl text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-white/70">Bonjour 👋</p>
            <h1 className="text-xl font-extrabold">{prenom}</h1>
            <p className="text-xs text-white/60 mt-0.5">Tableau de gains</p>
          </div>
          <button
            onClick={() => setShowMessages(!showMessages)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/20 text-sm font-medium border border-white/30"
          >
            <MessageCircle className="h-4 w-4" />
            Messages
          </button>
        </div>

        {/* ── 2. GAINS ── */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Disponible",  value: fmt(gainDisponible), color: "text-green-300",  icon: "💰" },
            { label: "Bloqués",     value: fmt(gainBloque),     color: "text-amber-300",  icon: "🔒" },
            { label: "Total gagné", value: fmt(gainTotal),      color: "text-white",      icon: "📈" },
          ].map((g, i) => (
            <div key={i} className="bg-white/15 rounded-xl p-3 text-center">
              <p className="text-lg">{g.icon}</p>
              <p className={`text-base font-extrabold ${g.color}`}>{g.value}</p>
              <p className="text-[10px] text-white/70 mt-0.5">{g.label}</p>
            </div>
          ))}
        </div>
      </div>

      {showMessages && (
        <div className="px-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-semibold mb-3">💬 Messages CDL</p>
              <ChatAdmin userEmail={user?.email} userRole="commercial" currentUser={user} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── 3. PROGRESSION ── */}
      {code && (
        <div className="px-4">
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">Progression vers retrait</p>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${canWithdraw ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                {canWithdraw ? "Débloqué ✅" : `${fmt(targetAmount - gainBloque)} restants`}
              </span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{fmt(gainBloque)} F</span>
                <span>Objectif : {fmt(targetAmount)} F</span>
              </div>
              <div className="w-full bg-muted rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all duration-700 ${canWithdraw ? 'bg-green-500' : 'bg-primary'}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {canWithdraw
                  ? "🎉 Vous pouvez retirer vos gains ! Contactez l'admin."
                  : `Parrainez encore ${Math.ceil((targetAmount - gainBloque) / 50)} client(s) actif(s) pour débloquer.`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── 4. CODE ── */}
      {!code ? (
        <div className="px-4">
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="text-center space-y-2">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <Tag className="h-7 w-7 text-primary" />
                </div>
                <p className="font-bold">Créez votre code promo</p>
                <p className="text-xs text-muted-foreground">Gagnez <strong>50 F CFA</strong> par client ayant fait sa 1ère course</p>
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
        </div>
      ) : (
        <>
          {/* Statut du code */}
          <div className="px-4">
            <div className={`flex items-center gap-3 p-4 rounded-2xl border ${statutCfg.bg}`}>
              <span className={`h-3 w-3 rounded-full flex-shrink-0 ${statutCfg.dot} ${codeStatut === 'actif' ? 'animate-pulse' : ''}`} />
              <div className="flex-1">
                <p className={`font-bold text-sm ${statutCfg.color}`}>{statutCfg.label}</p>
                {codeStatut === 'attente' && <p className="text-xs text-muted-foreground mt-0.5">Validation admin en cours — généralement 24h</p>}
                {codeStatut === 'bloque' && <p className="text-xs text-muted-foreground mt-0.5">Contactez l'administration pour plus d'informations</p>}
              </div>
              <span className="font-mono font-extrabold text-lg tracking-widest">{code.code}</span>
            </div>
          </div>

          {/* Boutons partage — uniquement si code actif */}
          {isCodeActif && (
            <div className="px-4 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { navigator.clipboard.writeText(shareLink); toast.success("Lien copié !"); }}
                  className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-border bg-card hover:bg-muted active:scale-95 transition-all text-sm font-semibold"
                >
                  <Copy className="h-4 w-4 text-primary" />
                  Copier le lien
                </button>
                <button
                  onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareMsg)}`, '_blank')}
                  className="flex items-center justify-center gap-2 p-3 rounded-xl bg-green-600 text-white hover:bg-green-700 active:scale-95 transition-all text-sm font-semibold"
                >
                  <Share2 className="h-4 w-4" />
                  WhatsApp
                </button>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shareMsg);
                  toast.success("Message copié !");
                }}
                className="w-full flex items-center gap-2 p-3 rounded-xl border border-dashed border-primary/50 bg-primary/5 text-primary text-sm font-medium hover:bg-primary/10 active:scale-95 transition-all"
              >
                <Copy className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">Copier le message complet</span>
              </button>
              <p className="text-[10px] text-muted-foreground text-center font-mono bg-muted px-3 py-1 rounded-lg truncate">
                {shareLink}
              </p>
            </div>
          )}

          {/* ── 5. PERFORMANCE ── */}
          <div className="px-4 space-y-3">
            <p className="text-sm font-bold">Performance</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Inscriptions",    value: nbInscriptions,             color: "text-primary",    bg: "bg-primary/5 border-primary/20" },
                { label: "1ères courses",   value: nbPremieresCoursesValidees, color: "text-green-700",  bg: "bg-green-50 border-green-200" },
                { label: "Gains (F)",       value: fmt(gainReel),              color: "text-amber-700",  bg: "bg-amber-50 border-amber-200" },
              ].map((s, i) => (
                <Card key={i} className={`border ${s.bg}`}>
                  <CardContent className="p-3 text-center">
                    <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{s.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* ── Tabs Historique ── */}
          <div className="px-4 space-y-3">
            <div className="flex gap-2">
              {[{k:"apercu",l:"Aperçu"},{k:"historique",l:"Clients"}].map(t => (
                <button key={t.k} onClick={() => setTab(t.k)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                    tab === t.k ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                  }`}>{t.l}</button>
              ))}
            </div>

            {tab === "apercu" && (
              <div className="space-y-2">
                {[
                  { icon: Users,        label: "Clients inscrits avec mon code", value: nbInscriptions },
                  { icon: CheckCircle2, label: "1ères courses validées",         value: nbPremieresCoursesValidees },
                  { icon: TrendingUp,   label: "Taux de conversion",             value: nbInscriptions > 0 ? `${Math.round((nbPremieresCoursesValidees / nbInscriptions) * 100)}%` : "0%" },
                  { icon: Wallet,       label: "Gains réels générés",            value: `${fmt(gainReel)} F` },
                ].map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <p className="flex-1 text-sm text-muted-foreground">{item.label}</p>
                      <p className="font-bold text-sm">{item.value}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === "historique" && (
              <div className="space-y-2">
                {loadingPerf && <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" /></div>}
                {!loadingPerf && clients.length === 0 && (
                  <div className="text-center py-8 space-y-2">
                    <Users className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                    <p className="text-sm text-muted-foreground">Aucun client pour l'instant</p>
                    <p className="text-xs text-muted-foreground">Partagez votre code pour commencer !</p>
                  </div>
                )}
                {!loadingPerf && clients.map(client => {
                  const stat = clientStats?.[client?.email] || {};
                  return (
                    <div key={client?.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-sm font-bold text-muted-foreground">
                        {(client?.full_name || client?.email || "?")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{client?.full_name || client?.email}</p>
                        <p className="text-[10px] text-muted-foreground">Inscrit {moment(client?.created_date).format("DD/MM/YY")}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${
                        stat?.firstCourseValidated ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {stat?.firstCourseValidated ? "+50 F ✅" : "En attente"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Publicité CDL ── */}
      <div className="px-4">
        <PubCDLBanner placement="dashboard_commercial" userRole="commercial" />
      </div>

      {/* ── 6. CONSEILS DYNAMIQUES ── */}
      <div className="px-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Lightbulb className="h-3.5 w-3.5" />Conseils pour gagner plus
        </p>
        {conseils.map((tip, i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100">
            <p className="text-sm text-blue-800">{tip}</p>
          </div>
        ))}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50 border border-border">
          <p className="text-xs text-muted-foreground">
            💡 Règle : vous gagnez <strong>50 F CFA</strong> par client ayant effectué sa 1ère course. Le retrait est possible dès <strong>5 000 F</strong> de gains bloqués.
          </p>
        </div>
      </div>
    </div>
  );
}