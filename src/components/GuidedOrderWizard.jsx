/**
 * GuidedOrderWizard — Parcours guidé CDL Premium (style Uber)
 */
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, MapPin, Wallet, ChevronRight, Navigation, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { QUARTIERS_OUAGADOUGOU } from "@/lib/quartiers";
import { fmt } from "@/lib/formatMoney";

// ── Design tokens ────────────────────────────────────────────────────────────
const PRIMARY = "#0B5ED7";
const GREEN   = "#22C55E";
const ORANGE  = "#F59E0B";
const RED     = "#EF4444";

// ── Variants Framer ──────────────────────────────────────────────────────────
const slide = {
  enter: (d) => ({ x: d > 0 ? "100%" : "-100%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:  (d) => ({ x: d > 0 ? "-100%" : "100%", opacity: 0 }),
};
const transition = { duration: 0.25, ease: [0.4, 0, 0.2, 1] };

// ── Bouton pression ──────────────────────────────────────────────────────────
function PressBtn({ onClick, disabled, children, className = "", style = {} }) {
  const vibrate = () => { try { navigator.vibrate?.(30); } catch (_) {} };
  return (
    <motion.button
      onClick={() => { if (!disabled) { vibrate(); onClick?.(); } }}
      disabled={disabled}
      whileTap={disabled ? {} : { scale: 0.97 }}
      transition={{ duration: 0.1 }}
      className={className}
      style={style}
    >
      {children}
    </motion.button>
  );
}

// ── Barre de progression ─────────────────────────────────────────────────────
function ProgressBar({ step, total }) {
  const pct = Math.round((step / total) * 100);
  return (
    <div className="px-5 pb-3 pt-2">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-gray-500 font-semibold">Étape {step} / {total}</span>
        <span className="text-xs font-bold" style={{ color: PRIMARY }}>{pct}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${PRIMARY}, #38bdf8)` }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
      {/* Pastilles étapes */}
      <div className="flex justify-between mt-2 px-0.5">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className="h-1.5 w-1.5 rounded-full transition-all duration-300"
            style={{ background: i < step ? PRIMARY : "#E5E7EB", transform: i === step - 1 ? "scale(1.4)" : "scale(1)" }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Footer CTA sticky (Uber-style) ───────────────────────────────────────────
// Hauteur totale réservée : 80px bouton + padding + safe-area
export const STICKY_FOOTER_HEIGHT = 88; // px, utilisé pour le padding-bottom du contenu

function StickyFooter({ onClick, disabled, loading, children, color = PRIMARY }) {
  const vibrate = () => { try { navigator.vibrate?.(30); } catch (_) {} };
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40"
      style={{
        background: "rgba(255,255,255,0.97)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.08)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
        /* Safe area Android/iOS — bottom nav ~56px + safe-area */
        paddingBottom: "calc(env(safe-area-inset-bottom) + 72px)",
        paddingTop: "12px",
      }}
    >
      <div className="px-5">
        <motion.button
          onClick={() => { if (!disabled && !loading) { vibrate(); onClick?.(); } }}
          disabled={disabled || loading}
          whileTap={disabled || loading ? {} : { scale: 0.97 }}
          transition={{ duration: 0.1 }}
          className="w-full flex items-center justify-center gap-2 h-14 rounded-2xl text-white text-base font-bold"
          style={{
            background: disabled ? "#D1D5DB" : `linear-gradient(135deg, ${color}, ${color}CC)`,
            boxShadow: disabled ? "none" : `0 4px 20px ${color}40`,
          }}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }} className="inline-block text-xl">⏳</motion.span>
              Création en cours...
            </span>
          ) : children}
        </motion.button>
      </div>
    </div>
  );
}

// BigBtn conservé pour compat (fixed ignoré, toujours StickyFooter)
function BigBtn({ onClick, disabled, loading, children, color = PRIMARY, fixed = false }) {
  if (fixed) {
    return <StickyFooter onClick={onClick} disabled={disabled} loading={loading} color={color}>{children}</StickyFooter>;
  }
  const vibrate = () => { try { navigator.vibrate?.(30); } catch (_) {} };
  return (
    <PressBtn
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full flex items-center justify-center gap-2 h-14 rounded-2xl text-white text-base font-bold transition-all"
      style={{
        background: disabled ? "#D1D5DB" : `linear-gradient(135deg, ${color}, ${color}CC)`,
        boxShadow: disabled ? "none" : `0 4px 20px ${color}40`,
      }}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }} className="inline-block text-xl">⏳</motion.span>
          Création en cours...
        </span>
      ) : children}
    </PressBtn>
  );
}

// ── Autocomplétion quartier ──────────────────────────────────────────────────
function QuartierInput({ value, onChange, placeholder, onUseGPS, autoFocus = false }) {
  const [query, setQuery]   = useState(value || "");
  const [open, setOpen]     = useState(false);
  const ref = useRef();

  const results = query.length >= 1
    ? QUARTIERS_OUAGADOUGOU.filter(q => q.toLowerCase().includes(query.toLowerCase())).slice(0, 7)
    : QUARTIERS_OUAGADOUGOU.slice(0, 7);

  useEffect(() => { setQuery(value || ""); }, [value]);
  useEffect(() => {
    if (autoFocus) { setTimeout(() => ref.current?.focus(), 350); }
  }, [autoFocus]);

  const pick = (q) => { setQuery(q); onChange(q); setOpen(false); ref.current?.blur(); };

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: PRIMARY }} />
        <input
          ref={ref}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck="false"
          value={query}
          onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="w-full pl-11 pr-4 py-4 rounded-2xl border border-gray-200 bg-white text-gray-900 text-sm font-medium placeholder:text-gray-400 focus:outline-none focus:border-blue-400 focus:shadow-sm transition-all"
          style={{ color: '#111827', backgroundColor: '#fff' }}
        />
      </div>

      {onUseGPS && (
        <PressBtn
          onClick={onUseGPS}
          className="mt-2.5 flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-xl"
          style={{ background: `${PRIMARY}15`, color: PRIMARY }}
        >
          <Navigation className="h-3.5 w-3.5" />
          Utiliser ma position actuelle
        </PressBtn>
      )}

      <AnimatePresence>
        {open && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-2 w-full bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden"
          >
            {results.map((q, i) => (
              <button
                key={q}
                type="button"
                onMouseDown={() => pick(q)}
                className={`w-full text-left px-4 py-3 text-sm font-medium hover:bg-blue-50 flex items-center gap-3 transition-colors ${i < results.length - 1 ? "border-b border-gray-50" : ""}`}
              >
                <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                {q}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── ÉTAPE 1 : Type de service ────────────────────────────────────────────────
function StepType({ onSelect }) {
  const types = [
    { id: "envoyer",     emoji: "📦", label: "Envoyer un colis",         desc: "Le livreur vient chez vous",             color: PRIMARY,  bg: `${PRIMARY}12` },
    { id: "recevoir",    emoji: "📥", label: "Recevoir un colis",         desc: "Le livreur récupère et vous livre",       color: ORANGE,   bg: `${ORANGE}18` },
    { id: "deplacement", emoji: "🏍️", label: "Effectuer un déplacement",  desc: "Transport express ou course rapide",      color: GREEN,    bg: `${GREEN}18` },
  ];
  return (
    <div className="px-5 pt-2 pb-8 space-y-4">
      <div className="mb-6">
        <h2 className="text-2xl font-extrabold text-gray-900">Que voulez-vous faire ?</h2>
        <p className="text-sm text-gray-400 mt-1">Choisissez votre type de service</p>
      </div>
      {types.map(t => (
        <PressBtn
          key={t.id}
          onClick={() => onSelect(t.id)}
          className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all"
          style={{ borderColor: t.color, background: t.bg }}
        >
          <div className="h-14 w-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0" style={{ background: t.color + "22" }}>
            {t.emoji}
          </div>
          <div className="flex-1">
            <p className="text-base font-bold" style={{ color: t.color }}>{t.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
          </div>
          <ChevronRight className="h-5 w-5 flex-shrink-0" style={{ color: t.color }} />
        </PressBtn>
      ))}
    </div>
  );
}

// ── ÉTAPE 2 & 3 : Quartier ───────────────────────────────────────────────────
function StepQuartier({ title, subtitle, icon, value, onChange, onNext, onUseGPS }) {
  return (
    <div className="px-5 pt-2 space-y-5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 160px)" }}>
      <div>
        <div className="text-3xl mb-2">{icon}</div>
        <h2 className="text-2xl font-extrabold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-400 mt-1">{subtitle}</p>
      </div>
      <QuartierInput value={value} onChange={onChange} placeholder="Ex: Ouaga 2000, Pissy..." onUseGPS={onUseGPS} autoFocus />
      <BigBtn onClick={onNext} disabled={!value} color={PRIMARY} fixed>
        Continuer <ChevronRight className="h-4 w-4" />
      </BigBtn>
    </div>
  );
}

// ── ÉTAPE 4 : Contact ────────────────────────────────────────────────────────
function StepContact({ typeService, form, setForm, onNext }) {
  const isEnvoyer = typeService === "envoyer";
  const isRecevoir = typeService === "recevoir";
  const isDepl = typeService === "deplacement";
  const valid = isDepl ? true : isEnvoyer ? !!form.telephone_destinataire : !!form.telephone_expediteur;

  return (
    <div className="px-5 pt-2 space-y-5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 160px)" }}>
      <div>
        <div className="text-3xl mb-2">📞</div>
        <h2 className="text-2xl font-extrabold text-gray-900">Contact</h2>
        <p className="text-sm text-gray-400 mt-1">
          {isDepl ? "Aucun contact supplémentaire requis" : isEnvoyer ? "Informations du destinataire" : "Informations de l'expéditeur"}
        </p>
      </div>

      {isDepl && (
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="p-6 rounded-2xl text-center" style={{ background: `${GREEN}15`, border: `1.5px solid ${GREEN}40` }}>
          <p className="text-4xl mb-2">✅</p>
          <p className="font-bold text-gray-700">Déplacement — aucun contact requis</p>
          <p className="text-sm text-gray-400 mt-1">Le livreur vous contactera directement</p>
        </motion.div>
      )}

      {isEnvoyer && (
        <div className="space-y-4">
          <FieldInput label="Nom du destinataire *" placeholder="Nom complet" value={form.nom_destinataire}
            onChange={v => setForm(f => ({ ...f, nom_destinataire: v }))} autoFocus />
          <FieldInput label="Numéro du destinataire *" placeholder="+226 XX XX XX XX" type="tel"
            value={form.telephone_destinataire} onChange={v => setForm(f => ({ ...f, telephone_destinataire: v }))} />
        </div>
      )}

      {isRecevoir && (
        <div className="space-y-4">
          <FieldInput label="Numéro de l'expéditeur *" placeholder="+226 XX XX XX XX" type="tel"
            value={form.telephone_expediteur} onChange={v => setForm(f => ({ ...f, telephone_expediteur: v }))} autoFocus />
          <FieldInput label="Nom de l'expéditeur (optionnel)" placeholder="Nom complet"
            value={form.nom_expediteur} onChange={v => setForm(f => ({ ...f, nom_expediteur: v }))} />
        </div>
      )}

      <BigBtn onClick={onNext} disabled={!valid} color={PRIMARY} fixed>
        Continuer <ChevronRight className="h-4 w-4" />
      </BigBtn>
    </div>
  );
}

function FieldInput({ label, placeholder, value, onChange, type = "text", autoFocus = false }) {
  const ref = useRef();
  useEffect(() => { if (autoFocus) setTimeout(() => ref.current?.focus(), 350); }, [autoFocus]);
  const isTel = type === "tel";
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold text-gray-700">{label}</label>
      <input
        ref={ref}
        type={isTel ? "tel" : type}
        inputMode={isTel ? "tel" : "text"}
        autoComplete={isTel ? "tel" : "off"}
        autoCorrect="off"
        autoCapitalize={isTel ? "none" : "words"}
        spellCheck="false"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 bg-white text-gray-900 text-sm font-medium placeholder:text-gray-400 focus:outline-none focus:border-blue-400 focus:shadow-sm transition-all"
        style={{ color: '#111827', backgroundColor: '#fff' }}
      />
    </div>
  );
}
console.log('[CLIENT_FORM_VISIBILITY_OK] FieldInput + QuartierInput correctement configurés');

// ── ÉTAPE 5 : Colis ─────────────────────────────────────────────────────────
const COLIS_CHIPS = [
  { label: "📄 Document", value: "Documents" },
  { label: "🍱 Repas", value: "Nourriture" },
  { label: "📦 Colis", value: "Colis moyen" },
  { label: "⚠️ Fragile", value: "Fragile" },
  { label: "👕 Vêtements", value: "Vêtements" },
  { label: "✏️ Autre", value: "Autre" },
];

function StepColis({ form, setForm, onNext }) {
  return (
    <div className="px-5 pt-2 space-y-5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 160px)" }}>
      <div>
        <div className="text-3xl mb-2">📦</div>
        <h2 className="text-2xl font-extrabold text-gray-900">Nature du colis</h2>
        <p className="text-sm text-gray-400 mt-1">Sélectionnez ou décrivez votre colis</p>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {COLIS_CHIPS.map(c => {
          const active = form.type_colis === c.value;
          return (
            <PressBtn
              key={c.value}
              onClick={() => setForm(f => ({ ...f, type_colis: c.value }))}
              className="flex flex-col items-center gap-1.5 py-3.5 px-2 rounded-2xl border-2 text-center transition-all"
              style={{
                borderColor: active ? PRIMARY : "#E5E7EB",
                background: active ? `${PRIMARY}12` : "#F9FAFB",
                color: active ? PRIMARY : "#374151",
              }}
            >
              <span className="text-2xl">{c.label.split(" ")[0]}</span>
              <span className="text-[11px] font-semibold leading-tight">{c.label.split(" ").slice(1).join(" ")}</span>
            </PressBtn>
          );
        })}
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-gray-700">Préciser (optionnel)</label>
        <textarea
          placeholder="Détails supplémentaires..."
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          rows={2}
          inputMode="text"
          autoComplete="off"
          autoCorrect="on"
          autoCapitalize="sentences"
          spellCheck="true"
          className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-white text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:border-blue-400 transition-all resize-none"
          style={{ color: '#111827', backgroundColor: '#fff' }}
        />
      </div>
      <BigBtn onClick={onNext} disabled={!form.type_colis} color={PRIMARY} fixed>
        Continuer <ChevronRight className="h-4 w-4" />
      </BigBtn>
    </div>
  );
}

// ── ÉTAPE 6 : Prix ───────────────────────────────────────────────────────────
const PRIX_CHIPS = [1000, 1500, 2000, 2500, 3000];

function StepPrix({ form, setForm, onNext }) {
  const prix = parseInt(form.prix_base, 10) || 0;
  const inputRef = useRef();
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 350); }, []);
  return (
    <div className="px-5 pt-2 space-y-5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 160px)" }}>
      <div>
        <div className="text-3xl mb-2">💰</div>
        <h2 className="text-2xl font-extrabold text-gray-900">Prix proposé</h2>
        <p className="text-sm text-gray-400 mt-1">Proposez un prix attractif pour les livreurs</p>
      </div>

      {/* Champ grand */}
      <div className="relative">
        <input
          ref={inputRef}
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck="false"
          min="0"
          placeholder="0"
          value={form.prix_base}
          onChange={e => setForm(f => ({ ...f, prix_base: e.target.value }))}
          className="w-full text-4xl font-extrabold text-center py-6 rounded-2xl border-2 focus:outline-none transition-all"
          style={{
            borderColor: prix > 0 ? PRIMARY : "#E5E7EB",
            background: prix > 0 ? `${PRIMARY}08` : "#fff",
            color: prix > 0 ? PRIMARY : "#9CA3AF",
          }}
        />
        <span className="absolute right-5 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">FCFA</span>
      </div>

      {/* Chips prix rapides */}
      <div className="grid grid-cols-5 gap-2">
        {PRIX_CHIPS.map(p => {
          const active = form.prix_base === String(p);
          return (
            <PressBtn
              key={p}
              onClick={() => setForm(f => ({ ...f, prix_base: String(p) }))}
              className="py-2.5 rounded-xl text-sm font-bold border-2 transition-all"
              style={{
                borderColor: active ? PRIMARY : "#E5E7EB",
                background: active ? PRIMARY : "#F9FAFB",
                color: active ? "#fff" : "#374151",
              }}
            >
              {p >= 1000 ? `${p / 1000}k` : p}
            </PressBtn>
          );
        })}
      </div>

      {/* Astuce */}
      <div className="flex items-start gap-3 p-4 rounded-2xl" style={{ background: `${ORANGE}15`, border: `1.5px solid ${ORANGE}40` }}>
        <span className="text-xl flex-shrink-0">💡</span>
        <p className="text-sm font-medium" style={{ color: ORANGE }}>
          Plus votre prix est attractif, plus un livreur accepte rapidement.
        </p>
      </div>

      <BigBtn onClick={onNext} disabled={!prix || prix <= 0} color={PRIMARY} fixed>
        Continuer <ChevronRight className="h-4 w-4" />
      </BigBtn>
    </div>
  );
}

// ── ÉTAPE 7 : Urgence ────────────────────────────────────────────────────────
function StepUrgence({ urgence, setUrgence, prixBase, onNext }) {
  const levels = [
    { id: "normal",      emoji: "🟢", label: "Normal",      desc: "Livraison standard",  supplement: 0,    color: GREEN,  bg: `${GREEN}15` },
    { id: "urgent",      emoji: "🔔", label: "Urgent",      desc: "Moins de 30 min",      supplement: 500,  color: ORANGE, bg: `${ORANGE}18` },
    { id: "tres_urgent", emoji: "🚨", label: "Très urgent", desc: "Moins de 20 min",      supplement: 1000, color: RED,    bg: `${RED}15` },
  ];
  const selected = levels.find(l => l.id === urgence);
  const prixTotal = (prixBase || 0) + (selected?.supplement || 0);

  return (
    <div className="px-5 pt-2 space-y-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 160px)" }}>
      <div>
        <div className="text-3xl mb-2">⚡</div>
        <h2 className="text-2xl font-extrabold text-gray-900">Niveau d'urgence</h2>
        <p className="text-sm text-gray-400 mt-1">Choisissez selon votre besoin</p>
      </div>

      {levels.map(l => {
        const active = urgence === l.id;
        return (
          <PressBtn
            key={l.id}
            onClick={() => setUrgence(l.id)}
            className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all"
            style={{
              borderColor: active ? l.color : "#E5E7EB",
              background: active ? l.bg : "#FAFAFA",
              boxShadow: active ? `0 2px 16px ${l.color}25` : "none",
            }}
          >
            <span className="text-3xl">{l.emoji}</span>
            <div className="flex-1">
              <p className="font-bold text-gray-800">{l.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{l.desc}</p>
            </div>
            {l.supplement > 0 && (
              <span className="text-sm font-extrabold flex-shrink-0" style={{ color: l.color }}>
                +{fmt(l.supplement)}
              </span>
            )}
            {active && <CheckCircle2 className="h-5 w-5 flex-shrink-0" style={{ color: l.color }} />}
          </PressBtn>
        );
      })}

      {/* Récap prix dynamique */}
      {urgence && prixBase > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-2xl flex items-center justify-between"
          style={{ background: `${PRIMARY}10`, border: `1.5px solid ${PRIMARY}25` }}
        >
          <p className="text-sm text-gray-500 font-medium">Total estimé</p>
          <p className="text-2xl font-extrabold" style={{ color: PRIMARY }}>{fmt(prixTotal)}</p>
        </motion.div>
      )}

      <BigBtn onClick={onNext} disabled={!urgence} color={PRIMARY} fixed>
        Continuer <ChevronRight className="h-4 w-4" />
      </BigBtn>
    </div>
  );
}

// ── Bouton Recharger Bedou ───────────────────────────────────────────────────
function RechargeBtn() {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate('/mon-bedou')}
      className="w-full py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
      style={{ background: `linear-gradient(135deg, ${RED}, #ff6b6b)`, boxShadow: `0 4px 16px ${RED}40` }}
    >
      💳 Recharger mon Bedou
    </button>
  );
}

// ── ÉTAPE 8 : Récapitulatif ──────────────────────────────────────────────────
function StepRecap({ typeService, form, urgence, prixBase, supplement, prixTotal, soldeBedou, loading, onConfirm }) {

  const typeLabel = { envoyer: "📦 Envoyer un colis", recevoir: "📥 Recevoir un colis", deplacement: "🏍️ Déplacement" }[typeService];
  const urgLabel  = { normal: "🟢 Normal", urgent: `🔔 Urgent (+${fmt(500)})`, tres_urgent: `🚨 Très urgent (+${fmt(1000)})` }[urgence];
  const soldeInsuffisant = soldeBedou !== null && prixTotal > 0 && soldeBedou < prixTotal;

  const rows = [
    { label: "Service", value: typeLabel },
    { label: "Départ", value: form.quartier_depart },
    { label: "Arrivée", value: form.quartier_arrivee },
    form.nom_destinataire && { label: "Destinataire", value: form.nom_destinataire },
    form.telephone_destinataire && { label: "Tél. destinataire", value: form.telephone_destinataire },
    form.telephone_expediteur && { label: "Tél. expéditeur", value: form.telephone_expediteur },
    form.type_colis && { label: "Colis", value: form.type_colis },
    { label: "Urgence", value: urgLabel },
  ].filter(Boolean);

  return (
    <div className="px-5 pt-2 space-y-5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 160px)" }}>
      <div>
        <div className="text-3xl mb-2">📋</div>
        <h2 className="text-2xl font-extrabold text-gray-900">Récapitulatif</h2>
        <p className="text-sm text-gray-400 mt-1">Vérifiez avant de confirmer</p>
      </div>

      {/* Détails */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {rows.map((r, i) => (
          <div key={i} className={`flex items-center justify-between px-4 py-3.5 ${i < rows.length - 1 ? "border-b border-gray-50" : ""}`}>
            <span className="text-sm text-gray-400">{r.label}</span>
            <span className="text-sm font-semibold text-gray-800 text-right max-w-[56%]">{r.value}</span>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="p-5 rounded-2xl flex items-center justify-between"
        style={{ background: `${PRIMARY}10`, border: `2px solid ${PRIMARY}25` }}>
        <div>
          <p className="text-xs text-gray-400 font-medium">Total à débiter</p>
          <p className="text-4xl font-extrabold mt-0.5" style={{ color: PRIMARY }}>{fmt(prixTotal)}</p>
          {supplement > 0 && (
            <p className="text-xs mt-0.5" style={{ color: ORANGE }}>dont +{fmt(supplement)} urgence</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Mon Bedou</p>
          <p className="text-2xl font-extrabold mt-0.5" style={{ color: soldeInsuffisant ? RED : GREEN }}>
            {soldeBedou !== null ? fmt(soldeBedou) : "..."}
          </p>
          <p className="text-xs mt-0.5 font-semibold" style={{ color: soldeInsuffisant ? RED : GREEN }}>
            {soldeInsuffisant ? "❌ Insuffisant" : "✅ Suffisant"}
          </p>
        </div>
      </div>

      {soldeInsuffisant && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          className="space-y-2">
          <div className="p-3.5 rounded-xl text-center text-sm font-semibold"
            style={{ background: `${RED}12`, border: `1.5px solid ${RED}40`, color: RED }}>
            💳 Solde Bedou insuffisant. Rechargez votre Bedou pour effectuer cette course.
            <br />
            <span className="text-xs font-normal">Il vous manque {fmt(prixTotal - soldeBedou)}</span>
          </div>
          <RechargeBtn />
        </motion.div>
      )}

      <BigBtn onClick={onConfirm} disabled={soldeInsuffisant} loading={loading} color={GREEN} fixed>
        <CheckCircle2 className="h-5 w-5" />
        CONFIRMER LA COMMANDE
      </BigBtn>
    </div>
  );
}

console.log('[CLIENT_KEYBOARD_CONFIG_OK] GuidedOrderWizard — inputMode/type/autoComplete configurés');

// ── WIZARD PRINCIPAL ─────────────────────────────────────────────────────────
export default function GuidedOrderWizard({ user, soldeBedou, gpsDepart, onSubmit, loading }) {
  const [step, setStep]           = useState(1);
  const [dir, setDir]             = useState(1);

  // Signaler au layout qu'un CTA sticky est actif → bouton chat doit remonter
  useEffect(() => {
    document.body.setAttribute('data-sticky-cta', step >= 2 ? '1' : '0');
    return () => { document.body.removeAttribute('data-sticky-cta'); };
  }, [step]);
  const [typeService, setType]    = useState(null);
  const [urgence, setUrgence]     = useState("normal");
  const [form, setForm]           = useState({
    quartier_depart: "", quartier_arrivee: "",
    nom_expediteur: user?.full_name || "", telephone_expediteur: user?.telephone || "",
    nom_destinataire: "", telephone_destinataire: "",
    type_colis: "", description: "", prix_base: "",
  });

  const isDepl = typeService === "deplacement";
  const supplement = urgence === "tres_urgent" ? 1000 : urgence === "urgent" ? 500 : 0;
  const prixBase = parseInt(form.prix_base, 10) || 0;
  const prixTotal = prixBase + supplement;

  // Progression affichée (déplacement = 7 étapes, autres = 8)
  const totalSteps = isDepl ? 7 : 8;
  const displayStep = step === 1 ? 1 : isDepl && step >= 5 ? step - 1 : step;

  const go = (d) => { setDir(d); setStep(s => s + d); };
  const next = () => go(1);
  const back = () => { if (step > 1) go(-1); };

  const handleSelectType = (t) => { setType(t); setDir(1); setStep(2); };
  const handleUseGPS = () => { if (gpsDepart?.lat) setForm(f => ({ ...f, quartier_depart: "Ma position GPS" })); };
  const handleConfirm = () => onSubmit({ form, typeService, urgence, prixBase, supplement, prixTotal });

  // Mapping step → composant
  // Steps: 1=type, 2=depart, 3=arrivee, 4=contact, 5=colis(skip si depl), 6=prix(5 si depl), 7=urgence(6 si depl), 8=recap(7 si depl)
  const renderStep = () => {
    if (step === 1) return <StepType onSelect={handleSelectType} />;
    if (step === 2) return (
      <StepQuartier title="Lieu de récupération" subtitle="D'où doit partir la livraison ?" icon="📍"
        value={form.quartier_depart} onChange={v => setForm(f => ({ ...f, quartier_depart: v }))}
        onNext={next} onUseGPS={handleUseGPS} />
    );
    if (step === 3) return (
      <StepQuartier title="Lieu de livraison" subtitle="Où doit être livré le colis ?" icon="🏁"
        value={form.quartier_arrivee} onChange={v => setForm(f => ({ ...f, quartier_arrivee: v }))}
        onNext={next} />
    );
    if (step === 4) return <StepContact typeService={typeService} form={form} setForm={setForm} onNext={next} />;
    if (step === 5) return isDepl
      ? <StepPrix form={form} setForm={setForm} onNext={next} />
      : <StepColis form={form} setForm={setForm} onNext={next} />;
    if (step === 6) return isDepl
      ? <StepUrgence urgence={urgence} setUrgence={setUrgence} prixBase={prixBase} onNext={next} />
      : <StepPrix form={form} setForm={setForm} onNext={next} />;
    if (step === 7) return isDepl
      ? <StepRecap typeService={typeService} form={form} urgence={urgence} prixBase={prixBase}
          supplement={supplement} prixTotal={prixTotal} soldeBedou={soldeBedou} loading={loading} onConfirm={handleConfirm} />
      : <StepUrgence urgence={urgence} setUrgence={setUrgence} prixBase={prixBase} onNext={next} />;
    if (step === 8) return (
      <StepRecap typeService={typeService} form={form} urgence={urgence} prixBase={prixBase}
        supplement={supplement} prixTotal={prixTotal} soldeBedou={soldeBedou} loading={loading} onConfirm={handleConfirm} />
    );
    return null;
  };

  return (
    <div className="flex flex-col bg-white" style={{ minHeight: "100dvh" }}>
      {/* Header sticky */}
      <div className="sticky top-0 bg-white z-20 border-b border-gray-100 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3 px-4 py-3.5">
          {step > 1 && (
            <PressBtn onClick={back}
              className="p-2 rounded-xl transition-colors"
              style={{ background: "#F3F4F6" }}>
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </PressBtn>
          )}
          <div className="flex-1">
            <h1 className="text-base font-extrabold text-gray-900">Commander une course</h1>
            {typeService && step > 1 && (
              <p className="text-xs text-gray-400">
                {{ envoyer: "📦 Envoyer un colis", recevoir: "📥 Recevoir un colis", deplacement: "🏍️ Déplacement" }[typeService]}
              </p>
            )}
          </div>
          {soldeBedou !== null && step > 1 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
              style={{ background: `${PRIMARY}12`, color: PRIMARY }}>
              <Wallet className="h-3.5 w-3.5" />
              {fmt(soldeBedou)}
            </div>
          )}
        </div>
        {step > 1 && <ProgressBar step={displayStep - 1} total={totalSteps - 1} />}
      </div>

      {/* Contenu scrollable — indépendant du footer CTA */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={transition}
            className="pt-4"
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}