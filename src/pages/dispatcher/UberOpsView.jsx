/**
 * CDL — Vue Opérations Uber Style
 * Un seul écran pour tout voir : livreurs, courses, dispatch
 * Inspiré de Uber Eats Operations Dashboard
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useDispatchMode } from "@/context/DispatchModeContext";
import { isDriverEligible, getDriverDispatchReason } from "@/lib/dispatch";
import {
  RefreshCw, Zap, Users, Package, CheckCircle2, XCircle,
  MapPin, Clock, ToggleLeft, ToggleRight, ChevronDown, ChevronUp,
  Phone, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import moment from "moment";

// ── Couleurs statut ───────────────────────────────────────────────────────────
const STATUT_BADGE = {
  en_attente:      "bg-amber-100 text-amber-800",
  assignee_attente:"bg-blue-100 text-blue-800",
  acceptee:        "bg-green-100 text-green-800",
  en_cours:        "bg-primary/10 text-primary",
  livree:          "bg-green-50 text-green-700",
  aucun_livreur:   "bg-red-100 text-red-800",
  annulee:         "bg-gray-100 text-gray-500",
};
const STATUT_LABEL = {
  en_attente:      "⏳ En attente",
  assignee_attente:"📡 Proposée",
  acceptee:        "✅ Acceptée",
  en_cours:        "🚀 En cours",
  livree:          "📦 Livrée",
  aucun_livreur:   "❌ Sans livreur",
  annulee:         "🚫 Annulée",
};

// ── Composant Carte Livreur ───────────────────────────────────────────────────
function DriverCard({ driver }) {
  const eligible = isDriverEligible(driver);
  const reason = !eligible ? getDriverDispatchReason(driver) : null;
  const gpsOk = !!(driver.gps_latitude && driver.gps_longitude);
  const activeCourses = driver.nombre_courses_actives || 0;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${eligible ? 'border-green-200 bg-green-50' : 'border-red-100 bg-red-50/40'}`}>
      <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${eligible ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{driver.full_name}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {gpsOk ? (
            <span className="flex items-center gap-0.5 text-[10px] text-green-700 font-medium">
              <MapPin className="h-3 w-3" />GPS actif
            </span>
          ) : (
            <span className="text-[10px] text-red-500">📍GPS absent</span>
          )}
          {activeCourses > 0 && (
            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
              {activeCourses} actives
            </span>
          )}
          {driver.note_moyenne > 0 && (
            <span className="text-[10px] text-gray-500">⭐{driver.note_moyenne?.toFixed(1)}</span>
          )}
        </div>
        {reason && <p className="text-[10px] text-red-600 mt-0.5 italic">{reason}</p>}
      </div>
      {driver.telephone && (
        <a href={`tel:${driver.telephone}`} className="flex-shrink-0 p-1.5 rounded-lg hover:bg-white/80 text-gray-500">
          <Phone className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

// ── Composant Carte Course ────────────────────────────────────────────────────
function CourseCard({ course, onDispatch, onCancel, eligibleDrivers }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [dispatching, setDispatching] = useState(false);
  const needsAction = ['en_attente', 'aucun_livreur'].includes(course.statut);
  const badge = STATUT_BADGE[course.statut] || "bg-gray-100 text-gray-500";
  const label = STATUT_LABEL[course.statut] || course.statut;

  const handleManualAssign = async () => {
    if (!selectedDriver) return toast.error("Choisissez un livreur");
    setDispatching(true);
    await onDispatch(course, selectedDriver);
    setDispatching(false);
    setExpanded(false);
  };

  const handleAutoDispatch = async () => {
    setDispatching(true);
    try {
      const res = await base44.functions.invoke('cdlDispatch', { course_id: course.id, force: true });
      if (res.data?.success) toast.success(`✅ Dispatché à ${res.data.livreur?.nom}`);
      else toast.error('❌ ' + (res.data?.reason || 'Aucun livreur'));
    } catch (e) { toast.error(e.message); }
    setDispatching(false);
  };

  return (
    <div className={`rounded-2xl border-2 overflow-hidden ${needsAction ? 'border-orange-300' : 'border-border'}`}>
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge}`}>{label}</span>
              {needsAction && <span className="text-[10px] text-orange-600 font-bold">Action requise</span>}
            </div>
            <p className="text-sm font-bold">{course.quartier_depart} → {course.quartier_arrivee}</p>
            <p className="text-xs text-gray-500">{course.type_colis} · <strong>{course.prix?.toLocaleString()} F</strong> · {moment(course.created_date).fromNow()}</p>
            {course.livreur_name && <p className="text-xs text-blue-700 mt-0.5">👤 {course.livreur_name}</p>}
            {(course.nombre_tentatives || 0) > 0 && (
              <p className="text-[10px] text-gray-400">{course.nombre_tentatives} tentative(s)</p>
            )}
          </div>
          <button onClick={() => setExpanded(v => !v)} className="p-1.5 rounded-lg hover:bg-muted/50 flex-shrink-0">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {needsAction && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1 h-8 text-xs border-orange-300 text-orange-700" onClick={handleAutoDispatch} disabled={dispatching}>
              <Zap className="h-3 w-3 mr-1" />{dispatching ? "..." : "Auto-dispatch"}
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => setExpanded(v => !v)}>
              <Users className="h-3 w-3 mr-1" />Manuel
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs px-2 border-red-200 text-red-500" onClick={() => onCancel(course)}>
              <XCircle className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="border-t bg-muted/30 p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-600">Livreurs disponibles ({eligibleDrivers.length})</p>
          {eligibleDrivers.length === 0 ? (
            <p className="text-xs text-red-600 text-center py-2">Aucun livreur éligible</p>
          ) : (
            <>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {eligibleDrivers.slice(0, 8).map(d => (
                  <button
                    key={d.id}
                    onClick={() => setSelectedDriver(d)}
                    className={`w-full flex items-center gap-2 p-2 rounded-lg border text-left transition-all ${
                      selectedDriver?.id === d.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <div className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{d.full_name}</p>
                      <p className="text-[10px] text-gray-400">{d.quartier || '—'} · {d.nombre_courses_actives || 0} actives</p>
                    </div>
                    {d.gps_latitude && <MapPin className="h-3 w-3 text-green-600 flex-shrink-0" />}
                  </button>
                ))}
              </div>
              {selectedDriver && (
                <Button className="w-full h-9" onClick={handleManualAssign} disabled={dispatching}>
                  {dispatching ? "Assignation..." : `Assigner à ${selectedDriver.full_name?.split(' ')[0]}`}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Vue principale ────────────────────────────────────────────────────────────
export default function UberOpsView() {
  const [courses, setCourses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [activeTab, setActiveTab] = useState('action'); // 'action' | 'drivers' | 'all'
  const [toggling, setToggling] = useState(false);
  const { mode: dispatchMode, setMode } = useDispatchMode();
  const isManuel = dispatchMode === 'manuel';

  const load = useCallback(async () => {
    try {
      const [coursesRes, usersRes] = await Promise.allSettled([
        base44.entities.Course.list('-created_date', 100),
        base44.entities.User.filter({ driver_online: true }, '-updated_date', 200),
      ]);
      if (coursesRes.status === 'fulfilled') setCourses(coursesRes.value || []);
      if (usersRes.status === 'fulfilled') setDrivers(usersRes.value || []);
    } catch (e) {
      console.error('[OPS] load error:', e.message);
    }
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);

    // Realtime courses
    const unsubCourses = base44.entities.Course.subscribe(ev => {
      if (!ev.data && ev.type !== 'delete') return;
      if (ev.type === 'create') setCourses(p => [ev.data, ...p]);
      else if (ev.type === 'update') setCourses(p => p.map(c => c.id === ev.id ? ev.data : c));
      else if (ev.type === 'delete') setCourses(p => p.filter(c => c.id !== ev.id));
    });

    // Realtime drivers
    const unsubUsers = base44.entities.User.subscribe(ev => {
      if (!ev.data) return;
      setDrivers(prev => {
        if (ev.type === 'delete') return prev.filter(d => d.id !== ev.id);
        const exists = prev.find(d => d.id === ev.id);
        if (ev.data.driver_online) {
          return exists ? prev.map(d => d.id === ev.id ? ev.data : d) : [ev.data, ...prev];
        } else {
          return prev.filter(d => d.id !== ev.id);
        }
      });
    });

    return () => { clearInterval(interval); unsubCourses(); unsubUsers(); };
  }, []);

  const handleToggleMode = async () => {
    const next = isManuel ? 'auto' : 'manuel';
    setToggling(true);
    try {
      await setMode(next);
      toast.success(`Mode ${next === 'auto' ? 'automatique' : 'manuel'} activé`);
    } catch (e) { toast.error(e.message); }
    setToggling(false);
  };

  const handleManualAssign = async (course, driver) => {
    const now = new Date().toISOString();
    let historique = [];
    try { if (course.historique_assignation) historique = JSON.parse(course.historique_assignation); } catch (_) {}
    historique.push({ livreur_email: driver.email, livreur_nom: driver.full_name, heure: now, statut: 'proposee', mode: 'manuel_admin' });

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

    await base44.entities.Notification.create({
      destinataire_email: driver.email,
      destinataire_role: 'livreur',
      titre: '🛵 Course assignée par l\'admin',
      message: `${course.quartier_depart} → ${course.quartier_arrivee} · ${course.prix} FCFA`,
      type: 'success', lue: false, course_id: course.id,
      target_screen: `/course-livreur/${course.id}`,
    }).catch(() => {});

    toast.success(`Assigné à ${driver.full_name}`);
  };

  const handleCancel = async (course) => {
    if (!window.confirm(`Annuler la course ${course.quartier_depart}→${course.quartier_arrivee} ?`)) return;
    await base44.entities.Course.update(course.id, { statut: 'annulee' });
    toast.success('Course annulée');
  };

  // ── Dérivés ───────────────────────────────────────────────────────────────
  const eligibleDrivers = drivers.filter(d => isDriverEligible(d));
  const nonEligible = drivers.filter(d => !isDriverEligible(d));

  const coursesAction = courses.filter(c => ['en_attente', 'aucun_livreur'].includes(c.statut));
  const coursesProposees = courses.filter(c => c.statut === 'assignee_attente');
  const coursesActives = courses.filter(c => ['acceptee', 'en_cours'].includes(c.statut));
  const livreesToday = courses.filter(c => c.statut === 'livree' && new Date(c.updated_date).toDateString() === new Date().toDateString());

  const tabs = [
    { id: 'action', label: '🚨 Action', count: coursesAction.length, urgent: coursesAction.length > 0 },
    { id: 'drivers', label: '🛵 Livreurs', count: drivers.length },
    { id: 'all', label: '📦 Toutes', count: courses.filter(c => !['livree', 'annulee'].includes(c.statut)).length },
  ];

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Opérations CDL</h1>
          <p className="text-xs text-gray-400">
            {lastRefresh ? `MàJ ${moment(lastRefresh).format('HH:mm:ss')}` : '...'}
            {' · '}Temps réel actif
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={load}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Mode dispatch — Toggle */}
      <button
        onClick={handleToggleMode}
        disabled={toggling}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 transition-all ${
          isManuel ? 'bg-amber-50 border-amber-400' : 'bg-green-50 border-green-400'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${isManuel ? 'bg-amber-500' : 'bg-green-500 animate-pulse'}`} />
          <div className="text-left">
            <p className={`font-bold text-sm ${isManuel ? 'text-amber-800' : 'text-green-800'}`}>
              {isManuel ? '🔧 Mode Manuel' : '⚡ Mode Auto'}
            </p>
            <p className={`text-xs ${isManuel ? 'text-amber-600' : 'text-green-600'}`}>
              {isManuel ? 'Assignation manuelle requise' : 'Dispatch automatique GPS'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {toggling ? (
            <div className="h-5 w-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          ) : isManuel ? (
            <ToggleLeft className="h-6 w-6 text-amber-500" />
          ) : (
            <ToggleRight className="h-6 w-6 text-green-500" />
          )}
        </div>
      </button>

      {/* KPIs rapides */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Action', value: coursesAction.length, color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
          { label: 'Proposées', value: coursesProposees.length, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
          { label: 'Livreurs', value: eligibleDrivers.length, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
          { label: 'Livrées/j', value: livreesToday.length, color: 'text-primary', bg: 'bg-primary/5 border-primary/20' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`rounded-xl border p-2 text-center ${bg}`}>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
            <p className="text-[9px] text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 px-1 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab.id ? 'bg-white shadow text-foreground' : 'text-muted-foreground'
            } ${tab.urgent ? 'ring-2 ring-orange-400 ring-offset-1' : ''}`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] ${tab.urgent ? 'bg-orange-100 text-orange-700' : 'bg-muted text-muted-foreground'}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Action */}
      {activeTab === 'action' && (
        <div className="space-y-3">
          {coursesAction.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-400" />
              <p className="font-semibold text-green-700">Tout est dispatché ✓</p>
              <p className="text-xs">Aucune course en attente</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-orange-700">{coursesAction.length} course(s) à dispatcher</p>
                {!isManuel && (
                  <Button size="sm" className="h-8 text-xs bg-orange-500 hover:bg-orange-600" onClick={async () => {
                    for (const c of coursesAction) {
                      base44.functions.invoke('cdlDispatch', { course_id: c.id, force: true }).catch(() => {});
                    }
                    toast.success('Dispatch en cours...');
                    setTimeout(load, 2000);
                  }}>
                    <Zap className="h-3 w-3 mr-1" />Tout dispatcher
                  </Button>
                )}
              </div>
              {coursesAction.map(c => (
                <CourseCard
                  key={c.id}
                  course={c}
                  onDispatch={handleManualAssign}
                  onCancel={handleCancel}
                  eligibleDrivers={eligibleDrivers}
                />
              ))}
            </>
          )}

          {/* Courses proposées en attente */}
          {coursesProposees.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-blue-700 flex items-center gap-1">
                <Clock className="h-3 w-3" />En attente de réponse ({coursesProposees.length})
              </p>
              {coursesProposees.map(c => {
                const expire = c.heure_assignation ? new Date(new Date(c.heure_assignation).getTime() + 60000) : null;
                const expired = expire && new Date() > expire;
                return (
                  <div key={c.id} className={`flex items-center gap-3 p-3 rounded-xl border ${expired ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold">{c.quartier_depart} → {c.quartier_arrivee}</p>
                      <p className="text-[10px] text-gray-500">👤 {c.livreur_name} · {c.prix} F</p>
                      {expire && (
                        <p className={`text-[10px] font-bold ${expired ? 'text-red-600' : 'text-blue-600'}`}>
                          {expired ? '⚠️ Délai expiré — relancer' : `⏱ Expire ${moment(expire).fromNow()}`}
                        </p>
                      )}
                    </div>
                    {expired && (
                      <Button size="sm" className="h-7 text-xs" onClick={() =>
                        base44.functions.invoke('cdlDispatch', { course_id: c.id, force: true })
                          .then(() => { toast.success('Redispatché'); load(); })
                          .catch(e => toast.error(e.message))
                      }>
                        <Zap className="h-3 w-3 mr-1" />Relancer
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab Livreurs */}
      {activeTab === 'drivers' && (
        <div className="space-y-4">
          {/* Éligibles */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-green-700 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Dispatchables ({eligibleDrivers.length})
            </p>
            {eligibleDrivers.length === 0 ? (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-center">
                <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-1" />
                <p className="text-sm font-bold text-red-700">Aucun livreur dispatchable</p>
              </div>
            ) : (
              eligibleDrivers.map(d => <DriverCard key={d.id} driver={d} />)
            )}
          </div>

          {/* Non éligibles */}
          {nonEligible.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-red-700 flex items-center gap-1.5">
                <XCircle className="h-3.5 w-3.5" />
                En ligne mais exclus ({nonEligible.length})
              </p>
              {nonEligible.map(d => <DriverCard key={d.id} driver={d} />)}
            </div>
          )}

          {drivers.length === 0 && (
            <div className="text-center py-10 text-gray-400">
              <Users className="h-12 w-12 mx-auto mb-2" />
              <p className="font-semibold">Aucun livreur en ligne</p>
            </div>
          )}
        </div>
      )}

      {/* Tab Toutes courses */}
      {activeTab === 'all' && (
        <div className="space-y-2">
          {courses.filter(c => !['livree', 'annulee'].includes(c.statut)).length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Package className="h-12 w-12 mx-auto mb-2" />
              <p>Aucune course active</p>
            </div>
          ) : (
            courses
              .filter(c => !['livree', 'annulee'].includes(c.statut))
              .map(c => (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUT_BADGE[c.statut] || 'bg-gray-100 text-gray-500'}`}>
                        {STATUT_LABEL[c.statut] || c.statut}
                      </span>
                    </div>
                    <p className="text-sm font-semibold">{c.quartier_depart} → {c.quartier_arrivee}</p>
                    <p className="text-xs text-gray-400">{c.type_colis} · {c.prix?.toLocaleString()} F · {moment(c.created_date).fromNow()}</p>
                    {c.livreur_name && <p className="text-[10px] text-blue-600">👤 {c.livreur_name}</p>}
                  </div>
                </div>
              ))
          )}
          {livreesToday.length > 0 && (
            <div className="mt-3 p-3 rounded-xl bg-green-50 border border-green-200 text-center">
              <p className="text-sm font-bold text-green-700">🎉 {livreesToday.length} livraison(s) aujourd'hui</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}