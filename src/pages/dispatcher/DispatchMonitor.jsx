import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { classifyDriversForCourse } from "@/lib/dispatch";
import {
  ArrowLeft, RefreshCw, Zap, Users, AlertCircle, Clock,
  MapPin, TrendingUp, ToggleLeft, ToggleRight, Lock,
  UserCheck, ChevronDown, ChevronUp, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DispatchStatsWidget from "@/components/DispatchStatsWidget";
import DispatchDriversStats from "@/components/DispatchDriversStats";
import { toast } from "sonner";
import moment from "moment";

// Statuts affichables
const STATUT_CFG = {
  en_attente:         { label: "⏳ En attente",      badge: "bg-amber-100 text-amber-800" },
  en_attente_dispatch:{ label: "📋 À dispatcher",    badge: "bg-orange-100 text-orange-800" },
  assignee_attente:   { label: "📡 Proposée",        badge: "bg-blue-100 text-blue-800" },
  acceptee:           { label: "✅ Acceptée",         badge: "bg-green-100 text-green-800" },
  en_cours:           { label: "🚀 En cours",         badge: "bg-primary/10 text-primary" },
  livree:             { label: "📦 Livrée",           badge: "bg-green-50 text-green-700" },
  aucun_livreur:      { label: "❌ Sans livreur",     badge: "bg-red-100 text-red-800" },
  echec_dispatch:     { label: "🚫 Échec dispatch",   badge: "bg-red-100 text-red-800" },
  annulee:            { label: "🚫 Annulée",          badge: "bg-gray-100 text-gray-600" },
};

// Card d'une course en attente de dispatch
function CourseDispatchCard({ course, livreurs, isManuel, onAssign, onRelancer, onAnnuler }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [driversRanked, setDriversRanked] = useState([]);
  const [assigning, setAssigning] = useState(false);

  const urgenceColor = course.urgence === 'tres_urgent'
    ? 'border-red-400 bg-red-50'
    : course.urgence === 'urgent'
    ? 'border-orange-400 bg-orange-50'
    : 'border-border bg-card';

  const loadDrivers = async () => {
    setLoadingDrivers(true);
    try {
      const ranked = await classifyDriversForCourse(course);
      setDriversRanked(ranked.slice(0, 8));
      if (ranked.length > 0) setSelectedDriver(ranked[0].driver);
    } catch (e) {
      console.error('[DispatchCard] Erreur chargement livreurs:', e);
    }
    setLoadingDrivers(false);
  };

  const handleExpand = () => {
    if (!expanded) loadDrivers();
    setExpanded(v => !v);
  };

  const handleAssign = async () => {
    if (!selectedDriver) return toast.error('Sélectionnez un livreur');
    setAssigning(true);
    await onAssign(course, selectedDriver);
    setAssigning(false);
    setExpanded(false);
  };

  const cfg = STATUT_CFG[course.statut] || STATUT_CFG.en_attente;

  return (
    <div className={`rounded-2xl border-2 overflow-hidden ${urgenceColor}`}>
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
              {course.urgence === 'tres_urgent' && <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">🚨 TRÈS URGENT</span>}
              {course.urgence === 'urgent' && <span className="text-[10px] font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">⚡ URGENT</span>}
            </div>
            <p className="text-sm font-bold">{course.quartier_depart} → {course.quartier_arrivee}</p>
            <p className="text-xs text-muted-foreground">{course.type_colis} · <strong>{course.prix} FCFA</strong></p>
            <p className="text-xs text-muted-foreground">
              {course.client_name} · {moment(course.created_date).fromNow()}
            </p>
            {(course.nombre_tentatives || 0) > 0 && (
              <p className="text-xs text-amber-600 font-medium">{course.nombre_tentatives} tentative(s)</p>
            )}
            {course.dispatch_fail_reason && (
              <p className="text-[10px] text-red-600 italic mt-0.5">⚠️ {course.dispatch_fail_reason}</p>
            )}
          </div>
          <button onClick={handleExpand} className="flex-shrink-0 p-1.5 rounded-lg hover:bg-muted/50">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {/* Actions rapides */}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={handleExpand}>
            <UserCheck className="h-3 w-3 mr-1" />
            {isManuel ? 'Assigner' : 'Voir livreurs'}
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs px-3" onClick={() => onRelancer(course)}>
            <Zap className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs px-3 border-red-300 text-red-600 hover:bg-red-50" onClick={() => onAnnuler(course)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Panneau élargi — choix livreur */}
      {expanded && (
        <div className="border-t bg-background p-3 space-y-3">
          {loadingDrivers ? (
            <div className="flex items-center justify-center py-4">
              <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
              <span className="ml-2 text-xs text-muted-foreground">Chargement livreurs...</span>
            </div>
          ) : driversRanked.length === 0 ? (
            <p className="text-xs text-center text-red-600 py-2">Aucun livreur éligible disponible</p>
          ) : (
            <>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Livreurs classés par score</p>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {driversRanked.map(({ driver, score }) => (
                  <button
                    key={driver.id}
                    onClick={() => setSelectedDriver(driver)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${
                      selectedDriver?.id === driver.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <div className={`h-2 w-2 rounded-full flex-shrink-0 ${driver.disponible ? 'bg-green-500' : 'bg-red-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{driver.full_name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {driver.quartier || '—'} · {driver.nombre_courses_actives || 0} cours. actives
                        {driver.note_moyenne ? ` · ⭐${driver.note_moyenne.toFixed(1)}` : ''}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full flex-shrink-0">
                      {score} pts
                    </span>
                  </button>
                ))}
              </div>
              <Button
                className="w-full h-9"
                onClick={handleAssign}
                disabled={assigning || !selectedDriver}
              >
                {assigning ? (
                  <><div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Assignation...</>
                ) : (
                  <><UserCheck className="h-4 w-4 mr-2" />Assigner à {selectedDriver?.full_name?.split(' ')[0]}</>
                )}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function DispatchMonitor() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [livreurs, setLivreurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [dispatchConfig, setDispatchConfig] = useState(null);
  const [togglingMode, setTogglingMode] = useState(false);

  const loadDispatchConfig = useCallback(async () => {
    try {
      const configs = await base44.entities.DispatchConfig.list('-updated_date', 1);
      if (configs.length > 0) {
        const cfg = configs[0];
        // Normaliser : "manual" → "manuel"
        const normalized = cfg.mode === 'manual' ? 'manuel' : (cfg.mode || 'auto');
        console.log(`[DISPATCH_MODE_READ] raw=${cfg.mode} | normalized=${normalized} | id=${cfg.id} | source=BDD`);
        setDispatchConfig({ ...cfg, mode: normalized });
      } else {
        // Aucune config en BDD — afficher "auto" en UI uniquement, SANS écrire en BDD
        // La création doit être explicite via un clic admin, jamais automatique
        console.log(`[DISPATCH_CONFIG_BOOT_READ] Aucune config BDD — affichage auto (lecture seule, pas d'écriture)`);
        setDispatchConfig({ mode: 'auto', _local_only: true });
      }
    } catch (err) {
      console.error(`[DISPATCH_CONFIG_BOOT_READ] Erreur lecture BDD | err=${err.message}`);
    }
  }, []);

  const load = useCallback(async () => {
    const [coursesData, allUsers] = await Promise.all([
      base44.entities.Course.list("-created_date", 150),
      // Charger tous les users — le filtre strict se fait côté JS
      base44.entities.User.list('-updated_date', 500),
    ]);
    setCourses(coursesData || []);
    // Critères SANS current_role : profil_valide + driver_online
    // Un livreur multi-profils (ex: commercial+livreur) est inclus dès qu'il a profil_valide=true et driver_online=true
    const livreursData = (allUsers || []).filter(u =>
      u.driver_online === true && u.profil_valide === true
    );
    setLivreurs(livreursData);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  const toggleMode = async () => {
    if (!dispatchConfig) return;
    setTogglingMode(true);

    const previousMode = dispatchConfig.mode;
    // Valeurs BDD : "auto" ou "manuel"
    const newMode = (previousMode === 'auto') ? 'manuel' : 'auto';

    console.log(`[DISPATCH_MODE_UPDATE_START] UI toggle : ${previousMode} → ${newMode}`);

    // Mise à jour optimiste
    setDispatchConfig(prev => ({ ...prev, mode: newMode }));

    try {
      const res = await base44.functions.invoke('setDispatchMode', { mode: newMode });
      if (!res.data?.success) throw new Error(res.data?.error || 'Erreur backend setDispatchMode');

      const confirmedMode = res.data?.config?.mode || newMode;
      if (res.data?.config) {
        setDispatchConfig(res.data.config);
      } else {
        await loadDispatchConfig();
      }

      console.log(`[DISPATCH_MODE_UPDATE_SUCCESS] mode confirmé BDD=${confirmedMode}`);
      if (confirmedMode === 'manuel') {
        console.log(`[DISPATCH_AUTO_BLOCKED_MANUAL_MODE] Mode manuel actif — autoDispatch bloqué côté backend`);
      }
      toast.success(confirmedMode === 'auto' ? '⚡ Mode automatique activé' : '🔧 Mode manuel activé');
    } catch (err) {
      console.error(`[DISPATCH_MODE_UPDATE_START] ❌ Échec rollback → ${previousMode} | err=${err.message}`);
      setDispatchConfig(prev => ({ ...prev, mode: previousMode }));
      toast.error('Erreur changement de mode: ' + err.message);
    } finally {
      setTogglingMode(false);
    }
  };

  // Assigner manuellement un livreur à une course
  const handleAssign = async (course, driver) => {
    const now = new Date().toISOString();
    let historique = [];
    try { if (course.historique_assignation) historique = JSON.parse(course.historique_assignation); } catch (_) {}
    historique.push({
      livreur_email: driver.email,
      livreur_nom: driver.full_name,
      heure: now,
      statut: 'proposee',
      mode: 'manuel_admin',
    });

    await base44.entities.Course.update(course.id, {
      statut: 'assignee_attente',
      livreur_email: driver.email,
      livreur_name: driver.full_name,
      telephone_livreur: driver.telephone || '',
      heure_assignation: now,
      mode_assignation: 'manuel',
      nombre_tentatives: (course.nombre_tentatives || 0) + 1,
      historique_assignation: JSON.stringify(historique),
    });
    await base44.entities.User.update(driver.id, {
      nombre_courses_actives: (driver.nombre_courses_actives || 0) + 1,
      courses_proposees: (driver.courses_proposees || 0) + 1,
    });
    // Notif livreur
    await base44.entities.Notification.create({
      destinataire_email: driver.email,
      destinataire_role: 'livreur',
      titre: '🛵 Nouvelle course assignée par l\'admin !',
      message: `Course de ${course.quartier_depart} → ${course.quartier_arrivee}. Prix: ${course.prix} FCFA.`,
      type: 'success',
      lue: false,
      course_id: course.id,
      target_screen: `/course-livreur/${course.id}`,
    }).catch(() => {});

    toast.success(`✅ Assigné à ${driver.full_name}`);
    load();
  };

  // Relancer le dispatch auto sur une course
  const handleRelancer = async (course) => {
    try {
      const res = await base44.functions.invoke('autoDispatch', { course_id: course.id, force: true });
      if (res.data?.success) {
        toast.success(`✅ Dispatché vers ${res.data.livreur?.nom}`);
      } else {
        toast.error('❌ ' + (res.data?.message || 'Aucun livreur disponible'));
      }
      load();
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    }
  };

  // Annuler une course
  const handleAnnuler = async (course) => {
    if (!window.confirm(`Annuler la course ${course.quartier_depart}→${course.quartier_arrivee} ?`)) return;
    await base44.entities.Course.update(course.id, { statut: 'annulee' });
    toast.success('Course annulée');
    load();
  };

  useEffect(() => {
    loadDispatchConfig();
    load();
    const interval = setInterval(load, 20000);

    // Temps réel — DispatchConfig (sync multi-écrans instantanée)
    const unsubConfig = base44.entities.DispatchConfig.subscribe((event) => {
      if ((event.type === "update" || event.type === "create") && event.data) {
        console.log(`[DISPATCH_MODE_SUBSCRIBE_RECEIVED] event=${event.type} | mode=${event.data.mode} | id=${event.data.id}`);
        if (event.data.mode === 'manuel') {
          console.log(`[DISPATCH_AUTO_BLOCKED_MANUAL_MODE] Mode manuel reçu via realtime — dispatch auto bloqué`);
        }
        setDispatchConfig(event.data);
      }
    });

    // Temps réel — Courses
    const unsubCourses = base44.entities.Course.subscribe((event) => {
      if (event.type === "create") setCourses(prev => [event.data, ...prev]);
      else if (event.type === "update") setCourses(prev => prev.map(c => c.id === event.id ? event.data : c));
    });

    // Temps réel — Livreurs (driver_online, profil_valide, nombre_courses_actives)
    // SANS current_role : inclut tout utilisateur avec profil_valide=true + driver_online=true
    const unsubUsers = base44.entities.User.subscribe((event) => {
      if (event.type === "update" && event.data) {
        setLivreurs(prev => {
          const exists = prev.find(l => l.id === event.id);
          const isEligible = event.data.driver_online && event.data.profil_valide;
          if (exists) {
            if (!isEligible) return prev.filter(l => l.id !== event.id);
            return prev.map(l => l.id === event.id ? event.data : l);
          }
          if (isEligible) return [event.data, ...prev];
          return prev;
        });
      } else if (event.type === "create" && event.data?.driver_online && event.data?.profil_valide) {
        setLivreurs(prev => [event.data, ...prev]);
      }
    });

    return () => { clearInterval(interval); unsubConfig(); unsubCourses(); unsubUsers(); };
  }, []);

  // Source unique : BDD — "manuel" ou "auto"
  const isManuel = dispatchConfig?.mode === 'manuel';
  // Filtre SANS current_role — basé sur profil_valide + driver_online + non bloqué/suspendu
  const livreursOnline = livreurs.filter(l => !l.livreur_bloque && !l.livreur_suspendu);
  const livreursDispatchables = livreurs.filter(l =>
    !l.livreur_bloque && !l.livreur_suspendu &&
    l.disponible !== false &&
    (l.nombre_courses_actives || 0) < 2
  );

  const coursesEnAttente = courses.filter(c => ['en_attente', 'en_attente_dispatch'].includes(c.statut));
  const coursesProposees = courses.filter(c => c.statut === 'assignee_attente');
  const coursesAcceptees = courses.filter(c => ['acceptee', 'en_cours'].includes(c.statut));
  const coursesEchec = courses.filter(c => ['aucun_livreur', 'echec_dispatch'].includes(c.statut));
  const livreesToday = courses.filter(c => c.statut === 'livree' && new Date(c.updated_date).toDateString() === new Date().toDateString());

  // Courses nécessitant une action admin
  const aDispatcher = [...coursesEnAttente, ...coursesEchec];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-16">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Dispatch Monitor</h1>
          <p className="text-xs text-muted-foreground">
            Mis à jour {lastRefresh ? moment(lastRefresh).format("HH:mm:ss") : "..."}
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={load}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Bandeau Mode */}
      <div className={`rounded-2xl border-2 p-4 ${!isManuel ? 'bg-green-50 border-green-400' : 'bg-amber-50 border-amber-400'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full flex-shrink-0 ${!isManuel ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
            <div>
              <p className={`font-bold text-base ${!isManuel ? 'text-green-800' : 'text-amber-800'}`}>
                {!isManuel ? '⚡ Mode automatique activé' : '🔧 Mode manuel activé'}
              </p>
              <p className={`text-xs ${!isManuel ? 'text-green-700' : 'text-amber-700'}`}>
                {!isManuel ? 'Courses assignées automatiquement selon le score' : 'Toutes les courses attendent votre assignation manuelle'}
              </p>
              {dispatchConfig?.last_changed_by && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Modifié par {dispatchConfig.last_changed_by}
                  {dispatchConfig.last_changed_at ? ` · ${moment(dispatchConfig.last_changed_at).format('DD/MM HH:mm')}` : ''}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                <Lock className="h-2.5 w-2.5" /> Source : BDD — ne se réinitialise jamais seul
              </p>
            </div>
          </div>
          <button
            onClick={toggleMode}
            disabled={togglingMode}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 disabled:opacity-50 ${
              !isManuel ? 'border-amber-400 text-amber-700 bg-white hover:bg-amber-50' : 'border-green-400 text-green-700 bg-white hover:bg-green-50'
            }`}
          >
            {!isManuel ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
            {togglingMode ? 'Sauvegarde...' : !isManuel ? 'Activer manuel' : 'Activer auto'}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-orange-600">{aDispatcher.length}</p>
            <p className="text-[10px] text-muted-foreground">À dispatcher</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{coursesProposees.length}</p>
            <p className="text-[10px] text-muted-foreground">Proposées</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{coursesAcceptees.length}</p>
            <p className="text-[10px] text-muted-foreground">Acceptées</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{coursesEchec.length}</p>
            <p className="text-[10px] text-muted-foreground">Échecs</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-cyan-500">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-cyan-600">{livreursOnline.length}</p>
            <p className="text-[10px] text-muted-foreground">En ligne</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-teal-500">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-teal-600">{livreursDispatchables.length}</p>
            <p className="text-[10px] text-muted-foreground">Dispatchables</p>
          </CardContent>
        </Card>
      </div>

      {/* Vue détaillée livreurs */}
      <DispatchDriversStats />

      <div className="grid grid-cols-3 gap-2" style={{display:'none'}}>
      </div>

      {/* Courses à dispatcher */}
      {aDispatcher.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-orange-700">
              🚨 {aDispatcher.length} course(s) à dispatcher
            </p>
            {!isManuel && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 border-orange-300 text-orange-700"
                onClick={async () => {
                  for (const c of aDispatcher) {
                    base44.functions.invoke('autoDispatch', { course_id: c.id, force: true }).catch(() => {});
                  }
                  toast.success('Relance en cours...');
                  setTimeout(load, 2000);
                }}
              >
                <Zap className="h-3 w-3 mr-1" />Tout relancer
              </Button>
            )}
          </div>
          {aDispatcher.map(course => (
            <CourseDispatchCard
              key={course.id}
              course={course}
              livreurs={livreursDispatchables}
              isManuel={isManuel}
              onAssign={handleAssign}
              onRelancer={handleRelancer}
              onAnnuler={handleAnnuler}
            />
          ))}
        </div>
      )}

      {/* Courses proposées en attente de réponse livreur */}
      {coursesProposees.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">📡 En attente de réponse ({coursesProposees.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {coursesProposees.map(c => {
              const expire = c.heure_assignation ? new Date(new Date(c.heure_assignation).getTime() + 60000) : null;
              const expired = expire && new Date() > expire;
              return (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border bg-blue-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{c.quartier_depart} → {c.quartier_arrivee}</p>
                    <p className="text-[10px] text-muted-foreground">{c.livreur_name} · {c.prix} FCFA</p>
                    {expire && (
                      <p className={`text-[10px] font-medium ${expired ? 'text-red-600' : 'text-blue-600'}`}>
                        {expired ? '⚠️ Délai expiré' : `⏱ Expire ${moment(expire).fromNow()}`}
                      </p>
                    )}
                  </div>
                  <Button size="sm" className="text-xs h-7" onClick={() => handleRelancer(c)}>
                    <Zap className="h-3 w-3 mr-1" />Relancer
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Livreurs en ligne */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Livreurs en ligne ({livreursOnline.length}) — dispatchables ({livreursDispatchables.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {livreursOnline.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">Aucun livreur en ligne</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {livreursOnline.map(l => (
                <div key={l.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-green-50 border border-green-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  <span className="text-xs font-medium text-green-800">{l.full_name?.split(" ")[0]}</span>
                  {l.gps_latitude && <MapPin className="h-3 w-3 text-green-600" />}
                  {(l.nombre_courses_actives || 0) > 0 && (
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded">{l.nombre_courses_actives}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Flux en cours */}
      {coursesAcceptees.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">🚀 En livraison ({coursesAcceptees.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {coursesAcceptees.map(c => (
              <div key={c.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/40 border">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">{c.quartier_depart} → {c.quartier_arrivee}</p>
                  <p className="text-[10px] text-muted-foreground">{c.livreur_name} · {moment(c.date_acceptation || c.created_date).fromNow()}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUT_CFG[c.statut]?.badge}`}>
                  {STATUT_CFG[c.statut]?.label}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Stat jour */}
      <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50 border text-sm">
        <TrendingUp className="h-4 w-4 text-green-600" />
        <span><strong className="text-green-700">{livreesToday.length}</strong> livraison(s) effectuée(s) aujourd'hui</span>
      </div>

      {/* Stats d'optimisation */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">📈 Analyse & optimisation</p>
        <DispatchStatsWidget />
      </div>
    </div>
  );
}