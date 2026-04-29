/**
 * GuidedOrderWizard — Parcours de commande guidé en étapes (mobile-first)
 * 8 étapes : Type → Départ → Arrivée → Contact → Colis → Prix → Urgence → Récap
 */
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, MapPin, Package, Phone, Zap, CheckCircle2, Wallet, ChevronRight, Navigation } from "lucide-react";
import { QUARTIERS_OUAGADOUGOU } from "@/lib/quartiers";
import { fmt } from "@/lib/formatMoney";

const TOTAL_STEPS = 8;

const TYPES_COLIS_SUGGESTIONS = [
  { label: "📄 Document", value: "Documents" },
  { label: "🍱 Repas", value: "Nourriture" },
  { label: "📦 Colis", value: "Colis moyen" },
  { label: "⚠️ Fragile", value: "Fragile" },
  { label: "👕 Vêtements", value: "Vêtements" },
  { label: "✏️ Autre", value: "Autre" },
];

const PRIX_SUGGESTIONS = [1000, 1500, 2000, 2500, 3000];

const slideVariants = {
  enter: (dir) => ({ x: dir > 0 ? "100%" : "-100%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? "-100%" : "100%", opacity: 0 }),
};

// Barre de progression
function ProgressBar({ step, total }) {
  return (
    <div className="px-4 pt-2 pb-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground font-medium">Étape {step} / {total}</span>
        <span className="text-xs text-primary font-semibold">{Math.round((step / total) * 100)}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          initial={false}
          animate={{ width: `${(step / total) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </div>
  );
}

// Champ de recherche quartier avec autocomplétion
function QuartierAutocomplete({ value, onChange, placeholder, onUseGPS }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const inputRef = useRef();

  const suggestions = query.length >= 1
    ? QUARTIERS_OUAGADOUGOU.filter(q => q.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : QUARTIERS_OUAGADOUGOU.slice(0, 8);

  useEffect(() => { setQuery(value || ""); }, [value]);

  const select = (q) => {
    setQuery(q);
    onChange(q);
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full pl-9 pr-4 py-3.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {onUseGPS && (
        <button
          type="button"
          onClick={onUseGPS}
          className="mt-2 flex items-center gap-2 text-xs text-primary font-semibold px-3 py-2 rounded-lg bg-primary/10 w-fit"
        >
          <Navigation className="h-3.5 w-3.5" />
          Utiliser ma position actuelle
        </button>
      )}

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-border rounded-xl shadow-lg max-h-56 overflow-y-auto">
          {suggestions.map(q => (
            <button
              key={q}
              type="button"
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-primary/5 flex items-center gap-2 border-b last:border-0"
              onMouseDown={() => select(q)}
            >
              <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// --- ÉTAPES ---

function StepTypeService({ onSelect }) {
  const types = [
    { id: "envoyer", emoji: "📦", label: "Envoyer un colis", desc: "Le livreur vient récupérer chez vous", color: "border-primary bg-primary/5 text-primary" },
    { id: "recevoir", emoji: "📥", label: "Recevoir un colis", desc: "Le livreur va chercher et vous livre", color: "border-orange-400 bg-orange-50 text-orange-600" },
    { id: "deplacement", emoji: "🏍️", label: "Effectuer un déplacement", desc: "Transport de personne ou course express", color: "border-green-500 bg-green-50 text-green-700" },
  ];
  return (
    <div className="space-y-4 px-4 pt-2 pb-6">
      <div className="text-center mb-6">
        <p className="text-xl font-bold">Que souhaitez-vous faire ?</p>
        <p className="text-sm text-muted-foreground mt-1">Choisissez votre type de service</p>
      </div>
      {types.map(t => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 ${t.color} active:scale-[0.98] transition-all text-left`}
        >
          <span className="text-4xl">{t.emoji}</span>
          <div>
            <p className="text-lg font-bold">{t.label}</p>
            <p className="text-sm opacity-75 mt-0.5">{t.desc}</p>
          </div>
          <ChevronRight className="ml-auto h-5 w-5 opacity-50 flex-shrink-0" />
        </button>
      ))}
    </div>
  );
}

function StepQuartier({ title, subtitle, value, onChange, onNext, onUseGPS }) {
  return (
    <div className="space-y-6 px-4 pt-2 pb-6">
      <div>
        <p className="text-xl font-bold">{title}</p>
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      </div>
      <QuartierAutocomplete
        value={value}
        onChange={onChange}
        placeholder="Ex: Ouaga 2000, Pissy..."
        onUseGPS={onUseGPS}
      />
      <Button className="w-full h-12 text-base font-semibold" onClick={onNext} disabled={!value}>
        Continuer <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
}

function StepContact({ typeService, form, setForm, onNext }) {
  const isEnvoyer = typeService === "envoyer";
  const isRecevoir = typeService === "recevoir";
  const isDepl = typeService === "deplacement";

  const isValid = isDepl
    ? true
    : isEnvoyer
      ? form.nom_destinataire && form.telephone_destinataire
      : form.telephone_expediteur;

  return (
    <div className="space-y-5 px-4 pt-2 pb-6">
      <div>
        <p className="text-xl font-bold">Contact</p>
        <p className="text-sm text-muted-foreground mt-1">
          {isDepl ? "Aucun contact supplémentaire requis." : isEnvoyer ? "Informations du destinataire" : "Informations de l'expéditeur"}
        </p>
      </div>

      {isDepl && (
        <div className="p-4 rounded-2xl bg-green-50 border border-green-200 text-green-700 text-center">
          <p className="text-4xl mb-2">🏍️</p>
          <p className="font-semibold">Déplacement — pas de contact requis</p>
          <p className="text-sm opacity-75 mt-1">Le livreur vous contactera directement</p>
        </div>
      )}

      {isEnvoyer && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Nom du destinataire *</label>
            <Input
              placeholder="Nom complet"
              value={form.nom_destinataire}
              onChange={e => setForm(f => ({ ...f, nom_destinataire: e.target.value }))}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Numéro du destinataire *</label>
            <Input
              type="tel"
              placeholder="+226 XX XX XX XX"
              value={form.telephone_destinataire}
              onChange={e => setForm(f => ({ ...f, telephone_destinataire: e.target.value }))}
              className="h-12 text-base"
            />
          </div>
        </div>
      )}

      {isRecevoir && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Numéro de l'expéditeur *</label>
            <Input
              type="tel"
              placeholder="+226 XX XX XX XX"
              value={form.telephone_expediteur}
              onChange={e => setForm(f => ({ ...f, telephone_expediteur: e.target.value }))}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Nom de l'expéditeur (optionnel)</label>
            <Input
              placeholder="Nom complet"
              value={form.nom_expediteur}
              onChange={e => setForm(f => ({ ...f, nom_expediteur: e.target.value }))}
              className="h-12 text-base"
            />
          </div>
        </div>
      )}

      <Button className="w-full h-12 text-base font-semibold" onClick={onNext} disabled={!isValid}>
        Continuer <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
}

function StepColis({ form, setForm, onNext }) {
  return (
    <div className="space-y-5 px-4 pt-2 pb-6">
      <div>
        <p className="text-xl font-bold">Nature du colis</p>
        <p className="text-sm text-muted-foreground mt-1">Sélectionnez ou décrivez votre colis</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {TYPES_COLIS_SUGGESTIONS.map(s => (
          <button
            key={s.value}
            type="button"
            onClick={() => setForm(f => ({ ...f, type_colis: s.value, description: s.value === form.type_colis ? f.description : "" }))}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 text-center transition-all active:scale-95 ${
              form.type_colis === s.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-foreground"
            }`}
          >
            <span className="text-2xl">{s.label.split(" ")[0]}</span>
            <span className="text-xs font-semibold leading-tight">{s.label.split(" ").slice(1).join(" ")}</span>
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground">Préciser (optionnel)</label>
        <textarea
          placeholder="Détails supplémentaires sur le colis..."
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          rows={2}
          className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
        />
      </div>
      <Button className="w-full h-12 text-base font-semibold" onClick={onNext} disabled={!form.type_colis}>
        Continuer <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
}

function StepPrix({ form, setForm, onNext }) {
  const prix = parseInt(form.prix_base, 10) || 0;
  return (
    <div className="space-y-5 px-4 pt-2 pb-6">
      <div>
        <p className="text-xl font-bold">Prix proposé</p>
        <p className="text-sm text-muted-foreground mt-1">Proposez un prix juste pour attirer les livreurs</p>
      </div>
      <div className="relative">
        <input
          type="number"
          min="0"
          placeholder="0"
          value={form.prix_base}
          onChange={e => setForm(f => ({ ...f, prix_base: e.target.value }))}
          className="w-full text-3xl font-bold text-center py-5 rounded-2xl border-2 border-primary bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary text-primary"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">FCFA</span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {PRIX_SUGGESTIONS.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => setForm(f => ({ ...f, prix_base: String(p) }))}
            className={`py-2 rounded-xl border-2 text-sm font-bold transition-all active:scale-95 ${
              form.prix_base === String(p)
                ? "border-primary bg-primary text-white"
                : "border-border bg-background text-foreground"
            }`}
          >
            {p >= 1000 ? `${p / 1000}k` : p}
          </button>
        ))}
      </div>
      <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
        <span>💡</span>
        <span>Plus votre prix est attractif, plus un livreur accepte rapidement.</span>
      </div>
      <Button className="w-full h-12 text-base font-semibold" onClick={onNext} disabled={!prix || prix <= 0}>
        Continuer <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
}

function StepUrgence({ urgence, setUrgence, onNext }) {
  const levels = [
    { id: "normal", emoji: "🟢", label: "Normal", desc: "Livraison standard", supplement: 0, color: "border-green-400 bg-green-50 text-green-700" },
    { id: "urgent", emoji: "🔔", label: "Urgent", desc: "Moins de 30 min", supplement: 500, color: "border-amber-400 bg-amber-50 text-amber-700" },
    { id: "tres_urgent", emoji: "🚨", label: "Très urgent", desc: "Moins de 20 min", supplement: 1000, color: "border-red-400 bg-red-50 text-red-700" },
  ];
  return (
    <div className="space-y-4 px-4 pt-2 pb-6">
      <div>
        <p className="text-xl font-bold">Niveau d'urgence</p>
        <p className="text-sm text-muted-foreground mt-1">Choisissez selon votre besoin</p>
      </div>
      {levels.map(l => (
        <button
          key={l.id}
          onClick={() => { setUrgence(l.id); onNext(); }}
          className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all active:scale-[0.98] text-left ${
            urgence === l.id ? l.color + " scale-[0.99]" : "border-border bg-background"
          }`}
        >
          <span className="text-3xl">{l.emoji}</span>
          <div className="flex-1">
            <p className="font-bold text-base">{l.label}</p>
            <p className="text-sm opacity-75">{l.desc}</p>
          </div>
          {l.supplement > 0 && (
            <span className="text-sm font-bold text-current opacity-75 flex-shrink-0">+{fmt(l.supplement)}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function StepRecap({ typeService, form, urgence, prixTotal, soldeBedou, loading, onConfirm, onBack }) {
  const typeLabel = { envoyer: "📦 Envoyer un colis", recevoir: "📥 Recevoir un colis", deplacement: "🏍️ Déplacement" }[typeService];
  const urgenceLabel = { normal: "🟢 Normal", urgent: "🔔 Urgent (+500 F)", tres_urgent: "🚨 Très urgent (+1000 F)" }[urgence];
  const soldeInsuffisant = soldeBedou !== null && prixTotal > 0 && soldeBedou < prixTotal;

  const rows = [
    { label: "Service", value: typeLabel },
    { label: "Départ", value: form.quartier_depart },
    { label: "Arrivée", value: form.quartier_arrivee },
    form.nom_destinataire && { label: "Destinataire", value: form.nom_destinataire },
    form.telephone_destinataire && { label: "Tél. destinataire", value: form.telephone_destinataire },
    form.telephone_expediteur && { label: "Tél. expéditeur", value: form.telephone_expediteur },
    form.type_colis && { label: "Colis", value: form.type_colis },
    { label: "Urgence", value: urgenceLabel },
  ].filter(Boolean);

  return (
    <div className="space-y-4 px-4 pt-2 pb-6">
      <div>
        <p className="text-xl font-bold">Récapitulatif</p>
        <p className="text-sm text-muted-foreground mt-1">Vérifiez avant de confirmer</p>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {rows.map((r, i) => (
          <div key={i} className={`flex items-center justify-between px-4 py-3 ${i < rows.length - 1 ? "border-b" : ""}`}>
            <span className="text-sm text-muted-foreground">{r.label}</span>
            <span className="text-sm font-semibold text-right max-w-[55%]">{r.value}</span>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="rounded-2xl bg-primary/10 border-2 border-primary/30 p-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Total à débiter</p>
          <p className="text-3xl font-extrabold text-primary">{fmt(prixTotal)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Mon Bedou</p>
          <p className={`font-bold text-lg ${soldeInsuffisant ? "text-red-600" : "text-green-600"}`}>
            {soldeBedou !== null ? fmt(soldeBedou) : "..."}
          </p>
        </div>
      </div>

      {soldeInsuffisant && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold text-center">
          ❌ Solde insuffisant — il vous manque {fmt(prixTotal - soldeBedou)}
        </div>
      )}

      <Button
        className="w-full h-14 text-base font-bold rounded-2xl"
        onClick={onConfirm}
        disabled={loading || soldeInsuffisant}
      >
        {loading ? (
          <span className="flex items-center gap-2"><span className="animate-spin text-lg">⏳</span> Création...</span>
        ) : (
          <span className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /> CONFIRMER LA COMMANDE</span>
        )}
      </Button>
    </div>
  );
}

// --- WIZARD PRINCIPAL ---
export default function GuidedOrderWizard({ user, soldeBedou, gpsDepart, onSubmit, loading }) {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [typeService, setTypeService] = useState(null);
  const [urgence, setUrgence] = useState("normal");
  const [form, setForm] = useState({
    quartier_depart: "",
    quartier_arrivee: "",
    nom_expediteur: user?.full_name || "",
    telephone_expediteur: user?.telephone || "",
    nom_destinataire: "",
    telephone_destinataire: "",
    type_colis: "",
    description: "",
    prix_base: "",
  });

  const supplement = urgence === "tres_urgent" ? 1000 : urgence === "urgent" ? 500 : 0;
  const prixBase = parseInt(form.prix_base, 10) || 0;
  const prixTotal = prixBase + supplement;

  // Étapes actives selon type de service
  const isDepl = typeService === "deplacement";
  // Steps : 1=type, 2=départ, 3=arrivée, 4=contact, 5=colis(skip si depl), 6=prix, 7=urgence, 8=recap
  const STEP_LABELS = isDepl
    ? [null, "Type", "Départ", "Arrivée", "Contact", "Prix", "Urgence", "Récap"]
    : [null, "Type", "Départ", "Arrivée", "Contact", "Colis", "Prix", "Urgence", "Récap"];
  // Pour simplifier, on mappe les steps sur 8 (avec déplacement on saute colis côté logique)

  const go = (dir) => {
    setDirection(dir);
    setStep(s => s + dir);
  };

  const goNext = () => go(1);
  const goBack = () => {
    if (step === 1) return;
    // Si déplacement et on est à l'étape colis (5), sauter vers contact (4)
    go(-1);
  };

  const handleSelectType = (type) => {
    setTypeService(type);
    setDirection(1);
    setStep(2);
  };

  const handleUseGPS = () => {
    if (gpsDepart?.lat) {
      setForm(f => ({ ...f, quartier_depart: "Ma position GPS" }));
    }
  };

  const handleConfirm = () => {
    onSubmit({ form, typeService, urgence, prixBase, supplement, prixTotal });
  };

  // Calcul step réel selon déplacement (skip étape colis = étape 5)
  const effectiveStep = (isDepl && step >= 5) ? step - 1 : step; // affichage progression
  const displayTotal = isDepl ? 7 : 8;

  const renderStep = () => {
    switch (step) {
      case 1:
        return <StepTypeService onSelect={handleSelectType} />;
      case 2:
        return (
          <StepQuartier
            title="Lieu de récupération"
            subtitle="D'où doit partir la livraison ?"
            value={form.quartier_depart}
            onChange={v => setForm(f => ({ ...f, quartier_depart: v }))}
            onNext={goNext}
            onUseGPS={handleUseGPS}
          />
        );
      case 3:
        return (
          <StepQuartier
            title="Lieu de livraison"
            subtitle="Où doit être livré le colis ?"
            value={form.quartier_arrivee}
            onChange={v => setForm(f => ({ ...f, quartier_arrivee: v }))}
            onNext={goNext}
          />
        );
      case 4:
        return (
          <StepContact typeService={typeService} form={form} setForm={setForm} onNext={goNext} />
        );
      case 5:
        if (isDepl) {
          // Sauter directement au prix
          return (
            <StepPrix form={form} setForm={setForm} onNext={goNext} />
          );
        }
        return <StepColis form={form} setForm={setForm} onNext={goNext} />;
      case 6:
        if (isDepl) {
          return <StepUrgence urgence={urgence} setUrgence={setUrgence} onNext={goNext} />;
        }
        return <StepPrix form={form} setForm={setForm} onNext={goNext} />;
      case 7:
        if (isDepl) {
          return (
            <StepRecap
              typeService={typeService}
              form={form}
              urgence={urgence}
              prixTotal={prixTotal}
              soldeBedou={soldeBedou}
              loading={loading}
              onConfirm={handleConfirm}
            />
          );
        }
        return <StepUrgence urgence={urgence} setUrgence={setUrgence} onNext={goNext} />;
      case 8:
        return (
          <StepRecap
            typeService={typeService}
            form={form}
            urgence={urgence}
            prixTotal={prixTotal}
            soldeBedou={soldeBedou}
            loading={loading}
            onConfirm={handleConfirm}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 bg-background/95 backdrop-blur z-20 border-b">
        <div className="flex items-center gap-3 px-4 py-3">
          {step > 1 && (
            <button onClick={goBack} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="flex-1">
            <h1 className="text-base font-bold leading-tight">Commander une course</h1>
            {typeService && step > 1 && (
              <p className="text-xs text-muted-foreground">
                {{ envoyer: "📦 Envoyer", recevoir: "📥 Recevoir", deplacement: "🏍️ Déplacement" }[typeService]}
              </p>
            )}
          </div>
          {soldeBedou !== null && step > 1 && (
            <div className="flex items-center gap-1 text-xs font-semibold bg-primary/10 text-primary px-2.5 py-1.5 rounded-lg">
              <Wallet className="h-3.5 w-3.5" />
              {fmt(soldeBedou)}
            </div>
          )}
        </div>
        {step > 1 && <ProgressBar step={effectiveStep - 1} total={displayTotal - 1} />}
      </div>

      {/* Contenu animé */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="pt-4"
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}