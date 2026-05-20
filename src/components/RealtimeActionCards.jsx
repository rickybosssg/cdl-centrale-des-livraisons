/**
 * RealtimeActionCards — Système de notifications visuelles temps réel style Uber/Glovo
 * 
 * Affiche des cartes flottantes INTERACTIVES avec :
 * - Informations riches (départ, arrivée, prix, urgence, type colis)
 * - Actions directes (Accepter/Refuser/Assigner/Voir/Suivre)
 * - Multi-rôles (Admin, Livreur, Client, Partenaire, Commercial)
 * - Écoute événements Course EN TEMPS RÉEL + entité Notification
 * - Visible sur TOUTES les pages, au-dessus de tout
 * - Vibration + son optionnel
 * - Disparition auto après 12s
 * 
 * Événements écoutés :
 * - Course : create, update (statut changes)
 * - Notification : create (notifications internes)
 */
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MapPin, Clock, Package, TrendingUp, User, Phone, Check, XCircle, Eye, Navigation } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";

const DISPLAY_DURATION = 12;

// ─── Son léger ───────────────────────────────────────────────────────────────
function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (_) {}
}

// ─── Résoudre actions selon rôle et événement ────────────────────────────────
function resolveActions(event, userRole, userEmail) {
  const course = event.data;
  const actions = [];

  // LIVREUR
  if (userRole === 'livreur') {
    if (event.type === 'create' && course.statut === 'en_attente') {
      actions.push({
        label: 'Accepter',
        icon: Check,
        action: 'accept',
        color: '#16A34A',
        bgColor: '#DCFCE7',
      });
      actions.push({
        label: 'Refuser',
        icon: XCircle,
        action: 'refuse',
        color: '#DC2626',
        bgColor: '#FEE2E2',
      });
    }
    if (course.statut === 'assignee_attente' && course.livreur_email === userEmail) {
      actions.push({ label: 'Accepter', icon: Check, action: 'accept', color: '#16A34A', bgColor: '#DCFCE7' });
      actions.push({ label: 'Refuser', icon: XCircle, action: 'refuse', color: '#DC2626', bgColor: '#FEE2E2' });
    }
    if (['acceptee', 'en_cours', 'driver_en_route_pickup', 'arrived_pickup', 'arrived_dropoff'].includes(course.statut)) {
      actions.push({ label: 'Voir', icon: Eye, action: 'view', color: '#2563EB', bgColor: '#DBEAFE' });
      if (course.statut !== 'livree') {
        actions.push({ label: 'Suivre', icon: Navigation, action: 'track', color: '#7C3AED', bgColor: '#EDE9FE' });
      }
    }
  }

  // ADMIN
  if (userRole === 'admin' || userRole === 'dispatcher') {
    if (course.statut === 'en_attente' || course.statut === 'aucun_livreur') {
      actions.push({ label: 'Assigner', icon: User, action: 'assign', color: '#2563EB', bgColor: '#DBEAFE' });
    }
    actions.push({ label: 'Voir', icon: Eye, action: 'view', color: '#2563EB', bgColor: '#DBEAFE' });
    if (!['livree', 'annulee'].includes(course.statut)) {
      actions.push({ label: 'Annuler', icon: XCircle, action: 'cancel', color: '#DC2626', bgColor: '#FEE2E2' });
    }
  }

  // CLIENT
  if (userRole === 'client') {
    if (course.statut === 'acceptee' || course.statut === 'en_cours') {
      actions.push({ label: 'Suivre', icon: Navigation, action: 'track', color: '#7C3AED', bgColor: '#EDE9FE' });
    }
    actions.push({ label: 'Voir', icon: Eye, action: 'view', color: '#2563EB', bgColor: '#DBEAFE' });
  }

  // PARTENAIRE
  if (userRole === 'partenaire') {
    actions.push({ label: 'Voir', icon: Eye, action: 'view', color: '#2563EB', bgColor: '#DBEAFE' });
  }

  // COMMERCIAL
  if (userRole === 'commercial') {
    actions.push({ label: 'Voir', icon: Eye, action: 'view', color: '#2563EB', bgColor: '#DBEAFE' });
  }

  return actions;
}

// ─── Mapping événement → Titre/Message ───────────────────────────────────────
function mapEventToNotif(event, userRole) {
  const course = event.data;
  const type = event.type;

  // TITRE
  let titre = '';
  let message = '';
  let icon = 'ℹ️';
  let priority = 'info';

  if (type === 'create') {
    if (userRole === 'admin' || userRole === 'dispatcher') {
      titre = '🆕 Nouvelle course';
      message = `${course.quartier_depart} → ${course.quartier_arrivee} — ${course.prix || 0} FCFA — ${course.type_colis || 'Colis'}`;
      icon = '📦';
      priority = 'warning';
    }
    if (userRole === 'livreur') {
      titre = '📍 Course disponible';
      message = `${course.quartier_depart} → ${course.quartier_arrivee} — ${course.prix || 0} FCFA — ${(course.montant_base || 0) * 0.8 || 0} FCFA pour vous`;
      icon = '🛵';
      priority = 'success';
    }
  }

  if (type === 'update') {
    const oldStatut = event.old_data?.statut;
    const newStatut = course.statut;

    // LIVREUR
    if (userRole === 'livreur') {
      if (oldStatut === 'assignee_attente' && newStatut === 'acceptee') {
        titre = '✅ Course acceptée';
        message = `Vous avez accepté la course ${course.quartier_depart} → ${course.quartier_arrivee}`;
        icon = '✅';
        priority = 'success';
      }
      if (oldStatut === 'en_attente' && newStatut === 'assignee_attente' && course.livreur_email === course.livreur_email) {
        titre = '🎯 Course assignée';
        message = `Course assignée : ${course.quartier_depart} → ${course.quartier_arrivee}`;
        icon = '🎯';
        priority = 'warning';
      }
      if (newStatut === 'annulee') {
        titre = '❌ Course annulée';
        message = `La course ${course.quartier_depart} → ${course.quartier_arrivee} a été annulée`;
        icon = '❌';
        priority = 'danger';
      }
    }

    // ADMIN
    if (userRole === 'admin' || userRole === 'dispatcher') {
      if (oldStatut === 'en_attente' && newStatut === 'acceptee') {
        titre = '✅ Livreur assigné';
        message = `${course.livreur_name || 'Livreur'} a accepté la course`;
        icon = '✅';
        priority = 'success';
      }
      if (newStatut === 'livree') {
        titre = '🏁 Course livrée';
        message = `Course terminée — Gain livreur: ${course.gain_livreur || 0} FCFA`;
        icon = '🏁';
        priority = 'success';
      }
      if (newStatut === 'annulee') {
        titre = '❌ Course annulée';
        message = `Course ${course.quartier_depart} → ${course.quartier_arrivee} annulée`;
        icon = '❌';
        priority = 'danger';
      }
      if (newStatut === 'aucun_livreur') {
        titre = '⚠️ Aucun livreur trouvé';
        message = `Course en attente depuis ${course.nombre_tentatives || 0} tentatives`;
        icon = '⚠️';
        priority = 'danger';
      }
    }

    // CLIENT
    if (userRole === 'client') {
      if (oldStatut === 'en_attente' && newStatut === 'acceptee') {
        titre = '🛵 Livreur assigné';
        message = `${course.livreur_name || 'Votre livreur'} arrive pour récupérer votre colis`;
        icon = '🛵';
        priority = 'success';
      }
      if (newStatut === 'en_cours') {
        titre = '🚚 En route';
        message = 'Votre livreur est en route vers la destination';
        icon = '🚚';
        priority = 'info';
      }
      if (newStatut === 'livree') {
        titre = '✅ Course livrée';
        message = 'Votre colis a été livré avec succès';
        icon = '✅';
        priority = 'success';
      }
      if (newStatut === 'annulee') {
        titre = '❌ Course annulée';
        message = 'Votre course a été annulée';
        icon = '❌';
        priority = 'danger';
      }
    }
  }

  return { titre, message, icon, priority };
}

// ─── Carte d'action ──────────────────────────────────────────────────────────
function ActionCard({ event, userRole, userEmail, onDismiss }) {
  const navigate = useNavigate();
  const [timeLeft, setTimeLeft] = useState(DISPLAY_DURATION);
  const intervalRef = useRef(null);
  const course = event.data;

  const { titre, message, icon, priority } = mapEventToNotif(event, userRole);
  const actions = resolveActions(event, userRole, userEmail);

  const style = {
    success: { bg: "#F0FDF4", border: "#86EFAC", text: "#166534" },
    warning: { bg: "#FFFBEB", border: "#FCD34D", text: "#92400E" },
    danger:  { bg: "#FEF2F2", border: "#FCA5A5", text: "#991B1B" },
    info:    { bg: "#EFF6FF", border: "#93C5FD", text: "#1E40AF" },
  }[priority] || { bg: "#EFF6FF", border: "#93C5FD", text: "#1E40AF" };

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(intervalRef.current); onDismiss(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const handleAction = async (actionType) => {
    onDismiss();
    
    if (actionType === 'accept') {
      try {
        await base44.functions.invoke('courseStateMachine', {
          course_id: course.id,
          action: 'ACCEPT',
        });
      } catch (e) {
        console.error('Accept error:', e);
      }
    } else if (actionType === 'refuse') {
      try {
        await base44.functions.invoke('courseStateMachine', {
          course_id: course.id,
          action: 'REFUSE',
        });
      } catch (e) {
        console.error('Refuse error:', e);
      }
    } else if (actionType === 'assign') {
      navigate('/gerer-courses', { state: { courseId: course.id } });
    } else if (actionType === 'view') {
      navigate(`/course/${course.id}`);
    } else if (actionType === 'track') {
      navigate(`/course/${course.id}/track`);
    } else if (actionType === 'cancel') {
      navigate(`/course/${course.id}`, { state: { showCancel: true } });
    }
  };

  return (
    <motion.div
      initial={{ y: -80, opacity: 0, scale: 0.95 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: -80, opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", damping: 22, stiffness: 300 }}
      style={{
        background: style.bg,
        border: `2px solid ${style.border}`,
        borderRadius: "16px",
        padding: "14px",
        boxShadow: "0 12px 48px rgba(0,0,0,0.15)",
        marginBottom: "10px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Barre de progression */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "4px", background: "rgba(0,0,0,0.08)" }}>
        <motion.div
          style={{ height: "100%", background: style.border, width: `${(timeLeft / DISPLAY_DURATION) * 100}%` }}
          transition={{ duration: 0.8 }}
        />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-start gap-2 flex-1">
          <span className="text-2xl flex-shrink-0">{icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold leading-tight" style={{ color: style.text }}>{titre}</p>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: style.text, opacity: 0.85 }}>
              {message.length > 100 ? message.slice(0, 100) + '…' : message}
            </p>
          </div>
        </div>
        <button onClick={onDismiss} className="flex-shrink-0 p-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.08)" }}>
          <X className="h-4 w-4" style={{ color: style.text }} />
        </button>
      </div>

      {/* Détails riches */}
      <div className="grid grid-cols-2 gap-2 mb-3 text-xs" style={{ color: style.text }}>
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" style={{ opacity: 0.7 }} />
          <span className="truncate">{course.quartier_depart}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" style={{ opacity: 0.7 }} />
          <span className="truncate">{course.quartier_arrivee}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5" style={{ opacity: 0.7 }} />
          <span>{course.type_colis || 'Colis'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5" style={{ opacity: 0.7 }} />
          <span className="font-bold">{course.prix || 0} FCFA</span>
        </div>
        {course.urgence && (
          <div className="flex items-center gap-1.5 col-span-2">
            <Clock className="h-3.5 w-3.5" style={{ opacity: 0.7 }} />
            <span className="font-bold uppercase">{course.urgence}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      {actions.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {actions.map((action, idx) => {
            const Icon = action.icon;
            return (
              <button
                key={idx}
                onClick={() => handleAction(action.action)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-transform active:scale-95"
                style={{ background: action.bgColor, color: action.color }}
              >
                <Icon className="h-3.5 w-3.5" />
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

// ─── Composant principal ─────────────────────────────────────────────────────
export default function RealtimeActionCards({ userEmail, userRole }) {
  const [queue, setQueue] = useState([]);
  const seenRef = useRef(new Set());
  const mountedAt = useRef(Date.now());

  useEffect(() => {
    if (!userEmail || !userRole) return;

    // ─── Subscription Cours (événements temps réel) ──────────────────────────
    const unsubCourse = base44.entities.Course.subscribe((event) => {
      if (!event.data) return;
      const course = event.data;

      // Filtrer par pertinence selon le rôle
      if (userRole === 'livreur') {
        // Livreur : courses disponibles, assignées, ou en cours
        if (event.type === 'create' && course.statut !== 'en_attente') return;
        if (event.type === 'update' && course.livreur_email !== userEmail && course.statut === 'en_attente') return;
      } else if (userRole === 'client') {
        // Client : seulement ses courses
        if (course.client_email !== userEmail) return;
      } else if (userRole === 'admin' || userRole === 'dispatcher') {
        // Admin : toutes les courses
      } else {
        return; // Autres rôles : pas d'alertes courses
      }

      // Éviter doublons
      const key = `${event.type}_${event.id}_${Date.now()}`;
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);

      // Son + vibration
      playNotifSound();
      try { navigator.vibrate?.([80, 40, 80]); } catch (_) {}

      setQueue(prev => [...prev, { ...event, _alertId: key, _ts: Date.now() }]);
    });

    // ─── Subscription Notifications (backup) ─────────────────────────────────
    const unsubNotif = base44.entities.Notification.subscribe((event) => {
      if (event.type !== 'create') return;
      const notif = event.data;
      if (!notif || notif.destinataire_email !== userEmail) return;

      const notifAge = Date.now() - new Date(notif.created_date || 0).getTime();
      if (notifAge > 30000) return; // plus de 30s → ancien

      const key = `notif_${notif.id}_${Date.now()}`;
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);

      playNotifSound();
      try { navigator.vibrate?.([80, 40, 80]); } catch (_) {}

      setQueue(prev => [...prev, { 
        type: 'notification', 
        data: notif, 
        _alertId: key, 
        _ts: Date.now() 
      }]);
    });

    return () => {
      unsubCourse?.();
      unsubNotif?.();
    };
  }, [userEmail, userRole]);

  const dismiss = (alertId) => {
    setQueue(prev => prev.filter(n => n._alertId !== alertId));
  };

  // Max 3 alertes simultanées
  const visible = queue.slice(-3);

  return (
    <div
      style={{
        position: "fixed",
        top: "max(env(safe-area-inset-top), 10px)",
        left: "10px",
        right: "10px",
        zIndex: 99999,
        pointerEvents: "none",
      }}
    >
      <div style={{ pointerEvents: "auto" }}>
        <AnimatePresence>
          {visible.map(item => {
            if (item.type === 'notification') {
              // Notification classique (entité Notification)
              return null; // Géré par GlobalRealtimeAlert si besoin
            }
            return (
              <ActionCard
                key={item._alertId}
                event={item}
                userRole={userRole}
                userEmail={userEmail}
                onDismiss={() => dismiss(item._alertId)}
              />
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}