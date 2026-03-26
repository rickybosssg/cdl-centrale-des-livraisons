import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Phone, Package, MapPin, CheckCircle2, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from "../../components/StatusBadge";
import { toast } from "sonner";

export default function CourseLivreur() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const load = async () => {
      const courses = await base44.entities.Course.filter({ id });
      if (courses.length > 0) setCourse(courses[0]);
      setLoading(false);
    };
    load();
  }, [id]);

  // GPS tracking — partage la position du livreur en temps réel
  useEffect(() => {
    if (!course || !['acceptee', 'en_cours'].includes(course.statut)) return;
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        base44.entities.Course.update(id, {
          livreur_lat: pos.coords.latitude,
          livreur_lng: pos.coords.longitude,
        });
      },
      null,
      { enableHighAccuracy: true, maximumAge: 8000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [course?.statut, id]);

  const recupererColis = async () => {
    setUpdating(true);
    await base44.entities.Course.update(id, {
      statut: "en_cours",
      date_recuperation: new Date().toISOString(),
    });
    setCourse(prev => ({ ...prev, statut: "en_cours", date_recuperation: new Date().toISOString() }));
    toast.success("Colis récupéré !");
    setUpdating(false);
  };

  const livrerColis = async () => {
    setUpdating(true);
    const commissionCdl = (course.prix || 0) * 0.2;
    const gainLivreur = (course.prix || 0) * 0.8;
    await base44.entities.Course.update(id, {
      statut: "livree",
      date_livraison: new Date().toISOString(),
      commission_cdl: commissionCdl,
      gain_livreur: gainLivreur,
      statut_paiement_livreur: "Commission due",
    });
    // Mettre à jour le solde du livreur
    const livreurs = await base44.entities.User.filter({ email: course.livreur_email });
    if (livreurs.length > 0) {
      const livreur = livreurs[0];
      const nouveauSolde = (livreur.solde_commission_du || 0) + commissionCdl;
      await base44.entities.User.update(livreur.id, {
        solde_commission_du: nouveauSolde,
        total_courses_livrees: (livreur.total_courses_livrees || 0) + 1,
        total_commissions_generees: (livreur.total_commissions_generees || 0) + commissionCdl,
        statut_financier_livreur: "Doit une commission",
        nombre_courses_actives: Math.max(0, (livreur.nombre_courses_actives || 0) - 1),
      });
    }
    setCourse(prev => ({ ...prev, statut: "livree", date_livraison: new Date().toISOString() }));
    toast.success("Colis livré avec succès !");
    setUpdating(false);
  };

  const openMaps = () => {
    const dest = encodeURIComponent(`${course.quartier_arrivee}, Ouagadougou, Burkina Faso`);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, "_blank");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Course introuvable</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Course #{course.id?.slice(0, 8)}</h1>
        </div>
        <StatusBadge statut={course.statut} />
      </div>

      {/* Itinerary */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center mt-1">
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <div className="h-10 w-0.5 bg-muted" />
              <div className="h-3 w-3 rounded-full bg-red-500" />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">Récupération</p>
                <p className="font-medium">{course.quartier_depart}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Livraison</p>
                <p className="font-medium">{course.quartier_arrivee}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contacts */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Expéditeur</p>
                <p className="text-sm font-medium">{course.telephone_expediteur}</p>
              </div>
            </div>
            <a href={`tel:${course.telephone_expediteur}`}>
              <Button variant="outline" size="sm">Appeler</Button>
            </a>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-accent" />
              <div>
                <p className="text-xs text-muted-foreground">Destinataire</p>
                <p className="text-sm font-medium">{course.telephone_destinataire}</p>
              </div>
            </div>
            <a href={`tel:${course.telephone_destinataire}`}>
              <Button variant="outline" size="sm">Appeler</Button>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Colis info */}
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <Package className="h-5 w-5 text-accent" />
          <div>
            <p className="font-medium">{course.type_colis}</p>
            {course.description && (
              <p className="text-xs text-muted-foreground">{course.description}</p>
            )}
          </div>
          <span className="ml-auto font-bold text-primary">{course.prix} FCFA</span>
        </CardContent>
      </Card>

      {/* Google Maps */}
      <Button variant="outline" className="w-full" onClick={openMaps}>
        <Navigation className="h-4 w-4 mr-2" />
        Voir l'itinéraire sur Google Maps
      </Button>

      {/* Action buttons */}
      {course.statut === "acceptee" && (
        <Button
          className="w-full h-12 text-base font-semibold bg-accent hover:bg-accent/90"
          onClick={recupererColis}
          disabled={updating}
        >
          <Package className="h-5 w-5 mr-2" />
          {updating ? "Mise à jour..." : "J'ai récupéré le colis"}
        </Button>
      )}

      {course.statut === "en_cours" && (
        <Button
          className="w-full h-12 text-base font-semibold bg-green-600 hover:bg-green-700"
          onClick={livrerColis}
          disabled={updating}
        >
          <CheckCircle2 className="h-5 w-5 mr-2" />
          {updating ? "Mise à jour..." : "Colis livré"}
        </Button>
      )}
    </div>
  );
}