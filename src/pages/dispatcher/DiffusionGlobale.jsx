import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Send, Clock, Users, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import moment from "moment";

const TYPES = [
  { value: "info",    label: "ℹ️ Info",     desc: "Information générale" },
  { value: "alerte",  label: "🚨 Alerte",   desc: "Urgent / attention" },
  { value: "promo",   label: "💰 Promo",    desc: "Offre / bonus" },
  { value: "systeme", label: "⚙️ Système",  desc: "Mise à jour / maintenance" },
];

const CIBLES = [
  { value: "tous",        label: "👥 Tous les utilisateurs",   color: "border-primary bg-primary/10 text-primary" },
  { value: "client",      label: "👤 Clients",                 color: "border-blue-400 bg-blue-50 text-blue-700" },
  { value: "livreur",     label: "🛵 Livreurs",                color: "border-green-400 bg-green-50 text-green-700" },
  { value: "partenaire",  label: "🏪 Partenaires",             color: "border-purple-400 bg-purple-50 text-purple-700" },
  { value: "commercial",  label: "📣 Commerciaux",             color: "border-orange-400 bg-orange-50 text-orange-700" },
];

const MESSAGES_RAPIDES = [
  { titre: "Courses disponibles 🚀", message: "Beaucoup de courses disponibles en ce moment ! Mettez-vous en ligne pour gagner de l'argent maintenant." },
  { titre: "Bonus Bedou 💰", message: "Rechargez votre Bedou maintenant et bénéficiez d'un bonus supplémentaire. Offre limitée !" },
  { titre: "CDL 100% Bedou 🎉", message: "CDL est désormais 100% Bedou. Tous vos paiements se font via votre portefeuille Bedou. Rechargez dès maintenant !" },
  { titre: "Revenez sur CDL 👋", message: "Vous nous manquez ! Des opportunités de courses vous attendent sur CDL. Reconnectez-vous maintenant." },
];

const STATUT_CFG = {
  envoye:   { label: "Envoyé",    class: "bg-green-100 text-green-700" },
  en_cours: { label: "En cours",  class: "bg-amber-100 text-amber-700" },
  echec:    { label: "Échec",     class: "bg-red-100 text-red-700" },
};

export default function DiffusionGlobale() {
  const navigate = useNavigate();
  const [titre, setTitre] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("info");
  const [cibles, setCibles] = useState(["tous"]);
  const [sending, setSending] = useState(false);
  const [historique, setHistorique] = useState([]);
  const [tab, setTab] = useState("composer"); // composer | historique

  const loadHistorique = async () => {
    const data = await base44.entities.Diffusion.list('-created_date', 50);
    setHistorique(data);
  };

  useEffect(() => { loadHistorique(); }, []);

  const toggleCible = (val) => {
    if (val === "tous") {
      setCibles(["tous"]);
      return;
    }
    // Si on sélectionne un profil spécifique, retirer "tous"
    setCibles(prev => {
      const without = prev.filter(c => c !== "tous");
      return without.includes(val)
        ? without.filter(c => c !== val) || ["tous"]
        : [...without, val];
    });
  };

  const handleRapide = (msg) => {
    setTitre(msg.titre);
    setMessage(msg.message);
  };

  const handleEnvoyer = async () => {
    if (!titre.trim() || !message.trim()) return toast.error("Titre et message requis");
    if (cibles.length === 0) return toast.error("Choisissez au moins une cible");

    setSending(true);
    const result = await base44.functions.invoke('envoyerDiffusion', {
      titre: titre.trim(),
      message: message.trim(),
      type,
      destinataires: cibles,
    });
    setSending(false);

    if (result.data?.success) {
      toast.success(`✅ Diffusion envoyée à ${result.data.nb_destinataires} utilisateur(s) !`);
      setTitre("");
      setMessage("");
      setType("info");
      setCibles(["tous"]);
      loadHistorique();
      setTab("historique");
    } else {
      toast.error(result.data?.error || "Erreur lors de l'envoi");
    }
  };

  return (
    <div className="space-y-4 pb-16">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-2xl">📢</span>
          <h1 className="text-xl font-bold">Diffusion globale</h1>
        </div>
        <Button variant="outline" size="icon" className="ml-auto" onClick={loadHistorique}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { key: "composer",   label: "✍️ Composer" },
          { key: "historique", label: `📋 Historique (${historique.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
              tab === t.key ? "bg-primary text-white" : "bg-muted text-muted-foreground"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "composer" && (
        <div className="space-y-4">
          {/* Messages rapides */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">⚡ Messages rapides</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {MESSAGES_RAPIDES.map((msg, i) => (
                <button key={i} onClick={() => handleRapide(msg)}
                  className="w-full text-left p-3 rounded-lg border hover:border-primary hover:bg-primary/5 transition-all">
                  <p className="text-sm font-semibold">{msg.titre}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">{msg.message}</p>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Formulaire */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">📝 Composer un message</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Titre */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Titre *</Label>
                <Input placeholder="Ex: 🚨 Courses urgentes disponibles !" value={titre} onChange={e => setTitre(e.target.value)} />
              </div>

              {/* Message */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Message *</Label>
                <Textarea
                  placeholder="Rédigez votre message ici..."
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground text-right">{message.length} caractères</p>
              </div>

              {/* Type */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Type de message</Label>
                <div className="grid grid-cols-2 gap-2">
                  {TYPES.map(t => (
                    <button key={t.value} onClick={() => setType(t.value)}
                      className={`p-2.5 rounded-xl border-2 text-left transition-all ${
                        type === t.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                      }`}>
                      <p className="text-sm font-semibold">{t.label}</p>
                      <p className="text-[10px] text-muted-foreground">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Destinataires */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Destinataires</Label>
                <div className="space-y-2">
                  {CIBLES.map(c => (
                    <button key={c.value} onClick={() => toggleCible(c.value)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                        cibles.includes(c.value) ? c.color + " border-current" : "border-border hover:bg-muted"
                      }`}>
                      <div className={`h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        cibles.includes(c.value) ? "border-current bg-current" : "border-muted-foreground"
                      }`}>
                        {cibles.includes(c.value) && <CheckCircle2 className="h-3 w-3 text-white" />}
                      </div>
                      <span className="text-sm font-medium">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Aperçu */}
          {(titre || message) && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-primary">👁️ Aperçu de la notification</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="font-semibold text-sm">{TYPES.find(t => t.value === type)?.label.split(' ')[0]} {titre}</p>
                <p className="text-xs text-muted-foreground">{message}</p>
                <p className="text-[10px] text-muted-foreground">→ {cibles.includes("tous") ? "Tous les utilisateurs" : cibles.join(", ")}</p>
              </CardContent>
            </Card>
          )}

          {/* Bouton envoyer */}
          <Button
            className="w-full h-13 text-base font-bold gap-2"
            onClick={handleEnvoyer}
            disabled={sending || !titre.trim() || !message.trim() || cibles.length === 0}
          >
            {sending
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Envoi en cours...</>
              : <><Send className="h-5 w-5" /> 🚀 Envoyer la diffusion</>
            }
          </Button>
        </div>
      )}

      {tab === "historique" && (
        <div className="space-y-3">
          {historique.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg mb-1">📭</p>
              <p className="text-sm">Aucune diffusion envoyée pour l'instant</p>
            </div>
          ) : (
            historique.map(d => {
              const statut = STATUT_CFG[d.statut] || STATUT_CFG.envoye;
              const ciblesArr = (() => { try { return JSON.parse(d.destinataires || '[]'); } catch { return []; } })();
              return (
                <Card key={d.id}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{d.titre}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{d.message}</p>
                      </div>
                      <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold ${statut.class}`}>
                        {statut.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground pt-1 border-t">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {d.nb_destinataires || 0} destinataire(s)
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {moment(d.date_envoi || d.created_date).format("DD/MM/YY HH:mm")}
                      </span>
                      <span>{ciblesArr.includes("tous") ? "👥 Tous" : ciblesArr.join(", ")}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}