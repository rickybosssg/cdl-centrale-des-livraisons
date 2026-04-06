import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Package, Truck, Zap, Loader2, RefreshCw, Phone, MapPin, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import StaffStatCard from "@/components/StaffStatCard";
import moment from "moment";

async function logAction(actor, action, target, details) {
  await base44.entities.AuditLog.create({ actorEmail: actor.email, actorName: actor.full_name, actorRoleLabel: "Dispatcher Manuel", actionType: action, targetType: "course", targetId: target.id, targetName: target.name, details }).catch(() => {});
}

export default function ManualDispatch() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [courses, setCourses] = useState([]);
  const [livreurs, setLivreurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    const actor = await base44.auth.me();
    setMe(actor);
    const isAdmin = actor?.role === "admin" || actor?.email === "weezyh2@gmail.com";
    if (!isAdmin) {
      const perms = await base44.entities.StaffPermission.filter({ userEmail: actor.email, isActive: true });
      if (!perms[0]?.canManualDispatch) { toast.error("Accès refusé"); navigate("/staff"); return; }
    }
    const [c, l] = await Promise.all([
      base44.entities.Course.filter({ statut: "en_attente" }, "-created_date", 100),
      base44.entities.User.filter({ user_type: "livreur", disponible: true }),
    ]);
    setCourses(c); setLivreurs(l.filter(l => !l.livreur_bloque)); setLoading(false);
  };

  useEffect(() => { load().catch(() => setLoading(false)); }, []);

  const handleAssign = async (livreur) => {
    if (!window.confirm("Confirmer cette action ?")) return;
    setProcessing(true);
    const now = new Date().toISOString();
    await base44.entities.Course.update(selectedCourse.id, {
      livreur_email: livreur.email, livreur_name: livreur.full_name,
      telephone_livreur: livreur.telephone, statut: "assignee_attente",
      mode_assignation: "manuel", heure_assignation: now,
    });
    await base44.entities.Notification.create({ destinataire_email: livreur.email, destinataire_role: "livreur", titre: "📦 Nouvelle course assignée", message: `Course de ${selectedCourse.quartier_depart} → ${selectedCourse.quartier_arrivee} (${selectedCourse.prix} F).`, type: "info", lue: false, course_id: selectedCourse.id });
    await logAction(me, "COURSE_ASSIGNED", { id: selectedCourse.id, name: selectedCourse.id?.slice(0, 8) }, `Assigné à ${livreur.full_name}`);
    toast.success("Course assignée avec succès");
    setSelectedCourse(null); load();
    setProcessing(false);
  };

  const urgent = courses.filter(c => c.urgence && c.urgence !== "normal");
  const normal = courses.filter(c => !c.urgence || c.urgence === "normal");

  const filteredCourses = courses.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.client_email?.toLowerCase().includes(q) || c.quartier_depart?.toLowerCase().includes(q) || c.quartier_arrivee?.toLowerCase().includes(q);
  });

  const CourseCard = ({ course }) => (
    <Card className={`shadow-sm ${course.urgence === "tres_urgent" ? "border-red-300 bg-red-50/30" : course.urgence === "urgent" ? "border-orange-300 bg-orange-50/30" : ""}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <p className="font-bold text-sm">{course.quartier_depart} → {course.quartier_arrivee}</p>
            <p className="text-xs text-muted-foreground">{course.client_name || course.client_email} · {moment(course.created_date).format("HH:mm")}</p>
          </div>
          <div className="text-right">
            <p className="font-extrabold text-primary text-sm">{(course.prix || 0).toLocaleString()} F</p>
            {course.urgence && course.urgence !== "normal" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">⚡ {course.urgence}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => setSelectedCourse(course)}>
            <Truck className="h-3 w-3 mr-1" /> Assigner
          </Button>
          {course.client_email && (
            <a href={`tel:${course.telephone_expediteur || ""}`}>
              <Button size="sm" variant="outline" className="h-8 text-xs"><Phone className="h-3 w-3" /></Button>
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/staff")}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Dispatch des courses</h1>
          <p className="text-xs text-muted-foreground">Assignation manuelle</p>
        </div>
        <Button variant="ghost" size="icon" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StaffStatCard label="En attente" value={courses.length} color="text-violet-600" icon={Package} />
        <StaffStatCard label="Urgentes" value={urgent.length} color="text-red-600" icon={Zap} />
        <StaffStatCard label="Livreurs dispo" value={livreurs.length} color="text-green-600" icon={Truck} />
      </div>

      <input type="text" placeholder="Rechercher course, client, quartier…" value={search} onChange={e => setSearch(e.target.value)}
        className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white" />

      <Tabs defaultValue="all">
        <TabsList className="w-full">
          <TabsTrigger value="all" className="flex-1">Toutes ({courses.length})</TabsTrigger>
          <TabsTrigger value="urgent" className="flex-1">⚡ Urgentes ({urgent.length})</TabsTrigger>
          <TabsTrigger value="livreurs" className="flex-1">🛵 Livreurs ({livreurs.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="space-y-3 mt-4">
          {filteredCourses.length === 0 ? <p className="text-center text-sm text-muted-foreground py-8">Aucune donnée disponible</p> : filteredCourses.map(c => <CourseCard key={c.id} course={c} />)}
        </TabsContent>
        <TabsContent value="urgent" className="space-y-3 mt-4">
          {urgent.length === 0 ? <p className="text-center text-sm text-muted-foreground py-8">Aucune donnée disponible</p> : urgent.map(c => <CourseCard key={c.id} course={c} />)}
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
                  </div>
                </div>
                {l.telephone && <a href={`tel:${l.telephone}`}><Button size="sm" variant="outline" className="h-7 text-xs"><Phone className="h-3 w-3" /></Button></a>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedCourse} onOpenChange={v => { if (!v) setSelectedCourse(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Choisir un livreur</DialogTitle></DialogHeader>
          {selectedCourse && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-muted/40 text-sm">
                <p className="font-semibold">{selectedCourse.quartier_depart} → {selectedCourse.quartier_arrivee}</p>
                <p className="text-muted-foreground text-xs">{selectedCourse.prix} F · {selectedCourse.type_colis}</p>
              </div>
              {livreurs.length === 0 && <p className="text-center text-sm text-muted-foreground py-4">Aucune donnée disponible</p>}
              {livreurs.map(l => (
                <div key={l.id} className="flex items-center gap-3 p-3 rounded-xl border hover:bg-muted/30">
                  <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center font-bold text-green-700 flex-shrink-0">{l.full_name?.charAt(0)}</div>
                  <div className="flex-1">
                    <p className="font-bold text-sm">{l.full_name}</p>
                    <p className="text-xs text-muted-foreground">{l.quartier || "—"} · {l.nombre_courses_actives || 0} courses actives</p>
                  </div>
                  <Button size="sm" className="h-8 text-xs" onClick={() => handleAssign(l)} disabled={processing}>
                    Assigner ce livreur
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}