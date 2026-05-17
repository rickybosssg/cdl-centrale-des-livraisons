/**
 * SearchingLivreurScreen — Écran premium "recherche livreur"
 * Style Uber/Bolt/Apple — cartes animées en rotation, radar GPS
 * Optimisé Android faibles performances (will-change limité, ease simples)
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Navigation, Package, Phone, Clock, Zap, CheckCircle2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import moment from "moment";

// ── Durée par carte : entre 3s et 4.5s (variation dynamique) ─────────────
function nextDuration() {
  return 3000 + Math.random() * 1500;
}

// ── Vibreur léger "livreur notifié" ──────────────────────────────────────
function vibrateLight() {
  try { navigator.vibrate?.([40, 30, 40]); } catch (_) {}
}

// ── Radar SVG en arrière-plan ─────────────────────────────────────────────
function RadarBg() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
      {[1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border border-blue-300/20"
          style={{ width: i * 90, height: i * 90 }}
          animate={{ scale: [1, 1.12, 1], opacity: [0.4, 0.1, 0.4] }}
          transition={{ duration: 3, delay: i * 0.6, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// ── Moto animée centrale ───────────────────────────────────────────────────
function MotoSpinner() {
  return (
    <div className="relative flex items-center justify-center w-24 h-24 flex-shrink-0">
      <motion.div
        className="absolute inset-0 rounded-full border-[3px] border-blue-500/30 border-t-blue-500"
        animate={{ rotate: 360 }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute inset-2 rounded-full border-[2px] border-blue-300/20 border-b-blue-400"
        animate={{ rotate: -360 }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute inset-4 rounded-full bg-blue-600 shadow-lg shadow-blue-500/40 flex items-center justify-center"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      >
        <span className="text-2xl">🛵</span>
      </motion.div>
    </div>
  );
}

// ── Séquence de statuts progressifs ──────────────────────────────────────
// Chaque phase a un délai (ms depuis le début) et un ton rassurant
const STATUS_PHASES = [
  { at: 0,     text: "Recherche des livreurs proches…",         sub: "Analyse de votre zone en cours" },
  { at: 5000,  text: "Vérification des livreurs disponibles…",  sub: "CDL consulte son réseau en temps réel" },
  { at: 12000, text: "2 livreurs ont reçu la notification…",    sub: "En attente d'une réponse" },
  { at: 20000, text: "Un livreur consulte votre course…",       sub: "Restez ici, vous serez averti immédiatement" },
  { at: 30000, text: "Recherche étendue à une zone proche…",    sub: "Nous élargissons le rayon pour vous" },
  { at: 42000, text: "Nouvelle tentative de dispatch…",         sub: "CDL relance la recherche pour vous" },
  { at: 55000, text: "Plusieurs livreurs analysent votre trajet…", sub: "La réponse arrive bientôt" },
  { at: 70000, text: "Recherche active en cours…",              sub: "CDL travaille pour vous trouver un livreur" },
];

// Estimation du délai moyen de réponse (s restantes, décroissante)
function useEtaCountdown(startMs = 90000) {
  const [secs, setSecs] = useState(Math.round(startMs / 1000));
  const ref = useRef(null);
  useEffect(() => {
    ref.current = setInterval(() => {
      setSecs(s => (s > 1 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(ref.current);
  }, []);
  return secs;
}

// ── Statut progressif basé sur l'elapsed time ────────────────────────────
function useLiveStatus() {
  const startRef = useRef(Date.now());
  const [phaseIdx, setPhaseIdx] = useState(0);

  useEffect(() => {
    const timers = STATUS_PHASES.slice(1).map((phase, i) => {
      const delay = phase.at - (Date.now() - startRef.current);
      if (delay < 0) return null;
      return setTimeout(() => setPhaseIdx(i + 1), delay);
    });
    return () => timers.forEach(t => t && clearTimeout(t));
  }, []);

  return STATUS_PHASES[phaseIdx] || STATUS_PHASES[STATUS_PHASES.length - 1];
}

// ── Barre de progression animée ───────────────────────────────────────────
function ProgressBar({ totalMs = 90000 }) {
  const [pct, setPct] = useState(2);
  const startRef = useRef(Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      // Progression logarithmique — avance vite au début, ralentit après 60%
      const raw = Math.min((elapsed / totalMs) * 100, 92);
      const smoothed = raw < 60 ? raw : 60 + (raw - 60) * 0.4;
      setPct(Math.round(smoothed));
    }, 800);
    return () => clearInterval(id);
  }, [totalMs]);

  const color = pct < 40 ? "#3b82f6" : pct < 70 ? "#6366f1" : "#8b5cf6";

  return (
    <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
      <motion.div
        className="h-full rounded-full"
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        style={{ background: color }}
      />
    </div>
  );
}

// ── Indicateur "livreurs contactés" ──────────────────────────────────────
function NotifiedPulse({ count }) {
  return (
    <motion.div
      key={count}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 text-white text-xs font-semibold"
    >
      <motion.div
        className="h-2 w-2 rounded-full bg-white"
        animate={{ scale: [1, 1.5, 1], opacity: [1, 0.3, 1] }}
        transition={{ duration: 1.2, repeat: Infinity }}
      />
      {count > 0 ? `${count} livreur${count > 1 ? "s" : ""} contacté${count > 1 ? "s" : ""}` : "Analyse du réseau…"}
    </motion.div>
  );
}

// ── Pool de micro-événements réseau (toasts éphémères) ───────────────────
const MICRO_EVENTS = [
  { icon: "📍", text: "Livreur proche détecté…" },
  { icon: "🔄", text: "Vérification disponibilité…" },
  { icon: "📐", text: "Analyse distance optimale…" },
  { icon: "⚡", text: "Recherche d'un livreur plus rapide…" },
  { icon: "📡", text: "Signal réseau CDL actif…" },
  { icon: "🗺️", text: "Calcul de l'itinéraire…" },
  { icon: "🔍", text: "Scan zone étendue…" },
  { icon: "✉️", text: "Notification renvoyée…" },
];

// Pool de faux prénoms + avatars emoji (100% fictifs, clairement visuels)
const GHOST_DRIVERS = [
  { initial: "K", color: "bg-orange-400", name: "K.", dist: "1.2 km", note: 4.8 },
  { initial: "A", color: "bg-blue-500",   name: "A.", dist: "0.9 km", note: 4.9 },
  { initial: "M", color: "bg-green-500",  name: "M.", dist: "1.8 km", note: 4.7 },
  { initial: "S", color: "bg-purple-500", name: "S.", dist: "2.1 km", note: 4.6 },
  { initial: "I", color: "bg-rose-400",   name: "I.", dist: "0.7 km", note: 5.0 },
];

// Hook : déclenche micro-événements à intervalles aléatoires
function useMicroEvents(active) {
  const [microToast, setMicroToast] = useState(null);   // { icon, text }
  const [ghostDriver, setGhostDriver] = useState(null); // driver fantôme actif
  const toastTimer = useRef(null);
  const ghostTimer = useRef(null);

  useEffect(() => {
    if (!active) return;

    // Toast réseau — toutes les 6-11s
    const scheduleToast = () => {
      toastTimer.current = setTimeout(() => {
        const ev = MICRO_EVENTS[Math.floor(Math.random() * MICRO_EVENTS.length)];
        setMicroToast(ev);
        // Auto-dismiss après 2.8s
        setTimeout(() => setMicroToast(null), 2800);
        scheduleToast();
      }, 6000 + Math.random() * 5000);
    };

    // Carte livreur fantôme — toutes les 14-22s, visible 4s
    const scheduleGhost = () => {
      ghostTimer.current = setTimeout(() => {
        const driver = GHOST_DRIVERS[Math.floor(Math.random() * GHOST_DRIVERS.length)];
        setGhostDriver(driver);
        setTimeout(() => setGhostDriver(null), 4000);
        scheduleGhost();
      }, 14000 + Math.random() * 8000);
    };

    scheduleToast();
    // Premier fantôme après 10s minimum
    ghostTimer.current = setTimeout(() => {
      const driver = GHOST_DRIVERS[Math.floor(Math.random() * GHOST_DRIVERS.length)];
      setGhostDriver(driver);
      setTimeout(() => setGhostDriver(null), 4000);
      scheduleGhost();
    }, 10000);

    return () => {
      clearTimeout(toastTimer.current);
      clearTimeout(ghostTimer.current);
    };
  }, [active]);

  return { microToast, ghostDriver };
}

// ── Toast micro-événement réseau ──────────────────────────────────────────
function MicroEventToast({ event }) {
  return (
    <motion.div
      key={event.text}
      initial={{ opacity: 0, x: 40, scale: 0.92 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.92 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/95 shadow-lg shadow-black/10 border border-white/80 text-xs font-semibold text-gray-700 max-w-[220px]"
    >
      <span className="text-base">{event.icon}</span>
      <span>{event.text}</span>
    </motion.div>
  );
}

// ── Carte livreur fantôme (100% visuel, clairement "en analyse") ──────────
function GhostDriverCard({ driver }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="w-full rounded-2xl px-4 py-3.5 bg-white shadow-md shadow-black/8 border border-gray-100"
    >
      {/* Label disclaimer discret en haut */}
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Livreur analysé</span>
        <motion.div
          className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-100"
          animate={{ opacity: [1, 0.5, 1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        >
          <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          <span className="text-[10px] text-amber-600 font-semibold">En cours d'analyse</span>
        </motion.div>
      </div>

      <div className="flex items-center gap-3">
        {/* Avatar initial */}
        <div className={`h-11 w-11 rounded-full ${driver.color} flex items-center justify-center flex-shrink-0 shadow-sm`}>
          <span className="text-white font-black text-base">{driver.initial}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-bold text-gray-800 text-sm">Livreur {driver.name}</p>
            {/* Note étoile */}
            <div className="flex items-center gap-0.5">
              <span className="text-amber-400 text-xs">★</span>
              <span className="text-xs font-semibold text-gray-600">{driver.note}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <MapPin className="h-3 w-3 text-gray-400" />
            <span className="text-xs text-gray-500">{driver.dist} de vous</span>
          </div>
        </div>

        {/* Indicateur "vérification" */}
        <div className="flex flex-col items-center gap-1">
          <motion.div
            className="h-8 w-8 rounded-full border-2 border-blue-200 border-t-blue-500 flex items-center justify-center"
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          />
          <span className="text-[9px] text-gray-400 font-medium">Vérif.</span>
        </div>
      </div>
    </motion.div>
  );
}

// ── Variants Framer Motion pour les cartes ────────────────────────────────
const cardVariants = {
  enter: { opacity: 0, y: 14, scale: 0.97 },
  center: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.97 },
};
const cardTransition = { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] };

// ── Carte info individuelle ────────────────────────────────────────────────
function InfoCard({ icon: Icon, iconColor, bgColor, label, value, accent }) {
  return (
    <div className={`w-full rounded-2xl px-4 py-4 shadow-md shadow-black/5 border border-white/60 ${bgColor}`}>
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${accent}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
          <p className="font-bold text-gray-900 text-base truncate leading-tight">{value}</p>
        </div>
      </div>
    </div>
  );
}

// ── Carte "message statut" ─────────────────────────────────────────────────
function StatusCard({ emoji, title, subtitle }) {
  return (
    <div className="w-full rounded-2xl px-4 py-4 shadow-md shadow-black/5 bg-gradient-to-br from-blue-600 to-blue-700 text-white">
      <div className="flex items-center gap-3">
        <motion.span
          className="text-2xl"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 1 }}
        >{emoji}</motion.span>
        <div>
          <p className="font-bold text-sm leading-tight">{title}</p>
          {subtitle && <p className="text-xs text-blue-200 mt-0.5">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

export default function SearchingLivreurScreen({ course, livreurTrouve, aucunLivreur }) {
  const navigate = useNavigate();
  const [cardIndex, setCardIndex] = useState(0);
  const [notifiedCount, setNotifiedCount] = useState(0);
  const [nearbyMsg, setNearbyMsg] = useState(false);
  const timerRef = useRef(null);
  const countRef = useRef(0);
  const liveStatus = useLiveStatus();
  const etaSecs = useEtaCountdown(90000);
  const isSearching = !livreurTrouve && !aucunLivreur;
  const { microToast, ghostDriver } = useMicroEvents(isSearching);

  // ── Construire les séquences de cartes à partir des données course ──────
  const buildCards = useCallback(() => {
    if (!course) return [];
    const cards = [];

    // Message statut ouverture
    cards.push({ type: "status", emoji: "🔍", title: "Recherche des livreurs proches…", subtitle: "CDL analyse votre zone en temps réel" });

    if (course.prix) {
      cards.push({ type: "info", icon: Zap, iconColor: "text-amber-600", bgColor: "bg-amber-50", accent: "bg-amber-100", label: "Prix de la course", value: `${course.prix.toLocaleString()} FCFA` });
    }
    if (course.quartier_depart) {
      cards.push({ type: "info", icon: Navigation, iconColor: "text-green-600", bgColor: "bg-green-50", accent: "bg-green-100", label: "Lieu de récupération", value: course.quartier_depart });
    }
    if (course.quartier_arrivee) {
      cards.push({ type: "info", icon: MapPin, iconColor: "text-red-500", bgColor: "bg-red-50", accent: "bg-red-100", label: "Destination", value: course.quartier_arrivee });
    }
    if (course.nom_destinataire || course.telephone_destinataire) {
      const val = [course.nom_destinataire, course.telephone_destinataire].filter(Boolean).join(" · ");
      cards.push({ type: "info", icon: User, iconColor: "text-purple-600", bgColor: "bg-purple-50", accent: "bg-purple-100", label: "Destinataire", value: val });
    }
    if (course.type_colis) {
      cards.push({ type: "info", icon: Package, iconColor: "text-blue-600", bgColor: "bg-blue-50", accent: "bg-blue-100", label: "Type de colis", value: course.type_colis });
    }
    if (course.telephone_expediteur) {
      cards.push({ type: "info", icon: Phone, iconColor: "text-indigo-600", bgColor: "bg-indigo-50", accent: "bg-indigo-100", label: "Contact expéditeur", value: course.telephone_expediteur });
    }
    if (course.created_date) {
      cards.push({ type: "info", icon: Clock, iconColor: "text-gray-500", bgColor: "bg-gray-50", accent: "bg-gray-100", label: "Heure de création", value: moment(course.created_date).format("HH:mm") });
    }

    // Message intermédiaire
    cards.push({ type: "status", emoji: "📡", title: "Notification envoyée aux livreurs proches", subtitle: "En attente d'une réponse…" });
    cards.push({ type: "status", emoji: "⚡", title: "Un livreur proche consulte votre course", subtitle: "Restez ici, vous serez averti immédiatement" });
    cards.push({ type: "status", emoji: "🗺️", title: "Analyse GPS en cours…", subtitle: `${course.quartier_depart} → ${course.quartier_arrivee}` });

    return cards;
  }, [course]);

  const cards = buildCards();

  // ── Cycle automatique des cartes ─────────────────────────────────────────
  useEffect(() => {
    if (!cards.length || livreurTrouve || aucunLivreur) return;

    const schedule = () => {
      timerRef.current = setTimeout(() => {
        setCardIndex(i => {
          const next = (i + 1) % cards.length;
          // Simuler incrémentation livreurs notifiés à certains indices
          countRef.current += 1;
          if (countRef.current % 3 === 0) {
            setNotifiedCount(c => Math.min(c + 1, 8));
            vibrateLight();
          }
          // Message "livreur proche" au 3ème cycle
          if (countRef.current === 5) setNearbyMsg(true);
          return next;
        });
        schedule();
      }, nextDuration());
    };

    schedule();
    return () => clearTimeout(timerRef.current);
  }, [cards.length, livreurTrouve, aucunLivreur]);

  const currentCard = cards[cardIndex] || cards[0];

  // ── Écran livreur trouvé ──────────────────────────────────────────────────
  if (livreurTrouve) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="min-h-screen flex flex-col items-center justify-center p-6 space-y-5 text-center bg-gradient-to-b from-green-50 to-white"
      >
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="h-24 w-24 rounded-full bg-green-100 flex items-center justify-center shadow-lg shadow-green-200"
        >
          <span className="text-5xl">🛵</span>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="space-y-1">
          <p className="text-2xl font-black text-green-700">Livreur trouvé !</p>
          <p className="text-base font-bold text-gray-800">{livreurTrouve.livreur_name}</p>
          {livreurTrouve.telephone_livreur && (
            <a href={`tel:${livreurTrouve.telephone_livreur}`} className="text-primary underline text-sm block font-medium">
              {livreurTrouve.telephone_livreur}
            </a>
          )}
          <p className="text-sm text-muted-foreground pt-1">Votre livreur est en route pour récupérer votre colis.</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Button className="w-full max-w-xs h-12 rounded-2xl text-base font-bold shadow-lg shadow-primary/30" onClick={() => navigate('/mes-courses')}>
            Suivre ma course →
          </Button>
        </motion.div>
      </motion.div>
    );
  }

  // ── Écran de recherche principal ──────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-blue-600 via-blue-500 to-white relative overflow-hidden">
      <RadarBg />

      {/* Toast micro-événement réseau — coin bas droit, overlay */}
      <div className="fixed bottom-20 right-4 z-50 pointer-events-none">
        <AnimatePresence>
          {microToast && <MicroEventToast key={microToast.text} event={microToast} />}
        </AnimatePresence>
      </div>

      {/* Zone haute : spinner + titre */}
      <div className="relative z-10 flex flex-col items-center pt-12 pb-5 px-6 text-white text-center space-y-3">
        <MotoSpinner />

        {/* Statut dynamique progressif */}
        <AnimatePresence mode="wait">
          <motion.div
            key={liveStatus.text}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="space-y-0.5"
          >
            <p className="text-lg font-black tracking-tight leading-snug">{liveStatus.text}</p>
            <p className="text-sm text-blue-100">{liveStatus.sub}</p>
          </motion.div>
        </AnimatePresence>

        {/* Barre de progression */}
        <div className="w-full max-w-xs px-2">
          <ProgressBar totalMs={90000} />
        </div>

        <div className="flex items-center gap-3">
          <NotifiedPulse count={notifiedCount} />
          {/* ETA */}
          {etaSecs > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 3 }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 text-white/80 text-xs"
            >
              <Clock className="h-3 w-3" />
              ~{etaSecs > 60 ? `${Math.ceil(etaSecs / 60)} min` : `${etaSecs}s`}
            </motion.div>
          )}
        </div>
      </div>

      {/* Zone cartes animées */}
      <div className="relative z-10 flex-1 px-5 pb-6 space-y-4">
        {/* Carte principale en rotation */}
        <div className="relative h-[88px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={cardIndex}
              variants={cardVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={cardTransition}
              className="absolute inset-0"
            >
              {currentCard?.type === "status" ? (
                <StatusCard emoji={currentCard.emoji} title={currentCard.title} subtitle={currentCard.subtitle} />
              ) : currentCard ? (
                <InfoCard
                  icon={currentCard.icon}
                  iconColor={currentCard.iconColor}
                  bgColor={currentCard.bgColor}
                  accent={currentCard.accent}
                  label={currentCard.label}
                  value={currentCard.value}
                />
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Dots indicateurs de position */}
        <div className="flex items-center justify-center gap-1.5">
          {cards.map((_, i) => (
            <motion.div
              key={i}
              animate={{ width: i === cardIndex ? 16 : 5, opacity: i === cardIndex ? 1 : 0.3 }}
              transition={{ duration: 0.3 }}
              className="h-1.5 rounded-full bg-blue-500"
            />
          ))}
        </div>

        {/* Carte livreur fantôme — apparaît/disparaît de façon autonome */}
        <AnimatePresence mode="wait">
          {ghostDriver && (
            <GhostDriverCard key={ghostDriver.name + ghostDriver.dist} driver={ghostDriver} />
          )}
        </AnimatePresence>

        {/* Étapes de progression — évoluent avec liveStatus */}
        <div className="space-y-2 mt-2">
          <StepRow icon="✅" label="Course créée avec succès" done />
          <StepRow
            icon="📡"
            label={notifiedCount > 0 ? `${notifiedCount} livreur${notifiedCount > 1 ? "s" : ""} notifié${notifiedCount > 1 ? "s" : ""}` : "Notification aux livreurs proches"}
            done={notifiedCount > 0}
            active={notifiedCount === 0}
          />
          <StepRow
            icon="🔍"
            label={liveStatus.text}
            active={notifiedCount > 0}
          />
        </div>

        {/* Bouton discret */}
        <div className="pt-4 text-center">
          <button
            onClick={() => navigate('/mes-courses')}
            className="text-xs text-gray-400 underline underline-offset-2"
          >
            Voir toutes mes courses
          </button>
        </div>
      </div>
    </div>
  );
}

function StepRow({ icon, label, done, active }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
        done ? "bg-green-50 text-green-700 border border-green-100"
        : active ? "bg-blue-50 text-blue-600 border border-blue-100"
        : "bg-gray-50 text-gray-400 border border-gray-100"
      }`}
    >
      <span className="text-sm">{icon}</span>
      <span>{label}</span>
      {active && (
        <motion.div
          className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400"
          animate={{ scale: [1, 1.6, 1], opacity: [1, 0.3, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}
    </motion.div>
  );
}