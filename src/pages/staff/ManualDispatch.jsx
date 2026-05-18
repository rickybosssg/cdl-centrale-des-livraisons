import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Package, Truck, Zap, Loader2, RefreshCw, Phone, MapPin, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import StaffStatCard from "@/components/StaffStatCard";
import AssignDriverModal from "@/components/AssignDriverModal";
import moment from "moment";

function countNearbyDrivers(course, livreurs) {
  const ZONES = {
    "Ouaga 2000": ["Patte d'Oie", "Zone 1", "Kossodo", "Pissy"],
    "Zone 1": ["Koulouba", "Zogona", "Gounghin", "Ouaga 2000"],
    "Pissy": ["Gounghin", "Patte d'Oie", "Somgandé", "Ouaga 2000"],
    "Gounghin": ["Zone 1", "Pissy", "Zogona", "Tanghin"],
    "Patte d'Oie": ["Ouaga 2000", "Pissy", "Somgandé"],
  };
  return livreurs.filter(l =>
    l.quartier === course.quartier_depart ||
    ZONES[course.quartier_depart]?.includes(l.quartier)
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
  const [assignModalOpen, setAssignModalOpen] = useState(false);
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
    // RÈGLE v2 : profil livreur valide + en ligne — sans current_role
    // Les utilisateurs multi-profil (client+livreur, etc.) sont inclus
    const livreursFiltered = (allUsers || []).filter(x =>
      x.driver_online === true &&
      x.profil_valide === true &&
      !x.livreur_bloque &&
      !x.livreur_suspendu &&
      (x.nombre_courses_actives || 0) < 2
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
      setCourses(prev => {
        const d = event.data;
        // GARDE GLOBALE : jamais injecter/conserver une course supprimée ou annulée
        if (event.type === "delete" || !d || d.is_deleted || d.statut === 'annulee') {
          return prev.filter(c => c.id !== event.id);
        }
        if (event.type === "create") {
          if (!["en_attente", "aucun_livreur"].includes(d.statut)) return prev;
          const next = prev.find(c => c.id === event.id) ? prev : [d, ...prev];
          if (next.length > prevCountRef.current) {
            playAlert();
            toast("🔔 Nouvelle course à affecter !", { description: `${d.quartier_depart} → ${d.quartier_arrivee}`, duration: 8000 });
          }
          prevCountRef.current = next.length;
          return next;
        }
        if (event.type === "update") {
          if (!["en_attente", "aucun_livreur"].includes(d.statut)) {
            const next = prev.filter(c => c.id !== event.id);
            prevCountRef.current = next.length;
            return next;
          }
          const exists = prev.find(c => c.id === event.id);
          const next = exists ? prev.map(c => c.id === event.id ? d : c) : prev;
          prevCountRef.current = next.length;
          return next;
        }
        return prev;
      });
    });
    return unsub;
  }, []);

  const openAssign = (course) => {
    setSelectedCourse(course);
    setAssignModalOpen(true);
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

          {/* Actions */}
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => openAssign(course)}>
              <Truck className="h-3 w-3 mr-1" /> Assigner
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

      {/* Modal d'assignation global — source unique */}
      <AssignDriverModal
        course={selectedCourse}
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        onDone={() => { setSelectedCourse(null); load(); }}
      />
    </div>
  );
}