import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, MapPin, Phone, Package, User, Clock, Navigation } from "lucide-react";
import MapSuivi from "../../components/MapSuivi";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from "../../components/StatusBadge";
import moment from "moment";

export default function CourseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || id === ':id') {
      setLoading(false);
      return;
    }
    const load = async () => {
      const courses = await base44.entities.Course.filter({ id });
      if (courses.length > 0) setCourse(courses[0]);
      setLoading(false);
    };
    load();

    const unsub = base44.entities.Course.subscribe((event) => {
      if (event.id === id) {
        setCourse(event.data);
      }
    });
    return unsub;
  }, [id]);

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
          <h1 className="text-lg font-bold">Détails de la course</h1>
          <p className="text-xs text-muted-foreground">#{course.id?.slice(0, 8)}</p>
        </div>
        <StatusBadge statut={course.statut} />
      </div>

      {/* Itinerary */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center mt-1">
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <div className="h-10 w-0.5 bg-muted" />
              <div className="h-3 w-3 rounded-full bg-red-500" />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">Départ</p>
                <p className="font-medium">{course.quartier_depart}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Arrivée</p>
                <p className="font-medium">{course.quartier_arrivee}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Details */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Package className="h-4 w-4 text-accent" />
            <div>
              <p className="text-xs text-muted-foreground">Type de colis</p>
              <p className="text-sm font-medium">{course.type_colis}</p>
            </div>
          </div>
          {course.description && (
            <p className="text-sm text-muted-foreground pl-7">{course.description}</p>
          )}
          <div className="flex items-center gap-3">
            <Phone className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Expéditeur</p>
              <p className="text-sm font-medium">{course.telephone_expediteur}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Phone className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Destinataire</p>
              <p className="text-sm font-medium">{course.telephone_destinataire}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Suivi GPS */}
      {course.livreur_lat && course.livreur_lng && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Navigation className="h-4 w-4 text-primary" />
              Suivi en temps réel
            </p>
            <MapSuivi livreurLat={course.livreur_lat} livreurLng={course.livreur_lng} />
          </CardContent>
        </Card>
      )}

      {/* Livreur */}
      {course.livreur_name && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Livreur</p>
                <p className="font-medium">{course.livreur_name}</p>
              </div>
              <Navigation className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-medium">Historique</p>
          <div className="space-y-2">
            <TimelineItem
              label="Créée"
              date={course.created_date}
              active
            />
            {course.date_acceptation && (
              <TimelineItem label="Acceptée" date={course.date_acceptation} active />
            )}
            {course.date_recuperation && (
              <TimelineItem label="Colis récupéré" date={course.date_recuperation} active />
            )}
            {course.date_livraison && (
              <TimelineItem label="Livrée" date={course.date_livraison} active />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Price */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4 flex items-center justify-between">
          <span className="font-medium">Prix total</span>
          <span className="text-2xl font-bold text-primary">{course.prix} FCFA</span>
        </CardContent>
      </Card>
    </div>
  );
}

function TimelineItem({ label, date, active }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`h-2 w-2 rounded-full ${active ? "bg-primary" : "bg-muted"}`} />
      <div className="flex-1 flex items-center justify-between">
        <span className="text-sm">{label}</span>
        <span className="text-xs text-muted-foreground">{moment(date).format("DD/MM HH:mm")}</span>
      </div>
    </div>
  );
}