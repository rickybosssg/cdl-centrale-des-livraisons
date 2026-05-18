import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, UserPlus, RefreshCw, Eye, Clock, Zap, User } from "lucide-react";
import AdminCourseActions from "../../components/AdminCourseActions";
import AssignDriverModal from "../../components/AssignDriverModal";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from "../../components/StatusBadge";
import { toast } from "sonner";
import moment from "moment";

export default function GererCourses() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [assignDialog, setAssignDialog] = useState(false);
  const [detailDialog, setDetailDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('courses');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatut, setFilterStatut] = useState('tous');
  const [filterTypeColis, setFilterTypeColis] = useState('tous');

  const loadData = async () => {
    try {
      const coursesData = await base44.entities.Course.list("-created_date", 200);
      setCourses(coursesData);
    } catch (err) {
      console.error('[GererCourses] Load error:', err);
      toast.error('Erreur lors du chargement: ' + (err?.message || ''));
    } finally {
      setLoading(false);
    }
  };

  // Mise à jour optimiste instantanée après annulation/suppression admin
  // Appelé PAR AdminCourseActions avant même la propagation realtime
  const handleCancelDone = (courseId, action, updatedCourse) => {
    console.log(`[REALTIME_PROPAGATED] optimistic update | course=${courseId} | action=${action} | ts=${new Date().toISOString()}`);
    if (action === 'delete_admin') {
      // Retirer immédiatement de toutes les listes
      setCourses(prev => prev.filter(c => c.id !== courseId));
    } else {
      // cancel_admin : mettre à jour le statut → la course glisse vers l'onglet "Terminées" immédiatement
      setCourses(prev => prev.map(c => c.id === courseId ? updatedCourse : c));
    }
    // Fermer le détail si ouvert sur cette course
    if (selectedCourse?.id === courseId) {
      setDetailDialog(false);
      setSelectedCourse(null);
    }
  };

  useEffect(() => {
    loadData();
    
    const unsub = base44.entities.Course.subscribe((event) => {
      if (!event.id) return;
      if (event.type === 'create' && event.data) {
        setCourses(prev => prev.find(c => c.id === event.id) ? prev : [event.data, ...prev]);
      } else if (event.type === 'update' && event.data) {
        console.log(`[REALTIME_PROPAGATED] subscription update | course=${event.id} | statut=${event.data?.statut}`);
        setCourses(prev => prev.map(c => c.id === event.id ? event.data : c));
      } else if (event.type === 'delete') {
        setCourses(prev => prev.filter(c => c.id !== event.id));
      }
    });
    
    return () => {
      if (unsub) unsub();
    };
  }, []);

  const relancerDispatch = async (course) => {
    toast.info("Re-dispatch en cours...");
    try {
      const result = await base44.functions.invoke('assignCourseAction', { course_id: course.id, mode: 'redispatch' });
      if (result?.data?.success) {
        toast.success(`Course envoyée à ${result.data.livreur?.nom}`);
      } else {
        toast.error(result?.data?.reason || "Aucun livreur disponible");
      }
    } catch (e) {
      toast.error("Erreur lors du dispatch");
    }
    setTimeout(loadData, 500);
  };

  const changerStatut = async (courseId, newStatut) => {
    try {
      const updateData = { statut: newStatut };
      if (newStatut === "livree") {
        updateData.date_livraison = new Date().toISOString();
        const course = courses.find(c => c.id === courseId);
        if (course) {
          const avecPromo = !!course.code_promo_utilise;
          const commissionCdl = avecPromo ? 0 : (course.prix || 0) * 0.2;
          const gainLivreur = avecPromo ? (course.prix || 0) : (course.prix || 0) * 0.8;
          updateData.commission_cdl = commissionCdl;
          updateData.gain_livreur = gainLivreur;
          updateData.statut_paiement_livreur = avecPromo ? "Payé" : "Commission due";
          const livreursData = await base44.entities.User.filter({ email: course.livreur_email });
          if (livreursData.length > 0) {
            const l = livreursData[0];
            const nouveauSolde = (l.solde_commission_du || 0) + commissionCdl;
            await base44.entities.User.update(l.id, {
              solde_commission_du: nouveauSolde,
              total_courses_livrees: (l.total_courses_livrees || 0) + 1,
              total_commissions_generees: (l.total_commissions_generees || 0) + commissionCdl,
              statut_financier_livreur: nouveauSolde > 0 ? "Doit une commission" : "À jour",
              nombre_courses_actives: Math.max(0, (l.nombre_courses_actives || 0) - 1),
            });
          }
        }
      }
      if (newStatut === "en_cours") updateData.date_recuperation = new Date().toISOString();
      if (newStatut === "annulee") updateData.date_livraison = new Date().toISOString();
      await base44.entities.Course.update(courseId, updateData);
      toast.success("Statut mis à jour");
      setTimeout(loadData, 500);
    } catch (err) {
      console.error('[changerStatut]', err);
      toast.error('Erreur: ' + (err?.message || ''));
    }
  };

  const URGENCE_SCORE = { tres_urgent: 3, urgent: 2, normal: 1 };
  const sortByUrgence = (list) => [...list].sort((a, b) => {
    const ua = URGENCE_SCORE[a.urgence] || 1;
    const ub = URGENCE_SCORE[b.urgence] || 1;
    if (ub !== ua) return ub - ua;
    return new Date(a.created_date) - new Date(b.created_date);
  });

  const filterCourses = (list) => {
    return list.filter(c => {
      const search = searchQuery.toLowerCase();
      const matchesSearch = !search || 
        c.id?.toLowerCase().includes(search) ||
        c.client_name?.toLowerCase().includes(search) ||
        c.livreur_name?.toLowerCase().includes(search) ||
        c.telephone_expediteur?.includes(search) ||
        c.telephone_destinataire?.includes(search) ||
        c.quartier_depart?.toLowerCase().includes(search) ||
        c.quartier_arrivee?.toLowerCase().includes(search);
      const matchesStatut = filterStatut === 'tous' || c.statut === filterStatut;
      const matchesType = filterTypeColis === 'tous' || c.type_colis === filterTypeColis;
      return matchesSearch && matchesStatut && matchesType;
    });
  };

  // Exclure les courses supprimées logiquement des listes normales
  const visibles = courses.filter(c => !c.is_deleted);
  const enAttente = sortByUrgence(filterCourses(visibles.filter(c => ["en_attente", "aucun_livreur"].includes(c.statut) && !c.moyen_transport)));
  const assignees = filterCourses(visibles.filter(c => c.statut === "assignee_attente" && !c.moyen_transport));
  const enCours = filterCourses(visibles.filter(c => ["acceptee", "en_cours"].includes(c.statut) && !c.moyen_transport));
  const terminees = filterCourses(visibles.filter(c => ["livree", "annulee", "annulee_par_admin"].includes(c.statut) && !c.moyen_transport));

  const deplacementsMoto = courses.filter(c => c.moyen_transport === "moto");
  const deplotementsVehicule = courses.filter(c => c.moyen_transport === "vehicule");

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const UrgenceBadge = ({ urgence }) => {
    if (!urgence || urgence === 'normal') return null;
    return urgence === 'tres_urgent' ? (
      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold animate-pulse">
        🚨 TRÈS URGENT
      </span>
    ) : (
      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-bold">
        🔔 URGENT
      </span>
    );
  };

  const CourseRow = ({ course, actions }) => (
    <Card className={`border-l-4 ${
      course.urgence === 'tres_urgent' ? 'border-l-red-500' :
      course.urgence === 'urgent' ? 'border-l-orange-500' : 'border-l-primary'
    }`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-muted-foreground">#{course.id?.slice(0, 8)}</span>
              <StatusBadge statut={course.statut} />
              <UrgenceBadge urgence={course.urgence} />
              {course.mode_assignation === 'auto' && (
                <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                  <Zap className="h-2.5 w-2.5" />Auto
                </span>
              )}
              {course.mode_assignation === 'manuel' && (
                <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                  <User className="h-2.5 w-2.5" />Manuel
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-sm">
              <span className="font-medium">{course.quartier_depart}</span>
              <span className="text-muted-foreground">→</span>
              <span className="font-medium">{course.quartier_arrivee}</span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
              <span>{course.type_colis}</span>
              {course.prix && <span className="font-semibold text-primary">{course.prix} FCFA</span>}
              {course.mode_paiement && <span>{course.mode_paiement}</span>}
            </div>
            {course.livreur_name && (
              <p className="text-xs text-muted-foreground mt-1">🛵 {course.livreur_name}</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              <Clock className="h-3 w-3 inline mr-0.5" />
              {moment(course.created_date).format("DD/MM HH:mm")}
              {course.heure_assignation && ` • Assignée ${moment(course.heure_assignation).format("HH:mm")}`}
              {course.date_livraison && ` • Livrée ${moment(course.date_livraison).format("HH:mm")}`}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 flex-shrink-0"
            onClick={() => { setSelectedCourse(course); setDetailDialog(true); }}
          >
            <Eye className="h-4 w-4" />
          </Button>
        </div>
        {actions && <div className="flex gap-2 mt-2">{actions}</div>}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Gérer les Courses Trajets</h1>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* RECHERCHE ET FILTRES */}
      <div className="space-y-3 p-4 rounded-xl bg-muted/40 border">
        <input
          type="text"
          placeholder="Rechercher par nom, numéro, téléphone, quartier..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value)}
            className="px-3 py-2 rounded-lg border bg-white text-xs focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="tous">Tous les statuts</option>
            <option value="en_attente">En attente</option>
            <option value="assignee_attente">Assignées</option>
            <option value="acceptee">Acceptées</option>
            <option value="en_cours">En cours</option>
            <option value="livree">Livrées</option>
            <option value="annulee">Annulées</option>
          </select>
          <select
            value={filterTypeColis}
            onChange={(e) => setFilterTypeColis(e.target.value)}
            className="px-3 py-2 rounded-lg border bg-white text-xs focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="tous">Tous les types</option>
            <option value="Documents">Documents</option>
            <option value="Petit colis">Petit colis</option>
            <option value="Colis moyen">Colis moyen</option>
            <option value="Gros colis">Gros colis</option>
            <option value="Nourriture">Nourriture</option>
            <option value="Autre">Autre</option>
          </select>
        </div>
        {(searchQuery || filterStatut !== 'tous' || filterTypeColis !== 'tous') && (
          <button
            onClick={() => { setSearchQuery(''); setFilterStatut('tous'); setFilterTypeColis('tous'); }}
            className="w-full text-xs font-medium text-primary hover:underline"
          >
            ↻ Réinitialiser les filtres
          </button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="courses" className="text-xs">📦 Courses ({enAttente.length + assignees.length + enCours.length + terminees.length})</TabsTrigger>
          <TabsTrigger value="moto" className="text-xs">🏍️ Motos ({deplacementsMoto.length})</TabsTrigger>
          <TabsTrigger value="vehicule" className="text-xs">🚗 Véhicules ({deplotementsVehicule.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="courses" className="space-y-3 mt-3">
          {/* Dispatch manuel — bloc temps réel maintenant dans AppLayoutWrapper (global) */}

          <Tabs defaultValue="attente" className="w-full">
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="attente" className="text-xs">Attente ({enAttente.length})</TabsTrigger>
              <TabsTrigger value="assignees" className="text-xs">Assignées ({assignees.length})</TabsTrigger>
              <TabsTrigger value="encours" className="text-xs">En cours ({enCours.length})</TabsTrigger>
              <TabsTrigger value="terminees" className="text-xs">Terminées ({terminees.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="attente" className="space-y-3 mt-3">
              {enAttente.filter(c => c.urgence === 'tres_urgent' && c.statut !== 'aucun_livreur').length > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border-2 border-red-300 animate-pulse text-sm font-bold text-red-700">
                  🚨 {enAttente.filter(c => c.urgence === 'tres_urgent').length} course(s) TRÈS URGENTE(S) en attente !
                </div>
              )}
              {enAttente.map((course) => (
                <CourseRow
                  key={course.id}
                  course={course}
                  actions={
                    <>
                      <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => relancerDispatch(course)}>
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Re-dispatch
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => { setSelectedCourse(course); setAssignDialog(true); }}>
                        <UserPlus className="h-3 w-3 mr-1" />
                        Manuel
                      </Button>
                      <AdminCourseActions course={course} onDone={handleCancelDone} />
                      </>
                      }
                      />
                      ))}
                      {enAttente.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Aucune course en attente</p>}
            </TabsContent>

            <TabsContent value="assignees" className="space-y-3 mt-3">
              {assignees.map((course) => (
                <CourseRow
                  key={course.id}
                  course={course}
                  actions={
                    <>
                      <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => { setSelectedCourse(course); setAssignDialog(true); }}>
                        <UserPlus className="h-3 w-3 mr-1" />
                        Réassigner
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs text-green-600 border-green-300" onClick={() => changerStatut(course.id, "acceptee")}>
                        Forcer acceptation
                      </Button>
                      <AdminCourseActions course={course} onDone={handleCancelDone} />
                    </>
                  }
                />
              ))}
              {assignees.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Aucune course assignée en attente</p>}
            </TabsContent>

            <TabsContent value="encours" className="space-y-3 mt-3">
              {enCours.map((course) => (
                <CourseRow
                  key={course.id}
                  course={course}
                  actions={
                    <>
                      {course.statut === "acceptee" && (
                        <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => changerStatut(course.id, "en_cours")}>
                          Marquer récupéré
                        </Button>
                      )}
                      {course.statut === "en_cours" && (
                        <Button size="sm" className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-700" onClick={() => changerStatut(course.id, "livree")}>
                          Marquer livré
                        </Button>
                      )}
                      <AdminCourseActions course={course} onDone={handleCancelDone} />
                    </>
                  }
                />
              ))}
              {enCours.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Aucune course en cours</p>}
            </TabsContent>

            <TabsContent value="terminees" className="space-y-3 mt-3">
              {terminees.map((course) => (
                <CourseRow
                  key={course.id}
                  course={course}
                  actions={<AdminCourseActions course={course} onDone={handleCancelDone} />}
                />
              ))}
              {terminees.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Aucune course terminée</p>}
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="moto" className="space-y-3 mt-3">
          {deplacementsMoto.map((course) => (
            <CourseRow key={course.id} course={course} />
          ))}
          {deplacementsMoto.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Aucun déplacement en motocyclette</p>}
        </TabsContent>

        <TabsContent value="vehicule" className="space-y-3 mt-3">
          {deplotementsVehicule.map((course) => (
            <CourseRow key={course.id} course={course} />
          ))}
          {deplotementsVehicule.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Aucun déplacement en véhicule</p>}
        </TabsContent>
      </Tabs>

      {/* Modal d'assignation global — source unique */}
      <AssignDriverModal
        course={selectedCourse}
        open={assignDialog}
        onClose={() => { setAssignDialog(false); }}
        onDone={() => { setSelectedCourse(null); setTimeout(loadData, 500); }}
      />

      {/* Dialog détails course */}
      <Dialog open={detailDialog} onOpenChange={setDetailDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Détails de la course</DialogTitle>
          </DialogHeader>
          {selectedCourse && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs text-muted-foreground">#{selectedCourse.id?.slice(0, 8)}</span>
                <StatusBadge statut={selectedCourse.statut} />
                {selectedCourse.mode_assignation === 'auto' && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                    <Zap className="h-2.5 w-2.5" />Assignation automatique
                  </span>
                )}
                {selectedCourse.mode_assignation === 'manuel' && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                    <User className="h-2.5 w-2.5" />Assignation manuelle
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-muted rounded"><p className="text-muted-foreground">Départ</p><p className="font-medium">{selectedCourse.quartier_depart}</p></div>
                <div className="p-2 bg-muted rounded"><p className="text-muted-foreground">Arrivée</p><p className="font-medium">{selectedCourse.quartier_arrivee}</p></div>
                <div className="p-2 bg-muted rounded"><p className="text-muted-foreground">Colis</p><p className="font-medium">{selectedCourse.type_colis}</p></div>
                <div className="p-2 bg-muted rounded"><p className="text-muted-foreground">Montant</p><p className="font-bold text-primary">{selectedCourse.prix} FCFA</p></div>
                <div className="p-2 bg-muted rounded"><p className="text-muted-foreground">Paiement</p><p className="font-medium">{selectedCourse.mode_paiement || "—"}</p></div>
                <div className="p-2 bg-muted rounded"><p className="text-muted-foreground">Livreur</p><p className="font-medium">{selectedCourse.livreur_name || "Non assigné"}</p></div>
              </div>
              {selectedCourse.commission_cdl > 0 && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 bg-primary/5 rounded"><p className="text-muted-foreground">Commission CDL (20%)</p><p className="font-bold text-primary">{Math.round(selectedCourse.commission_cdl).toLocaleString()} FCFA</p></div>
                  <div className="p-2 bg-green-50 rounded"><p className="text-muted-foreground">Gain livreur (80%)</p><p className="font-bold text-green-600">{Math.round(selectedCourse.gain_livreur).toLocaleString()} FCFA</p></div>
                </div>
              )}
              {(selectedCourse.nombre_tentatives > 0) && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Tentatives :</span>
                  <span className="font-bold">{selectedCourse.nombre_tentatives}</span>
                  {selectedCourse.heure_assignation && (
                    <span className="text-muted-foreground">• Assignée à {moment(selectedCourse.heure_assignation).format("HH:mm")}</span>
                  )}
                </div>
              )}
              {/* Actions admin dans le détail */}
              <div className="pt-2 border-t flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => { setDetailDialog(false); setAssignDialog(true); }}>
                  <UserPlus className="h-3.5 w-3.5 mr-1" />Assigner
                </Button>
                <AdminCourseActions course={selectedCourse} size="default" onDone={(cId, action, updated) => { setDetailDialog(false); handleCancelDone(cId, action, updated); }} />
              </div>

              {selectedCourse.historique_assignation && (() => {
                try {
                  const hist = JSON.parse(selectedCourse.historique_assignation);
                  if (!hist.length) return null;
                  const STATUT_LABELS = {
                    proposee: '⏳ Proposée',
                    acceptee: '✅ Acceptée',
                    refuse: '❌ Refusée',
                    no_response: '⏰ Sans réponse',
                    manuel: '🖐 Manuel',
                    aucun_livreur: '🚫 Aucun livreur',
                  };
                  return (
                    <div className="space-y-1.5">
                      <p className="font-semibold text-xs">Historique d'assignation ({hist.length} entrée{hist.length > 1 ? 's' : ''})</p>
                      {hist.map((h, i) => (
                        <div key={i} className="p-2 bg-muted rounded text-xs flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{h.livreur_nom || h.message || '—'}</p>
                            <p className="text-muted-foreground">{STATUT_LABELS[h.statut] || h.statut}</p>
                          </div>
                          <p className="text-muted-foreground whitespace-nowrap">{moment(h.heure).format('DD/MM HH:mm')}</p>
                        </div>
                      ))}
                    </div>
                  );
                } catch { return null; }
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}