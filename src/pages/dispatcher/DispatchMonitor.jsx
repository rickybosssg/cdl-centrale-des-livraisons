import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, RefreshCw, Zap, Users, AlertCircle, Clock, MapPin, TrendingUp, ToggleLeft, ToggleRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import moment from "moment";

const STATUT_CFG = {
  en_attente:       { label: "⏳ En attente",    badge: "bg-amber-100 text-amber-800" },
  assignee_attente: { label: "📡 Proposée",       badge: "bg-blue-100 text-blue-800" },
  acceptee:         { label: "✅ Acceptée",        badge: "bg-green-100 text-green-800" },
  en_cours:         { label: "🚀 En cours",        badge: "bg-primary/10 text-primary" },
  livree:           { label: "📦 Livrée",          badge: "bg-green-50 text-green-700" },
  aucun_livreur:    { label: "❌ Sans livreur",    badge: "bg-red-100 text-red-800" },
  annulee:          { label: "🚫 Annulée",         badge: "bg-gray-100 text-gray-600" },
};

export default function DispatchMonitor() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [livreurs, setLivreurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [dispatchConfig, setDispatchConfig] = useState(null);
  const [togglingMode, setTogglingMode] = useState(false);

  const loadDispatchConfig = async () => {
    const configs = await base44.entities.DispatchConfig.list('-updated_date', 1);
    if (configs.length > 0) {
      setDispatchConfig(configs[0]);
      console.log(`MODE ACTIF : ${(configs[0].mode || 'auto').toUpperCase()}`);
      if (configs[0].mode === 'manuel') console.log('AUTO DISPATCH BLOQUÉ (MODE MANUEL)');
    } else {
      const created = await base44.entities.DispatchConfig.create({ mode: 'auto', force_override: true });
      setDispatchConfig(created);
      console.log('MODE ACTIF : AUTO (init)');
    }
  };

  const load = async () => {
    const [coursesData, livreursData] = await Promise.all([
      base44.entities.Course.list("-created_date", 100),
      base44.entities.User.filter({ user_type: "livreur" }),
    ]);
    setCourses(coursesData || []);
    setLivreurs(livreursData || []);
    setLastRefresh(new Date());
    setLoading(false);
  };

  // ⛔ AUCUNE logique automatique de changement de mode.
  // Le mode ne change QUE sur action explicite de l'admin.

  const toggleMode = async () => {
    if (!dispatchConfig) return;
    setTogglingMode(true);
    const newMode = dispatchConfig.mode === 'auto' ? 'manuel' : 'auto';
    const me = await base44.auth.me();
    try {
      await base44.entities.DispatchConfig.update(dispatchConfig.id, {
        mode: newMode,
        force_override: true, // verrou permanent — ne peut être écrasé que par un admin
        last_changed_by: me?.email || 'admin',
        last_changed_reason: `Changé manuellement par admin (${me?.email})`,
      });
      setDispatchConfig(prev => ({ ...prev, mode: newMode }));
      console.log(`MODE ACTIF : ${newMode.toUpperCase()} (défini par admin: ${me?.email})`);
      if (newMode === 'manuel') console.log('AUTO DISPATCH BLOQUÉ (MODE MANUEL)');
      toast.success(`${newMode === 'auto' ? '⚡ Mode automatique activé' : '🔧 Mode manuel activé'}`);
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    }
    setTogglingMode(false);
  };

  useEffect(() => {
    loadDispatchConfig();
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsub = base44.entities.Course.subscribe((event) => {
      if (event.type === "create") setCourses(prev => [event.data, ...prev]);
      else if (event.type === "update") setCourses(prev => prev.map(c => c.id === event.id ? event.data : c));
    });
    return unsub;
  }, []);

  const isAuto = (dispatchConfig?.mode || 'auto') === 'auto';
  const livreursOnline = livreurs.filter(l => l.disponible && !l.livreur_bloque);
  const enRecherche = courses.filter(c => ["en_attente", "assignee_attente"].includes(c.statut));
  const sansLivreur = courses.filter(c => c.statut === "aucun_livreur");
  const enCours = courses.filter(c => ["acceptee", "en_cours"].includes(c.statut));
  const livreesToday = courses.filter(c =>
    c.statut === "livree" && new Date(c.updated_date).toDateString() === new Date().toDateString()
  );

  const coursesAcceptees = courses.filter(c => c.heure_assignation && c.date_acceptation);
  const tempsMoyen = coursesAcceptees.length > 0
    ? Math.round(coursesAcceptees.reduce((sum, c) => {
        const d = new Date(c.date_acceptation) - new Date(c.heure_assignation);
        return sum + (d > 0 ? d : 0);
      }, 0) / coursesAcceptees.length / 1000)
    : null;

  const handleForceDispatch = async (courseId) => {
    try {
      const res = await base44.functions.invoke("autoDispatch", { course_id: courseId, force: true });
      if (res.data?.success) {
        toast.success(`✅ Dispatché vers ${res.data.livreur?.nom}`);
        load();
      } else {
        toast.error("❌ " + (res.data?.message || "Aucun livreur disponible"));
      }
    } catch (err) {
      toast.error("Erreur: " + err.message);
    }
  };

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

      {/* Bandeau Mode — contrôle exclusif admin */}
      <div className={`rounded-2xl border-2 p-4 ${isAuto ? 'bg-green-50 border-green-400' : 'bg-amber-50 border-amber-400'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full flex-shrink-0 ${isAuto ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
            <div>
              <p className={`font-bold text-base ${isAuto ? 'text-green-800' : 'text-amber-800'}`}>
                {isAuto ? '⚡ Mode automatique activé' : '🔧 Mode manuel activé'}
              </p>
              <p className={`text-xs ${isAuto ? 'text-green-700' : 'text-amber-700'}`}>
                {isAuto
                  ? 'Les courses sont assignées automatiquement'
                  : 'Assignation manuelle — aller sur /staff/dispatch'}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                <Lock className="h-2.5 w-2.5" /> Verrouillé — changeable uniquement par admin
              </p>
            </div>
          </div>
          <button
            onClick={toggleMode}
            disabled={togglingMode}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 disabled:opacity-50 ${
              isAuto
                ? 'border-amber-400 text-amber-700 bg-white hover:bg-amber-50'
                : 'border-green-400 text-green-700 bg-white hover:bg-green-50'
            }`}
          >
            {isAuto ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
            {togglingMode ? '...' : isAuto ? 'Activer manuel' : 'Activer auto'}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-green-600" />
              <p className="text-xs text-muted-foreground">Livreurs en ligne</p>
            </div>
            <p className="text-3xl font-bold text-green-600">{livreursOnline.length}</p>
            <p className="text-[10px] text-muted-foreground">/ {livreurs.length} total</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-600" />
              <p className="text-xs text-muted-foreground">En recherche</p>
            </div>
            <p className="text-3xl font-bold text-amber-600">{enRecherche.length}</p>
            <p className="text-[10px] text-muted-foreground">courses actives</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <p className="text-xs text-muted-foreground">Sans livreur</p>
            </div>
            <p className="text-3xl font-bold text-red-600">{sansLivreur.length}</p>
            <p className="text-[10px] text-muted-foreground">intervention requise</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              <p className="text-xs text-muted-foreground">Livrées aujourd'hui</p>
            </div>
            <p className="text-3xl font-bold text-blue-600">{livreesToday.length}</p>
            {tempsMoyen && <p className="text-[10px] text-muted-foreground">Moy. {tempsMoyen}s</p>}
          </CardContent>
        </Card>
      </div>

      {/* Livreurs en ligne */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Livreurs en ligne ({livreursOnline.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {livreursOnline.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">Aucun livreur en ligne</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {livreursOnline.map(l => (
                <div key={l.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 border border-green-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  <span className="text-xs font-medium text-green-800">{l.full_name?.split(" ")[0]}</span>
                  {l.gps_latitude && <MapPin className="h-3 w-3 text-green-600" />}
                  {(l.nombre_courses_actives || 0) > 0 && (
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded">{l.nombre_courses_actives} actives</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Courses nécessitant attention */}
      {(enRecherche.length > 0 || sansLivreur.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">🚨 Nécessite attention ({enRecherche.length + sansLivreur.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[...sansLivreur, ...enRecherche].map(c => {
              const cfg = STATUT_CFG[c.statut] || {};
              return (
                <div key={c.id} className="flex items-start gap-3 p-3 rounded-xl border bg-card">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                      {(c.nombre_tentatives || 0) > 3 && <span className="text-[10px] text-red-600 font-bold">⚠️ {c.nombre_tentatives} tentatives</span>}
                    </div>
                    <p className="text-sm font-semibold mt-1">{c.quartier_depart} → {c.quartier_arrivee}</p>
                    <p className="text-xs text-muted-foreground">{c.type_colis} · {c.prix} FCFA · {moment(c.created_date).fromNow()}</p>
                    {c.livreur_name && <p className="text-xs text-blue-600">→ Proposé à {c.livreur_name}</p>}
                  </div>
                  {(c.statut === "en_attente" || c.statut === "aucun_livreur") && (
                    <Button size="sm" className="flex-shrink-0 text-xs h-8" onClick={() => handleForceDispatch(c.id)}>
                      <Zap className="h-3 w-3 mr-1" />
                      Forcer auto
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Flux en cours */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">📊 Flux en cours ({enCours.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {enCours.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">Aucune course active</p>
          ) : (
            <div className="space-y-2">
              {enCours.map(c => (
                <div key={c.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/40 border">
                  <span className="text-lg">🚀</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{c.quartier_depart} → {c.quartier_arrivee}</p>
                    <p className="text-[10px] text-muted-foreground">{c.livreur_name} · {moment(c.date_acceptation || c.created_date).fromNow()}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUT_CFG[c.statut]?.badge}`}>
                    {STATUT_CFG[c.statut]?.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Livreurs hors ligne */}
      <Card className="opacity-60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Hors ligne ({livreurs.length - livreursOnline.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {livreurs.filter(l => !l.disponible || l.livreur_bloque).slice(0, 10).map(l => (
              <span key={l.id} className="text-[10px] px-2 py-1 rounded-full bg-muted text-muted-foreground">
                {l.livreur_bloque ? "🔒" : "🔴"} {l.full_name?.split(" ")[0]}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}