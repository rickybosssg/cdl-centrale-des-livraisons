import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Phone, Package, MapPin, CheckCircle2, Navigation, TrendingUp, Zap } from "lucide-react";
import MiniChat from "../../components/MiniChat";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from "../../components/StatusBadge";
import { toast } from "sonner";
import { vibrateSuccess, vibrateMedium, vibrateNotif, playNotificationSound } from "@/lib/vibration";

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

    // Subscription temps réel
    const unsub = base44.entities.Course.subscribe((event) => {
      if (event.id === id && event.data) {
        setCourse(event.data);
      }
    });
    return unsub;
  }, [id]);

  // GPS tracking — partage la position du livreur en temps réel
  useEffect(() => {
    if (!course || !['acceptee', 'en_cours'].includes(course.statut)) return;
    if (!navigator.geolocation) return;
    const update = (pos) => {
      base44.entities.Course.update(id, {
        livreur_lat: pos.coords.latitude,
        livreur_lng: pos.coords.longitude,
      });
      // Aussi sur le profil livreur
      base44.auth.updateMe({
        gps_latitude: pos.coords.latitude,
        gps_longitude: pos.coords.longitude,
      });
    };
    const watchId = navigator.geolocation.watchPosition(update, null, { enableHighAccuracy: true, maximumAge: 8000, timeout: 10000 });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [course?.statut, id]);

  const recupererColis = async () => {
    setUpdating(true);
    // Optimistic UI
    setCourse(prev => ({ ...prev, statut: "en_cours", date_recuperation: new Date().toISOString() }));
    await base44.entities.Course.update(id, {
      statut: "en_cours",
      date_recuperation: new Date().toISOString(),
    });
    vibrateSuccess();
    toast.success("Colis récupéré !");
    setUpdating(false);
  };

  const livrerColis = async () => {
    setUpdating(true);
    console.log('[CourseLivreur] livrerColis START — course.id:', course.id, 'statut:', course.statut);
    const montant = course.prix || 0;
    const gainLivreur = course.gain_livreur || Math.round(montant * 0.8);
    const commissionCdl = course.commission_cdl || (montant - gainLivreur);

    // 1. Débiter client + créditer livreur via Bedou
    let bedouOk = false;
    try {
      const res = await base44.functions.invoke('bedouEngine', {
        action: 'finaliser_course',
        course_id: course.id,
        client_email: course.client_email,
        client_nom: course.client_name,
        livreur_email: course.livreur_email,
        livreur_nom: course.livreur_name,
        montant,
      });
      console.log('[CourseLivreur] bedouEngine result:', res.data);
      if (!res.data.success) {
        if (res.data.insuffisant) {
          toast.error(`Solde Bedou du client insuffisant (${res.data.solde} FCFA). Contactez l'administration.`);
        } else {
          toast.error(res.data.error || 'Erreur lors du règlement Bedou');
        }
        setUpdating(false);
        return;
      }
      bedouOk = true;
    } catch (err) {
      console.error('[CourseLivreur] bedouEngine error:', err);
      toast.error('Erreur Bedou : ' + err.message + ' — Réessayez.');
      setUpdating(false);
      return;
    }

    // 2. Mettre à jour la course en BDD
    try {
      await base44.entities.Course.update(id, {
        statut: 'livree',
        date_livraison: new Date().toISOString(),
        statut_paiement: 'paye',
        commission_cdl: commissionCdl,
        gain_livreur: gainLivreur,
        statut_paiement_livreur: 'Payé',
      });
      console.log('[CourseLivreur] Course mise à jour → livree');
    } catch (err) {
      console.error('[CourseLivreur] Course update error:', err);
      toast.error('Erreur mise à jour course : ' + err.message);
      setUpdating(false);
      return;
    }

    // 3. Mettre à jour UI localement (après succès BDD)
    setCourse(prev => ({ ...prev, statut: 'livree', date_livraison: new Date().toISOString(), gain_livreur: gainLivreur }));

    // 4. Stats livreur (fire & forget)
    base44.entities.User.filter({ email: course.livreur_email }).then(livreurs => {
      if (livreurs.length > 0) {
        const livreur = livreurs[0];
        base44.entities.User.update(livreur.id, {
          total_courses_livrees: (livreur.total_courses_livrees || 0) + 1,
          nombre_courses_actives: Math.max(0, (livreur.nombre_courses_actives || 0) - 1),
        }).catch(e => console.warn('[CourseLivreur] stats livreur err:', e));
      }
    }).catch(() => {});

    // 5. Streak (fire & forget)
    base44.functions.invoke('updateLivreurStreak', {}).catch(() => {});

    // 6. Notifier client
    base44.entities.Notification.create({
      destinataire_email: course.client_email,
      destinataire_role: 'client',
      titre: '✅ Colis livré ! Notez votre livreur',
      message: `Votre colis a été livré. ${montant} FCFA débités de votre Bedou. Notez ${course.livreur_name} !`,
      type: 'success',
      lue: false,
      course_id: course.id,
    }).catch(() => {});

    vibrateSuccess();
    toast.success(`🎉 Livraison confirmée ! +${gainLivreur} FCFA crédités sur votre Bedou.`);
    console.log('[CourseLivreur] livrerColis DONE — gainLivreur:', gainLivreur);
    setUpdating(false);
  };

  const marquerCourseEffectuee = async () => {
    setUpdating(true);
    console.log('[CourseLivreur] marquerCourseEffectuee START');
    try {
      const me = await base44.auth.me();
      await base44.auth.updateMe({
        disponible: true,
        nombre_courses_actives: Math.max(0, (me.nombre_courses_actives || 0) - 1),
      });
      vibrateSuccess();
      toast.success('✅ Vous êtes de nouveau disponible pour de nouvelles courses !');
      console.log('[CourseLivreur] marquerCourseEffectuee DONE — livreur remis disponible');
      navigate('/mes-livraisons');
    } catch (err) {
      console.error('[CourseLivreur] marquerCourseEffectuee error:', err);
      toast.error('Erreur : ' + err.message + ' — Réessayez.');
      setUpdating(false);
    }
  };

  const openMaps = () => {
    // L'itinéraire va toujours vers le point de DÉPART (récupération du colis)
    let dest;
    if (course.latitude_depart && course.longitude_depart) {
      dest = `${course.latitude_depart},${course.longitude_depart}`;
    } else {
      dest = encodeURIComponent(`${course.quartier_depart}, Ouagadougou, Burkina Faso`);
    }
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, "_blank");
  };

  const openMapsArrivee = () => {
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
              <Button variant="outline" size="sm"><Phone className="h-3 w-3 mr-1" />Appeler</Button>
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
              <Button variant="outline" size="sm"><Phone className="h-3 w-3 mr-1" />Appeler</Button>
            </a>
          </div>
          {course.client_email && (
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-green-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Client</p>
                  <p className="text-sm font-medium">{course.client_name}</p>
                </div>
              </div>
              {course.telephone_expediteur && (
                <a href={`tel:${course.telephone_expediteur}`}>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700"><Phone className="h-3 w-3 mr-1" />Appeler</Button>
                </a>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Urgence badge */}
      {course.urgence && course.urgence !== 'normal' && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border font-semibold text-sm ${
          course.urgence === 'tres_urgent'
            ? 'bg-red-50 border-red-300 text-red-700'
            : 'bg-orange-50 border-orange-300 text-orange-700'
        }`}>
          <Zap className="h-4 w-4" />
          {course.urgence === 'tres_urgent' ? '🚨 Livraison très urgente (- 20 min)' : '🔔 Livraison urgente (- 30 min)'}
        </div>
      )}

      {/* Colis info */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5 text-accent" />
            <div className="flex-1">
              <p className="font-medium">{course.type_colis}</p>
              {course.description && (
                <p className="text-xs text-muted-foreground">{course.description}</p>
              )}
            </div>
          </div>
          {course.supplement_urgence > 0 ? (
            <div className="bg-muted/50 rounded-lg p-2 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Montant de base</span>
                <span>{(course.prix - (course.supplement_urgence || 0)).toLocaleString()} FCFA</span>
              </div>
              <div className={`flex justify-between font-medium ${
                course.urgence === 'tres_urgent' ? 'text-red-600' : 'text-orange-600'
              }`}>
                <span>Supplément urgence</span>
                <span>+{course.supplement_urgence} FCFA</span>
              </div>
              <div className="flex justify-between font-bold border-t pt-1">
                <span>Total</span>
                <span className="text-primary">{course.prix?.toLocaleString()} FCFA</span>
              </div>
            </div>
          ) : (
            <div className="flex justify-end">
              <span className="font-bold text-primary">{course.prix} FCFA</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Google Maps */}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="w-full" onClick={openMaps}>
          <Navigation className="h-4 w-4 mr-2" />
          Aller au départ
        </Button>
        <Button variant="outline" className="w-full" onClick={openMapsArrivee}>
          <Navigation className="h-4 w-4 mr-2" />
          Aller à l'arrivée
        </Button>
      </div>

      {/* Mini Chat */}
      {["acceptee", "en_cours"].includes(course.statut) && (
        <MiniChat course={course} user={{ email: course.livreur_email, full_name: course.livreur_name, user_type: "livreur" }} />
      )}

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

      {course.statut === "livree" && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 space-y-4 text-center">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-9 w-9 text-green-600" />
            </div>
            <div>
              <p className="text-green-700 font-bold text-base">🎉 Course livrée avec succès !</p>
              {course.gain_livreur > 0 && (
                <p className="text-green-600 font-semibold text-sm mt-1">+{course.gain_livreur?.toLocaleString()} FCFA crédités sur votre Bedou</p>
              )}
              <p className="text-xs text-green-600 mt-2">Appuyez sur le bouton ci-dessous pour vous remettre disponible et accepter de nouvelles courses.</p>
            </div>
            <Button
              className="w-full h-14 text-base font-bold bg-green-600 hover:bg-green-700 active:scale-[0.98] transition-all"
              onClick={marquerCourseEffectuee}
              disabled={updating}
            >
              {updating ? (
                <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Validation en cours...</>
              ) : (
                <><CheckCircle2 className="h-5 w-5 mr-2" />Je suis disponible — Nouvelles courses</>
              )}
            </Button>
            {!updating && (
              <button
                onClick={() => navigate('/mes-livraisons')}
                className="text-xs text-green-700 underline"
              >
                Voir mon historique de livraisons
              </button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}