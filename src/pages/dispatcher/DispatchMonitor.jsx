import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, RefreshCw, Zap, Users, AlertCircle, Clock, MapPin, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import moment from "moment";

const STATUT_CFG = {
  en_attente:       { label: "⏳ En attente",         badge: "bg-amber-100 text-amber-800" },
  assignee_attente: { label: "📡 Proposée",           badge: "bg-blue-100 text-blue-800" },
  acceptee:         { label: "✅ Acceptée",            badge: "bg-green-100 text-green-800" },
  en_cours:         { label: "🚀 En cours",            badge: "bg-primary/10 text-primary" },
  livree:           { label: "📦 Livrée",              badge: "bg-green-50 text-green-700" },
  aucun_livreur:    { label: "❌ Sans livreur",        badge: "bg-red-100 text-red-800" },
  annulee:          { label: "🚫 Annulée",             badge: "bg-gray-100 text-gray-600" },
};

export default function DispatchMonitor() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [livreurs, setLivreurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

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

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, []);

  // Temps réel courses
  useEffect(() => {
    const unsub = base44.entities.Course.subscribe((event) => {
      if (event.type === "create") setCourses(prev => [event.data, ...prev]);
      else if (event.type === "update") setCourses(prev => prev.map(c => c.id === event.id ? event.data : c));
    });
    return unsub;
  }, []);

  // KPIs
  const livreursOnline = livreurs.filter(l => l.disponible && !l.livreur_bloque);
  const enRecherche = courses.filter(c => ["en_attente", "assignee_attente"].includes(c.statut));
  const sansLivreur = courses.filter(c => c.statut === "aucun_livreur");
  const enCours = courses.filter(c => ["acceptee", "en_cours"].includes(c.statut));
  const livreesToday = courses.filter(c => {
    if (c.statut !== "livree") return false;
    return new Date(c.updated_date).toDateString() === new Date().toDateString();
  });

  // Taux acceptation
  const coursesAvecHistorique = courses.filter(c => c.historique_assignation);
  let totalProposals = 0, totalAccepted = 0;
  coursesAvecHistorique.forEach(c => {
    try {
      const hist = JSON.parse(c.historique_assignation);
      hist.forEach(h => {
        if (h.statut) {
          totalProposals++;
          if (h.statut === "acceptee" || c.statut === "acceptee" || c.statut === "en_cours" || c.statut === "livree") {
            if (h === hist[hist.length - 1] && !["refuse", "no_response", "aucun_livreur"].includes(h.statut)) {
              totalAccepted++;
            }
          }
        }
      });
    } catch (_) {}
  });
  const tauxAcceptation = totalProposals > 0 ? Math.round((totalAccepted / totalProposals) * 100) : 0;

  // Temps moyen attribution (courses acceptées)
  const coursesAcceptees = courses.filter(c => c.heure_assignation && c.date_acceptation);
  const tempsTotal = coursesAcceptees.reduce((sum, c) => {
    const diff = new Date(c.date_acceptation) - new Date(c.heure_assignation);
    return sum + (diff > 0 ? diff : 0);
  }, 0);
  const tempsMoyen = coursesAcceptees.length > 0
    ? Math.round(tempsTotal / coursesAcceptees.length / 1000)
    : null;

  const handleManualDispatch = async (courseId) => {
    try {
      const res = await base44.functions.invoke("autoDispatch", { course_id: courseId });
      if (res.data?.success) {
        alert(`✅ Dispatché vers ${res.data.livreur?.nom}`);
        load();
      } else {
        alert("❌ " + (res.data?.message || "Aucun livreur disponible"));
      }
    } catch (err) {
      alert("Erreur: " + err.message);
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
            {tempsMoyen && <p className="text-[10px] text-muted-foreground">Moy. {tempsMoyen}s d'attribution</p>}
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
                  {l.gps_latitude && (
                    <MapPin className="h-3 w-3 text-green-600" />
                  )}
                  {(l.nombre_courses_actives || 0) > 0 && (
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded">{l.nombre_courses_actives} actives</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Courses en recherche / bloquées */}
      {(enRecherche.length > 0 || sansLivreur.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">🚨 Nécessite attention ({enRecherche.length + sansLivreur.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[...enRecherche, ...sansLivreur].map(c => {
              const cfg = STATUT_CFG[c.statut] || {};
              const age = moment(c.created_date).fromNow();
              const nbTentatives = c.nombre_tentatives || 0;
              return (
                <div key={c.id} className="flex items-start gap-3 p-3 rounded-xl border bg-card">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                      {nbTentatives > 3 && <span className="text-[10px] text-red-600 font-bold">⚠️ {nbTentatives} tentatives</span>}
                    </div>
                    <p className="text-sm font-semibold mt-1">{c.quartier_depart} → {c.quartier_arrivee}</p>
                    <p className="text-xs text-muted-foreground">{c.type_colis} · {c.prix} FCFA · {age}</p>
                    {c.livreur_name && <p className="text-xs text-blue-600">→ Proposé à {c.livreur_name}</p>}
                  </div>
                  {(c.statut === "en_attente" || c.statut === "aucun_livreur") && (
                    <Button
                      size="sm"
                      className="flex-shrink-0 text-xs h-8"
                      onClick={() => handleManualDispatch(c.id)}
                    >
                      <Zap className="h-3 w-3 mr-1" />
                      Dispatcher
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Flux temps réel - courses en cours */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">📊 Flux en cours ({enCours.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {enCours.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">Aucune course active en ce moment</p>
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

      {/* Livreurs hors ligne avec GPS */}
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