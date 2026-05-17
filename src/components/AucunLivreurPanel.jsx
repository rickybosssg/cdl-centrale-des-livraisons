/**
 * AucunLivreurPanel — Design premium style Uber/Bolt
 * Rassurant, dynamique, actionnable
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw, TrendingUp, UserPlus, X, Clock,
  Package, Loader2, ChevronRight, Radio, Zap,
  MessageCircle, RotateCcw, CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import moment from "moment";

const PRICE_PRESETS = [500, 1000, 2000];
const CDL_WHATSAPP = "22670000000"; // à remplacer par le vrai numéro support CDL

// Délai avant prochaine relance auto (secondes)
const NEXT_RETRY_DELAY = 90;

// ── Spinner "radar" façon Uber ─────────────────────────────────────────────
function RadarSpinner() {
  return (
    <div className="relative w-20 h-20 flex items-center justify-center mx-auto">
      {/* Anneaux concentriques animés */}
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="absolute rounded-full border-2 border-blue-400/40"
          style={{ width: 20 + i * 18, height: 20 + i * 18 }}
          animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0.1, 0.6] }}
          transition={{ duration: 2, delay: i * 0.5, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
      {/* Icône moto centrale */}
      <motion.div
        className="relative z-10 h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/40"
        animate={{ rotate: [0, -8, 8, -5, 5, 0] }}
        transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
      >
        <span className="text-lg">🛵</span>
      </motion.div>
    </div>
  );
}

// ── Pastilles de livreurs "en recherche" façon silhouettes ────────────────
function DriverDots({ count = 3 }) {
  return (
    <div className="flex items-center justify-center gap-2 mt-1">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          className="flex flex-col items-center gap-1"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: [0.3, 0.9, 0.3] }}
          transition={{ duration: 1.5, delay: i * 0.4, repeat: Infinity }}
        >
          <div className="h-6 w-6 rounded-full bg-blue-200 flex items-center justify-center">
            <span className="text-xs">🛵</span>
          </div>
          <div className="h-1 w-1 rounded-full bg-blue-300 animate-pulse" />
        </motion.div>
      ))}
      <span className="text-[10px] text-blue-400 font-medium ml-1">en approche…</span>
    </div>
  );
}

// ── Compteur de relance automatique ───────────────────────────────────────
function NextRetryCountdown({ onAutoRetry }) {
  const [secs, setSecs] = useState(NEXT_RETRY_DELAY);
  const ref = useRef(null);

  useEffect(() => {
    ref.current = setInterval(() => {
      setSecs(s => {
        if (s <= 1) {
          clearInterval(ref.current);
          onAutoRetry?.();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(ref.current);
  }, []);

  const pct = ((NEXT_RETRY_DELAY - secs) / NEXT_RETRY_DELAY) * 100;

  return (
    <div className="flex items-center gap-2">
      <div className="relative h-7 w-7 flex-shrink-0">
        <svg className="h-7 w-7 -rotate-90" viewBox="0 0 28 28">
          <circle cx="14" cy="14" r="11" fill="none" stroke="#dbeafe" strokeWidth="3" />
          <circle
            cx="14" cy="14" r="11" fill="none"
            stroke="#3b82f6" strokeWidth="3"
            strokeDasharray={`${2 * Math.PI * 11}`}
            strokeDashoffset={`${2 * Math.PI * 11 * (1 - pct / 100)}`}
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-blue-600">{secs}</span>
      </div>
      <p className="text-[11px] text-blue-600 font-medium">
        Prochaine relance automatique dans <strong>{secs}s</strong>
      </p>
    </div>
  );
}

export default function AucunLivreurPanel({ course, onCourseUpdate, onCancel }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [prixDelta, setPrixDelta] = useState(null);
  const [customPrix, setCustomPrix] = useState("");
  const [manuelDone, setManuelDone] = useState(false);
  const [autoSearch, setAutoSearch] = useState(false); // recherche continue activée
  const [relanceCount, setRelanceCount] = useState(0); // relances locales

  if (!course) return null;

  const prixActuel = course.prix || 0;
  const tentatives = (course.nombre_tentatives || 0) + relanceCount;
  const derniereHeure = course.heure_assignation || course.updated_date || course.created_date;
  // Suggérer l'augmentation de prix dès 2 tentatives
  const showPrixBadge = tentatives >= 2;

  // ── Messages humains selon nb de tentatives ───────────────────────────────
  const getMessage = () => {
    if (tentatives === 0) return "Tous nos livreurs semblent occupés en ce moment.";
    if (tentatives === 1) return "Pas encore de réponse. Nos livreurs sont peut-être en déplacement.";
    if (tentatives === 2) return `${tentatives} tentatives effectuées. Augmenter légèrement le prix peut accélérer l'attribution.`;
    return `${tentatives} tentatives effectuées. Nous continuons de chercher activement un livreur pour vous.`;
  };

  // ── RELANCER ──────────────────────────────────────────────────────────────
  const handleRelance = async (silent = false) => {
    if (loading) return;
    setLoading(true);
    if (!silent) setMode("relance");
    try {
      await base44.entities.Course.update(course.id, {
        statut: "en_attente",
        nombre_tentatives: tentatives,
        heure_assignation: null,
        livreur_email: null,
        livreur_name: null,
        telephone_livreur: null,
      });
      await base44.functions.invoke("cdlDispatch", { course_id: course.id, force: true }).catch(() =>
        base44.functions.invoke("autoDispatch", { course_id: course.id, force: true }).catch(() => {})
      );
      setRelanceCount(c => c + 1);
      if (!silent) toast.success("🔄 Recherche relancée !");
      onCourseUpdate?.({ ...course, statut: "en_attente" });
    } catch (err) {
      if (!silent) toast.error("Erreur relance : " + err.message);
    } finally {
      setLoading(false);
      if (!silent) setMode(null);
    }
  };

  // ── AUGMENTER LE PRIX ─────────────────────────────────────────────────────
  const handlePrix = async (delta) => {
    if (loading) return;
    const nouveauPrix = prixActuel + delta;
    setLoading(true);
    try {
      const commission = Math.round(nouveauPrix * 0.2);
      await base44.entities.Course.update(course.id, {
        prix: nouveauPrix,
        commission_cdl: commission,
        gain_livreur: nouveauPrix - commission,
        statut: "en_attente",
        nombre_tentatives: tentatives,
        heure_assignation: null,
        livreur_email: null,
        livreur_name: null,
        telephone_livreur: null,
      });
      await base44.functions.invoke("cdlDispatch", { course_id: course.id, force: true }).catch(() =>
        base44.functions.invoke("autoDispatch", { course_id: course.id, force: true }).catch(() => {})
      );
      toast.success(`✅ Prix → ${nouveauPrix.toLocaleString()} F — recherche relancée`);
      onCourseUpdate?.({ ...course, prix: nouveauPrix, statut: "en_attente" });
      setMode(null);
      setPrixDelta(null);
      setCustomPrix("");
    } catch (err) {
      toast.error("Erreur : " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomPrix = () => {
    const val = parseInt(customPrix, 10);
    if (!val || val <= 0) { toast.error("Montant invalide"); return; }
    handlePrix(val);
  };

  // ── OPÉRATEUR MANUEL ──────────────────────────────────────────────────────
  const handleManuel = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await base44.entities.Course.update(course.id, {
        statut: "en_attente",
        mode_assignation: "manuel",
        historique_assignation: (() => {
          try {
            const h = course.historique_assignation ? JSON.parse(course.historique_assignation) : [];
            h.push({ message: "Client demande assignation manuelle", heure: new Date().toISOString(), statut: "manuel_request" });
            return JSON.stringify(h);
          } catch { return JSON.stringify([{ message: "Client demande assignation manuelle", heure: new Date().toISOString(), statut: "manuel_request" }]); }
        })(),
      });
      await base44.entities.Notification.create({
        destinataire_role: "admin",
        destinataire_email: "admin",
        titre: "🖐 Assignation manuelle demandée",
        message: `Course ${course.quartier_depart}→${course.quartier_arrivee} (${prixActuel} F) — client demande un opérateur. ${tentatives} tentative(s).`,
        type: "warning",
        course_id: course.id,
        target_screen: `/gerer-courses`,
      }).catch(() => {});
      setManuelDone(true);
      toast.success("✅ Un opérateur CDL a été alerté");
      onCourseUpdate?.({ ...course, statut: "en_attente", mode_assignation: "manuel" });
    } catch (err) {
      toast.error("Erreur : " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── ANNULER ───────────────────────────────────────────────────────────────
  const handleAnnuler = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await base44.entities.Course.update(course.id, {
        statut: "annulee",
        admin_cancel_reason: "Annulé par client — aucun livreur trouvé",
      });
      toast.success("Course annulée — aucun frais prélevé");
      onCancel?.();
      navigate("/mes-courses");
    } catch (err) {
      toast.error("Erreur annulation : " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── WhatsApp Support ──────────────────────────────────────────────────────
  const openWhatsApp = () => {
    const msg = encodeURIComponent(
      `Bonjour CDL Support 👋\nJe ne trouve pas de livreur pour ma course #${course.id?.slice(0, 8)} (${course.quartier_depart}→${course.quartier_arrivee}, ${prixActuel} F).\nPouvez-vous m'aider ?`
    );
    window.open(`https://wa.me/${CDL_WHATSAPP}?text=${msg}`, "_blank");
  };

  return (
    <div className="rounded-3xl overflow-hidden bg-white shadow-xl border border-gray-100">

      {/* ── HERO : animation radar + message ──────────────────────────────── */}
      <div className="bg-gradient-to-b from-blue-600 to-blue-700 px-5 pt-6 pb-5 text-white text-center space-y-3">
        <RadarSpinner />
        <DriverDots count={3} />
        <div className="space-y-1 pt-1">
          <p className="font-black text-base tracking-tight">Recherche d'un livreur en cours…</p>
          <p className="text-sm text-blue-100 leading-snug px-2">{getMessage()}</p>
        </div>

        {/* Compteur tentatives */}
        {tentatives > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-xs font-semibold"
          >
            <Radio className="h-3 w-3" />
            {tentatives} tentative{tentatives > 1 ? "s" : ""} effectuée{tentatives > 1 ? "s" : ""}
            {derniereHeure && (
              <span className="text-blue-200 font-normal ml-1">· {moment(derniereHeure).format("HH:mm")}</span>
            )}
          </motion.div>
        )}

        {/* Recherche continue activée */}
        <AnimatePresence>
          {autoSearch && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="mt-1"
            >
              <NextRetryCountdown onAutoRetry={() => handleRelance(true)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Infos course résumée ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-blue-50 border-b border-blue-100">
        <span className="flex items-center gap-1.5 text-xs text-blue-700">
          <Package className="h-3 w-3" />{course.type_colis}
          <span className="mx-1 text-blue-300">·</span>
          <strong>{course.quartier_depart} → {course.quartier_arrivee}</strong>
        </span>
        <span className="text-xs font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded-full">
          {prixActuel.toLocaleString()} F
        </span>
      </div>

      {/* ── ACTIONS ───────────────────────────────────────────────────────── */}
      <div className="p-4 space-y-3">

        {/* 1. BOUTON PRINCIPAL — Relancer (toujours en avant) */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          disabled={loading}
          onClick={() => handleRelance(false)}
          className="w-full flex items-center gap-3 p-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30 disabled:opacity-60 transition-all active:scale-[0.97]"
        >
          <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            {loading && mode === "relance"
              ? <Loader2 className="h-5 w-5 animate-spin" />
              : <RefreshCw className="h-5 w-5" />}
          </div>
          <div className="flex-1 text-left">
            <p className="font-bold text-base">Relancer la recherche</p>
            <p className="text-xs text-blue-200">Nouveau dispatch immédiat — même prix</p>
          </div>
          <ChevronRight className="h-5 w-5 opacity-60" />
        </motion.button>

        {/* 2. Recherche continue automatique (toggle) */}
        <button
          onClick={() => setAutoSearch(v => !v)}
          className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all active:scale-[0.97] ${
            autoSearch
              ? "border-green-400 bg-green-50 text-green-800"
              : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
          }`}
        >
          <div className={`h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 ${autoSearch ? "bg-green-100" : "bg-gray-200"}`}>
            {autoSearch
              ? <CheckCircle2 className="h-4 w-4 text-green-600" />
              : <RotateCcw className="h-4 w-4 text-gray-500" />}
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-bold">
              {autoSearch ? "Recherche continue activée ✓" : "Activer la recherche continue"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {autoSearch ? "Relance automatique toutes les 90s" : "Relancer automatiquement jusqu'à trouver un livreur"}
            </p>
          </div>
          <div className={`w-10 h-5 rounded-full transition-all flex items-center px-0.5 ${autoSearch ? "bg-green-500" : "bg-gray-300"}`}>
            <motion.div
              animate={{ x: autoSearch ? 20 : 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="h-4 w-4 rounded-full bg-white shadow"
            />
          </div>
        </button>

        {/* 3. Augmenter le prix — mis en avant après 2 échecs */}
        <div className={`rounded-2xl border-2 overflow-hidden transition-all ${showPrixBadge ? "border-amber-400 shadow-md shadow-amber-100" : "border-amber-200"}`}>
          <button
            className={`w-full flex items-center gap-3 p-3.5 transition-all active:scale-[0.97] ${showPrixBadge ? "bg-amber-50 hover:bg-amber-100" : "bg-gray-50 hover:bg-gray-100"}`}
            onClick={() => setMode(mode === "prix" ? null : "prix")}
            disabled={loading}
          >
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 ${showPrixBadge ? "bg-amber-100" : "bg-gray-200"}`}>
              <TrendingUp className={`h-4 w-4 ${showPrixBadge ? "text-amber-600" : "text-gray-500"}`} />
            </div>
            <div className="flex-1 text-left">
              <div className="flex items-center gap-2">
                <p className={`text-sm font-bold ${showPrixBadge ? "text-amber-800" : "text-gray-700"}`}>Augmenter le prix</p>
                {showPrixBadge && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white flex items-center gap-0.5">
                    <Zap className="h-2.5 w-2.5" /> RECOMMANDÉ
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">Un gain plus élevé attire plus de livreurs</p>
            </div>
            <ChevronRight className={`h-4 w-4 flex-shrink-0 transition-transform ${mode === "prix" ? "rotate-90" : ""} ${showPrixBadge ? "text-amber-500" : "text-gray-400"}`} />
          </button>

          <AnimatePresence>
            {mode === "prix" && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="p-3 space-y-3 bg-white border-t border-amber-100">
                  <p className="text-xs text-center text-muted-foreground">
                    Prix actuel : <strong className="text-gray-800">{prixActuel.toLocaleString()} F</strong>
                    <span className="mx-1">→</span>sélectionnez l'augmentation
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {PRICE_PRESETS.map(delta => (
                      <button
                        key={delta}
                        onClick={() => { setPrixDelta(delta); setCustomPrix(""); }}
                        className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 ${
                          prixDelta === delta
                            ? "border-amber-500 bg-amber-100 text-amber-800 shadow shadow-amber-200"
                            : "border-gray-200 bg-gray-50 text-gray-700 hover:border-amber-300"
                        }`}
                      >
                        +{delta.toLocaleString()} F
                        <span className="block text-[9px] font-normal text-muted-foreground mt-0.5">
                          → {(prixActuel + delta).toLocaleString()} F
                        </span>
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    placeholder="Autre montant à ajouter (F)"
                    value={customPrix}
                    onChange={e => { setCustomPrix(e.target.value); setPrixDelta(null); }}
                    className="w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-gray-50"
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 rounded-xl" onClick={() => { setMode(null); setPrixDelta(null); setCustomPrix(""); }}>
                      Annuler
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white gap-1"
                      disabled={loading || (!prixDelta && !customPrix)}
                      onClick={() => prixDelta ? handlePrix(prixDelta) : handleCustomPrix()}
                    >
                      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                      Confirmer
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 4. Demander un opérateur */}
        <AnimatePresence mode="wait">
          {!manuelDone ? (
            <motion.button
              key="manuel-btn"
              exit={{ opacity: 0, scale: 0.95 }}
              disabled={loading}
              onClick={handleManuel}
              className="w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 border-purple-200 bg-purple-50 hover:bg-purple-100 active:scale-[0.97] transition-all disabled:opacity-60"
            >
              <div className="h-9 w-9 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                {loading && mode === "manuel"
                  ? <Loader2 className="h-4 w-4 text-purple-600 animate-spin" />
                  : <UserPlus className="h-4 w-4 text-purple-600" />}
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold text-purple-800">Contacter un opérateur CDL</p>
                <p className="text-[10px] text-purple-500">Un agent humain cherche un livreur pour vous</p>
              </div>
              <ChevronRight className="h-4 w-4 text-purple-400 flex-shrink-0" />
            </motion.button>
          ) : (
            <motion.div
              key="manuel-done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-3 p-3.5 rounded-2xl border-2 border-green-300 bg-green-50"
            >
              <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-green-800">Opérateur alerté ✓</p>
                <p className="text-[10px] text-green-600">Un agent CDL prend en charge votre course.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 5. WhatsApp Support */}
        <button
          onClick={openWhatsApp}
          className="w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 border-green-200 bg-green-50 hover:bg-green-100 active:scale-[0.97] transition-all"
        >
          <div className="h-9 w-9 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
            <MessageCircle className="h-4 w-4 text-green-600" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-bold text-green-800">Contacter le support WhatsApp</p>
            <p className="text-[10px] text-green-600">Réponse rapide 7j/7 par notre équipe</p>
          </div>
          <span className="text-lg">💬</span>
        </button>

        {/* Séparateur */}
        <div className="flex items-center gap-2 py-1">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-[10px] text-gray-400 font-medium">ou</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>

        {/* 6. Annuler — discret en bas */}
        <button
          disabled={loading}
          onClick={handleAnnuler}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 active:scale-[0.98] transition-all disabled:opacity-60 text-sm"
        >
          <X className="h-4 w-4" />
          Annuler la course
          <span className="text-[10px] text-red-400 font-normal">(aucun frais)</span>
        </button>
      </div>
    </div>
  );
}