import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, TrendingUp, Calendar, CheckCircle2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import moment from "moment";

export default function GainsLivreur() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      setUser(me);
      const data = await base44.entities.Course.filter({ livreur_email: me.email, statut: "livree" }, "-date_livraison", 200);
      setCourses(data);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const today = new Date().toDateString();
  const startOfWeek = new Date(); startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfMonth = new Date(); startOfMonth.setDate(1);

  const gainJour = courses
    .filter(c => new Date(c.date_livraison).toDateString() === today)
    .reduce((s, c) => s + (c.gain_livreur || (c.prix * 0.8) || 0), 0);

  const gainSemaine = courses
    .filter(c => new Date(c.date_livraison) >= startOfWeek)
    .reduce((s, c) => s + (c.gain_livreur || (c.prix * 0.8) || 0), 0);

  const gainMois = courses
    .filter(c => new Date(c.date_livraison) >= startOfMonth)
    .reduce((s, c) => s + (c.gain_livreur || (c.prix * 0.8) || 0), 0);

  const gainTotal = courses.reduce((s, c) => s + (c.gain_livreur || (c.prix * 0.8) || 0), 0);
  const commissionDue = user?.solde_commission_du || 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Mes gains</h1>
      </div>

      {/* Résumé financier */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Aujourd'hui</p>
            <p className="text-2xl font-bold text-primary">{Math.round(gainJour).toLocaleString()} F</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Cette semaine</p>
            <p className="text-2xl font-bold">{Math.round(gainSemaine).toLocaleString()} F</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ce mois</p>
            <p className="text-2xl font-bold">{Math.round(gainMois).toLocaleString()} F</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total cumulé</p>
            <p className="text-2xl font-bold">{Math.round(gainTotal).toLocaleString()} F</p>
          </CardContent>
        </Card>
      </div>

      {/* Commission due */}
      {commissionDue > 0 && (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-amber-700">Commission due à CDL</p>
            <p className="text-2xl font-bold text-amber-600">{Math.round(commissionDue).toLocaleString()} FCFA</p>
            <p className="text-xs text-amber-600 mt-1">Veuillez régulariser votre situation auprès de CDL</p>
          </CardContent>
        </Card>
      )}

      {/* Statistiques */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="font-semibold text-sm">Mes statistiques</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <div>
                <p className="font-bold">{user?.total_courses_livrees || courses.length}</p>
                <p className="text-xs text-muted-foreground">Courses livrées</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <div>
                <p className="font-bold">{Math.round(user?.total_commissions_generees || 0).toLocaleString()} F</p>
                <p className="text-xs text-muted-foreground">Commissions générées</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Historique des livraisons */}
      <div className="space-y-2">
        <p className="font-semibold text-sm">Historique récent</p>
        {courses.slice(0, 20).map(course => (
          <Card key={course.id}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{course.quartier_depart} → {course.quartier_arrivee}</p>
                  <p className="text-xs text-muted-foreground">{moment(course.date_livraison).format("DD/MM/YYYY HH:mm")}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-green-600">+{Math.round(course.gain_livreur || (course.prix * 0.8) || 0).toLocaleString()} F</p>
                  <p className="text-xs text-muted-foreground">{course.prix} F total</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {courses.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-6">Aucune livraison effectuée</p>
        )}
      </div>
    </div>
  );
}