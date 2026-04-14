import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Package, Truck, Zap, Loader2, RefreshCw, Phone, MapPin, Clock, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import StaffStatCard from "@/components/StaffStatCard";
import moment from "moment";

// ── Helpers ──────────────────────────────────────────────────────────────────
const ZONES_PROCHES = {
  "Ouaga 2000": ["Patte d'Oie", "Zone 1", "Kossodo", "Pissy"],
  "Zone 1": ["Koulouba", "Zogona", "Gounghin", "Ouaga 2000"],
  "Cissin": ["Karpala", "Wemtenga", "Dassasgho", "Zone 1"],
  "Karpala": ["Cissin", "Wemtenga", "Balkuy", "Dassasgho"],
  "Pissy": ["Gounghin", "Patte d'Oie", "Somgandé", "Ouaga 2000"],
  "Gounghin": ["Zone 1", "Pissy", "Zogona", "Tanghin"],
  "Tampouy": ["Tanghin", "Zogona", "Nagrin", "Koulouba"],
  "Tanghin": ["Tampouy", "Zogona", "Koulouba", "Gounghin"],
  "Zogona": ["Zone 1", "Tanghin", "Gounghin", "Koulouba"],
  "Koulouba": ["Zone 1", "Tanghin", "Zogona", "Tampouy"],
  "Kossodo": ["Ouaga 2000", "Nagrin", "Tampouy"],
  "Wemtenga": ["Cissin", "Karpala", "Dassasgho"],
  "Balkuy": ["Karpala", "Dassasgho", "Wemtenga"],
  "Dassasgho": ["Cissin", "Wemtenga", "Balkuy", "Karpala"],
  "Patte d'Oie": ["Ouaga 2000", "Pissy", "Somgandé"],
  "Somgandé": ["Patte d'Oie", "Pissy", "Ouaga 2000"],
  "Nagrin": ["Kossodo", "Tampouy", "Tanghin"],
};

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getNearbyDrivers(course, livreurs) {
  return livreurs
    .map(l => {
      let score = 0;
      let distLabel = null;
      if (l.gps_latitude && l.gps_longitude && course.latitude_depart && course.longitude_depart) {
        const d = distanceKm(l.gps_latitude, l.gps_longitude, course.latitude_depart, course.longitude_depart);
        distLabel = d < 1 ? `< 1 km` : `${d.toFixed(1)} km`;
        score += Math.max(0, 30 - d * 3);
      }
      if (l.quartier === course.quartier_depart) { score += 50; distLabel = distLabel || "Même zone"; }
      else if (ZONES_PROCHES[course.quartier_depart]?.includes(l.quartier)) { score += 25; distLabel = distLabel || "Zone proche"; }
      score -= (l.nombre_courses_actives || 0) * 10;
      return { ...l, _score: score, _distLabel: distLabel };
    })
    .filter(l => l._score > 0 || l.quartier === course.quartier_depart || ZONES_PROCHES[course.quartier_depart]?.includes(l.quartier))
    .sort((a, b) => b._score - a._score)
    .slice(0, 3);
}

function countNearbyDrivers(course, livreurs) {
  return livreurs.filter(l =>
    l.quartier === course.quartier_depart ||
    ZONES_PROCHES[course.quartier_depart]?.includes(l.quartier)
  ).length;
}

function playAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [440, 550, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.2);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.2);
    });
  } catch (_) {}
}

async function logAction(actor, action, target, details) {
  await base44.entities.AuditLog.create({ actorEmail: actor.email, actorName: actor.full_name, actorRoleLabel: "Dispatcher Manuel", actionType: action, targetType: "course", targetId: target.id, targetName: target.name, details }).catch(() => {});
}

// ── Badges ───────────────────────────────────────────────────────────────────
function StatutBadge({ statut }) {
  const cfg = {
    en_attente:    { label: "En attente",   cls: "bg-amber-100 text-amber-800" },
    aucun_livreur: { label: "Sans livreur", cls: "bg-red-100 text-red-800" },
    assignee_attente: { label: "Assigné",   cls: "bg-blue-100 text-blue-800" },
  }[statut] || { label: statut, cls: "bg-gray-100 text-gray-700" };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>;
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function ManualDispatch() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [courses, setCourses] = useState([]);
  const [livreurs, setLivreurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [search, setSearch] = useState("");
  const prevCountRef = useRef(0);

  const load = async () => {
    const actor = await base44.auth.me();
    setMe(actor);
    const isAdmin = actor?.role === "admin" || actor?.email === "weezyh2@gmail.com";
    if (!isAdmin) {
      const perms = await base44.entities.StaffPermission.filter({ userEmail: actor.email, isActive: true });
      if (!perms[0]?.canManualDispatch) { toast.error("Accès refusé"); navigate("/staff"); return; }
    }
    const [cEnAttente, cSansLivreur, allUsers] = await Promise.all([
      base44.entities.Course.filter({ statut: "en_attente" }, "-created_date", 100),
      base44.entities.Course.filter({ statut: "aucun_livreur" }, "-created_date", 50),
      base44.entities.User.list('-updated_date', 500),
    ]);
    // Priorité: sans livreur d'abord, puis par ancienneté (plus ancienne = en haut)
    const sansLivreur = (cSansLivreur || []).sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    const enAttente   = (cEnAttente   || []).sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    const allCourses  = [...sansLivreur, ...enAttente];
    // ⚠️ Critères stricts : driver_online=true + current_role=livreur + non bloqué
    const livreursFiltered = (allUsers || []).filter(x =>
      x.driver_online === true &&
      x.current_role === 'livreur' &&
      !x.livreur_bloque
    );
    setCourses(allCourses);
    setLivreurs(livreursFiltered);
    setLoading(false);
    return allCourses.length;
  };

  // Alerte sonore sur nouvelle course
  useEffect(() => {
    load().then(count => { prevCountRef.current = count || 0; }).catch(() => setLoading(false));

    const unsub = base44.entities.Course.subscribe((event) => {
      if (["en_attente", "aucun_livreur"].includes(event.data?.statut)) {
        setCourses(prev => {
          const exists = prev.find(c => c.id === event.id);
          let next;
          if (event.type === "create") {
            next = [event.data, ...prev];
            if (next.length > prevCountRef.current) {
              playAlert();
              toast("🔔 Nouvelle course à affecter !", { description: `${event.data.quartier_depart} → ${event.data.quartier_arrivee}`, duration: 8000 });
            }
          } else if (event.type === "update" && exists) {
            next = prev.map(c => c.id === event.id ? event.data : c);
          } else if (event.type === "delete" || !["en_attente","aucun_livreur"].includes(event.data?.statut)) {
            next = prev.filter(c => c.id !== event.id);
          } else {
            next = prev;
          }
          prevCountRef.current = (next || prev).length;
          return next || prev;
        });
      }
    });
    return unsub;
  }, []);

  const handleAssign = async (livreur, course = selectedCourse) => {
    if (!window.confirm(`Affecter ${livreur.full_name} ?`)) return;
    setProcessing(true);
    const now = new Date().toISOString();
    await base44.entities.Course.update(course.id, {
      livreur_email: livreur.email, livreur_name: livreur.full_name,
      telephone_livreur: livreur.telephone, statut: "assignee_attente",
      mode_assignation: "manuel", heure_assignation: now,
    });
    await base44.entities.Notification.create({ destinataire_email: livreur.email, destinataire_role: "livreur", titre: "📦 Nouvelle course assignée", message: `Course de ${course.quartier_depart} → ${course.quartier_arrivee} (${course.prix} F). Ouvrez l'app pour accepter.`, type: "info", lue: false, course_id: course.id, target_screen: `/course-livreur/${course.id}` });
    if (course.client_email) {
      await base44.entities.Notification.create({ destinataire_email: course.client_email, destinataire_role: "client", titre: "🛵 Livreur trouvé !", message: `${livreur.full_name} a été assigné à votre course.`, type: "success", lue: false, course_id: course.id, target_screen: `/course/${course.id}` });
    }
    await logAction(me, "COURSE_ASSIGNED", { id: course.id, name: course.id?.slice(0, 8) }, `Assigné à ${livreur.full_name}`);
    toast.success(`✅ Course assignée à ${livreur.full_name}`);
    setSelectedCourse(null);
    load();
    setProcessing(false);
  };

  const filteredCourses = courses.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.client_email?.toLowerCase().includes(q) || c.quartier_depart?.toLowerCase().includes(q) || c.quartier_arrivee?.toLowerCase().includes(q);
  });

  const urgent = courses.filter(c => c.urgence && c.urgence !== "normal");
  const sansLivreurList = courses.filter(c => c.statut === "aucun_livreur");

  // ── CourseCard enrichie ──────────────────────────────────────────────────
  const CourseCard = ({ course }) => {
    const waitMin = Math.round((Date.now() - new Date(course.created_date).getTime()) / 60000);
    const nearbyCount = countNearbyDrivers(course, livreurs);
    const recommended = getNearbyDrivers(course, livreurs);
    const isCritical = course.statut === "aucun_livreur" || waitMin > 15;

    return (
      <Card className={`shadow-sm border-l-4 ${
        course.statut === "aucun_livreur" ? "border-l-red-500 bg-red-50/20" :
        course.urgence === "tres_urgent"  ? "border-l-red-400 bg-red-50/10" :
        course.urgence === "urgent"       ? "border-l-orange-400 bg-orange-50/10" :
        waitMin > 15                      ? "border-l-amber-400 bg-amber-50/10" :
        "border-l-primary/30"
      }`}>
        <CardContent className="p-3 space-y-2">
          {/* Ligne 1: trajet + prix */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <StatutBadge statut={course.statut} />
                {course.urgence && course.urgence !== "normal" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">
                    ⚡ {course.urgence === "tres_urgent" ? "Très urgent" : "Urgent"}
                  </span>
                )}
              </div>
              <p className="font-bold text-sm mt-1">{course.quartier_depart} → {course.quartier_arrivee}</p>
              <p className="text-xs text-muted-foreground">{course.client_name || course.client_email?.split("@")[0]}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-extrabold text-primary text-base">{(course.prix || 0).toLocaleString()} F</p>
              <p className={`text-[10px] font-bold ${waitMin > 15 ? "text-red-600" : waitMin > 5 ? "text-amber-600" : "text-green-600"}`}>
                <Clock className="h-2.5 w-2.5 inline mr-0.5" />{waitMin < 1 ? "< 1min" : `${waitMin}min`}
              </p>
            </div>
          </div>

          {/* Ligne 2: infos rapides */}
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              <span className={nearbyCount === 0 ? "text-red-600 font-bold" : nearbyCount <= 2 ? "text-amber-600 font-semibold" : "text-green-600 font-semibold"}>
                {nearbyCount} livreur{nearbyCount !== 1 ? "s" : ""} proche{nearbyCount !== 1 ? "s" : ""}
              </span>
            </span>
            <span>·</span>
            <span>{course.type_colis || "Colis"}</span>
          </div>

          {/* Ligne 3: suggestion rapide (top 1) */}
          {recommended.length > 0 && (
            <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-green-50 border border-green-200">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="h-6 w-6 rounded-full bg-green-200 flex items-center justify-center text-[10px] font-bold text-green-800 flex-shrink-0">
                  {recommended[0].full_name?.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-green-800 truncate">{recommended[0].full_name}</p>
                  <p className="text-[10px] text-green-700">{recommended[0]._distLabel || recommended[0].quartier || "—"}</p>
                </div>
              </div>
              <Button size="sm" className="h-7 text-[11px] bg-green-600 hover:bg-green-700 flex-shrink-0"
                onClick={() => handleAssign(recommended[0], course)} disabled={processing}>
                <Zap className="h-3 w-3 mr-0.5" /> Affecter
              </Button>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 h-8 text-xs" variant="outline" onClick={() => setSelectedCourse(course)}>
              <Truck className="h-3 w-3 mr-1" /> Voir tous les livreurs
            </Button>
            {course.telephone_expediteur && (
              <a href={`tel:${course.telephone_expediteur}`}>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0"><Phone className="h-3 w-3" /></Button>
              </a>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/staff")}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Dispatch manuel</h1>
          <p className="text-xs text-muted-foreground">Sans livreur d'abord · par ancienneté</p>
        </div>
        <Button variant="ghost" size="icon" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StaffStatCard label="À affecter" value={courses.length} color="text-violet-600" icon={Package} />
        <StaffStatCard label="Sans livreur" value={sansLivreurList.length} color="text-red-600" icon={Zap} />
        <StaffStatCard label="Livreurs dispo" value={livreurs.length} color="text-green-600" icon={Truck} />
      </div>

      <input type="text" placeholder="Rechercher course, client, quartier…" value={search} onChange={e => setSearch(e.target.value)}
        className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white" />

      <Tabs defaultValue="all">
        <TabsList className="w-full">
          <TabsTrigger value="all" className="flex-1">Toutes ({courses.length})</TabsTrigger>
          <TabsTrigger value="sans" className="flex-1 text-red-700">🚨 Sans livreur ({sansLivreurList.length})</TabsTrigger>
          <TabsTrigger value="livreurs" className="flex-1">🛵 ({livreurs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-3 mt-4">
          {filteredCourses.length === 0
            ? <p className="text-center text-sm text-muted-foreground py-8">Aucune course à affecter</p>
            : filteredCourses.map(c => <CourseCard key={c.id} course={c} />)}
        </TabsContent>

        <TabsContent value="sans" className="space-y-3 mt-4">
          {sansLivreurList.length === 0
            ? <p className="text-center text-sm text-muted-foreground py-8">Aucune course sans livreur</p>
            : sansLivreurList.map(c => <CourseCard key={c.id} course={c} />)}
        </TabsContent>

        <TabsContent value="livreurs" className="space-y-3 mt-4">
          {livreurs.map(l => (
            <Card key={l.id} className="shadow-sm">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center font-bold text-green-700">{l.full_name?.charAt(0)}</div>
                <div className="flex-1">
                  <p className="font-bold text-sm">{l.full_name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />{l.quartier || "—"}
                    <span>·</span><span className="text-green-600 font-medium">En ligne</span>
                    {(l.nombre_courses_actives || 0) > 0 && <span className="text-amber-600">· {l.nombre_courses_actives} actives</span>}
                  </div>
                </div>
                {l.telephone && <a href={`tel:${l.telephone}`}><Button size="sm" variant="outline" className="h-7 text-xs"><Phone className="h-3 w-3" /></Button></a>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* Dialog: voir tous les livreurs avec suggestions top 3 */}
      <Dialog open={!!selectedCourse} onOpenChange={v => { if (!v) setSelectedCourse(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Affecter un livreur</DialogTitle></DialogHeader>
          {selectedCourse && (() => {
            const recommended = getNearbyDrivers(selectedCourse, livreurs);
            const others = livreurs.filter(l => !recommended.find(r => r.id === l.id));
            return (
              <div className="space-y-4">
                {/* Résumé course */}
                <div className="p-3 rounded-xl bg-muted/40 text-sm space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatutBadge statut={selectedCourse.statut} />
                    {selectedCourse.urgence && selectedCourse.urgence !== "normal" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">⚡ Urgent</span>
                    )}
                  </div>
                  <p className="font-semibold">{selectedCourse.quartier_depart} → {selectedCourse.quartier_arrivee}</p>
                  <p className="text-muted-foreground text-xs">{selectedCourse.prix} F · {selectedCourse.type_colis} · {moment(selectedCourse.created_date).fromNow()}</p>
                </div>

                {/* Recommandés */}
                {recommended.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-green-700 mb-2 flex items-center gap-1"><Star className="h-3 w-3" /> Recommandés (les plus proches)</p>
                    <div className="space-y-2">
                      {recommended.map((l, i) => (
                        <div key={l.id} className="flex items-center gap-3 p-3 rounded-xl border-2 border-green-200 bg-green-50">
                          <div className="h-9 w-9 rounded-full bg-green-200 flex items-center justify-center font-bold text-green-800 flex-shrink-0 text-sm">{i + 1}</div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm">{l.full_name}</p>
                            <p className="text-xs text-muted-foreground">{l._distLabel || l.quartier || "—"} · {l.nombre_courses_actives || 0} actives</p>
                          </div>
                          <Button size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700 flex-shrink-0" onClick={() => handleAssign(l)} disabled={processing}>
                            <Zap className="h-3 w-3 mr-1" /> Affecter
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Autres livreurs */}
                {others.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Autres livreurs disponibles</p>
                    <div className="space-y-2">
                      {others.map(l => (
                        <div key={l.id} className="flex items-center gap-3 p-3 rounded-xl border hover:bg-muted/30">
                          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center font-bold text-muted-foreground flex-shrink-0">{l.full_name?.charAt(0)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm">{l.full_name}</p>
                            <p className="text-xs text-muted-foreground">{l.quartier || "—"} · {l.nombre_courses_actives || 0} actives</p>
                          </div>
                          <Button size="sm" variant="outline" className="h-8 text-xs flex-shrink-0" onClick={() => handleAssign(l)} disabled={processing}>
                            Affecter
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {livreurs.length === 0 && <p className="text-center text-sm text-muted-foreground py-4">Aucun livreur disponible en ce moment</p>}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}