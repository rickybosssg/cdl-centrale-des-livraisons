import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CourseCard from "../../components/CourseCard";
import StatusBadge from "../../components/StatusBadge";
import { toast } from "sonner";

export default function GererCourses() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [livreurs, setLivreurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [assignDialog, setAssignDialog] = useState(false);

  const loadData = async () => {
    const [coursesData, livreursData] = await Promise.all([
      base44.entities.Course.list("-created_date", 100),
      base44.entities.User.filter({ role: "livreur" }),
    ]);
    setCourses(coursesData);
    setLivreurs(livreursData);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const assignerLivreur = async (livreur) => {
    await base44.entities.Course.update(selectedCourse.id, {
      statut: "acceptee",
      livreur_email: livreur.email,
      livreur_name: livreur.full_name,
      date_acceptation: new Date().toISOString(),
    });
    toast.success(`Course assignée à ${livreur.full_name}`);
    setAssignDialog(false);
    setSelectedCourse(null);
    loadData();
  };

  const changerStatut = async (courseId, newStatut) => {
    const updateData = { statut: newStatut };
    if (newStatut === "livree") updateData.date_livraison = new Date().toISOString();
    if (newStatut === "en_cours") updateData.date_recuperation = new Date().toISOString();
    await base44.entities.Course.update(courseId, updateData);
    toast.success("Statut mis à jour");
    loadData();
  };

  const enAttente = courses.filter(c => c.statut === "en_attente");
  const enCours = courses.filter(c => ["acceptee", "en_cours"].includes(c.statut));
  const terminees = courses.filter(c => ["livree", "annulee"].includes(c.statut));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Gérer les courses</h1>
      </div>

      <Tabs defaultValue="attente">
        <TabsList className="w-full">
          <TabsTrigger value="attente" className="flex-1 text-xs">
            Attente ({enAttente.length})
          </TabsTrigger>
          <TabsTrigger value="encours" className="flex-1 text-xs">
            En cours ({enCours.length})
          </TabsTrigger>
          <TabsTrigger value="terminees" className="flex-1 text-xs">
            Terminées ({terminees.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="attente" className="space-y-3 mt-3">
          {enAttente.map((course) => (
            <CourseCard key={course.id} course={course}>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCourse(course);
                    setAssignDialog(true);
                  }}
                >
                  <UserPlus className="h-3 w-3 mr-1" />
                  Assigner
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    changerStatut(course.id, "annulee");
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </CourseCard>
          ))}
          {enAttente.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">Aucune course en attente</p>
          )}
        </TabsContent>

        <TabsContent value="encours" className="space-y-3 mt-3">
          {enCours.map((course) => (
            <CourseCard key={course.id} course={course}>
              <Select
                value={course.statut}
                onValueChange={(v) => changerStatut(course.id, v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="acceptee">Acceptée</SelectItem>
                  <SelectItem value="en_cours">En cours</SelectItem>
                  <SelectItem value="livree">Livrée</SelectItem>
                  <SelectItem value="annulee">Annulée</SelectItem>
                </SelectContent>
              </Select>
            </CourseCard>
          ))}
          {enCours.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">Aucune course en cours</p>
          )}
        </TabsContent>

        <TabsContent value="terminees" className="space-y-3 mt-3">
          {terminees.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
          {terminees.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">Aucune course terminée</p>
          )}
        </TabsContent>
      </Tabs>

      {/* Assign Dialog */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assigner un livreur</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {livreurs.filter(l => l.disponible).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Aucun livreur disponible
              </p>
            ) : (
              livreurs.filter(l => l.disponible).map((livreur) => (
                <div
                  key={livreur.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted cursor-pointer"
                  onClick={() => assignerLivreur(livreur)}
                >
                  <div>
                    <p className="font-medium text-sm">{livreur.full_name}</p>
                    <p className="text-xs text-muted-foreground">{livreur.quartier} • {livreur.telephone}</p>
                  </div>
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}