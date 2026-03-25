import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, TrendingUp, Package, Users, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import moment from "moment";

const COLORS = ["hsl(207, 90%, 54%)", "hsl(28, 100%, 55%)", "hsl(150, 60%, 45%)", "hsl(280, 65%, 60%)", "hsl(0, 84%, 60%)"];

export default function Statistiques() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [livreurs, setLivreurs] = useState([]);
  const [commissionActive, setCommissionActive] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [coursesData, livreursData, me] = await Promise.all([
        base44.entities.Course.list("-created_date", 200),
        base44.entities.User.filter({ role: "livreur" }),
        base44.auth.me(),
      ]);
      setCourses(coursesData);
      setLivreurs(livreursData);
      setCommissionActive(me.commission_mode !== false);
      setLoading(false);
    };
    load();
  }, []);

  const toggleCommission = async () => {
    const newVal = !commissionActive;
    setCommissionActive(newVal);
    await base44.auth.updateMe({ commission_mode: newVal });
  };

  // Stats calculations
  const livrees = courses.filter(c => c.statut === "livree");
  const totalRevenu = livrees.filter(c => c.commission_active).reduce((sum, c) => sum + (c.commission || 0), 0);
  const totalCA = livrees.reduce((sum, c) => sum + (c.prix || 0), 0);

  // Courses per day (last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = moment().subtract(6 - i, "days");
    const count = courses.filter(c => moment(c.created_date).isSame(date, "day")).length;
    return { jour: date.format("dd"), courses: count };
  });

  // Status distribution
  const statusData = [
    { name: "En attente", value: courses.filter(c => c.statut === "en_attente").length },
    { name: "Acceptées", value: courses.filter(c => c.statut === "acceptee").length },
    { name: "En cours", value: courses.filter(c => c.statut === "en_cours").length },
    { name: "Livrées", value: courses.filter(c => c.statut === "livree").length },
    { name: "Annulées", value: courses.filter(c => c.statut === "annulee").length },
  ].filter(d => d.value > 0);

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
        <h1 className="text-xl font-bold">Statistiques</h1>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <Package className="h-5 w-5 text-primary mx-auto mb-1" />
            <p className="text-2xl font-bold">{courses.length}</p>
            <p className="text-[10px] text-muted-foreground">Total courses</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Truck className="h-5 w-5 text-green-500 mx-auto mb-1" />
            <p className="text-2xl font-bold">{livrees.length}</p>
            <p className="text-[10px] text-muted-foreground">Livrées</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <TrendingUp className="h-5 w-5 text-accent mx-auto mb-1" />
            <p className="text-2xl font-bold">{totalCA.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">CA total (FCFA)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Users className="h-5 w-5 text-purple-500 mx-auto mb-1" />
            <p className="text-2xl font-bold">{livreurs.length}</p>
            <p className="text-[10px] text-muted-foreground">Livreurs</p>
          </CardContent>
        </Card>
      </div>

      {/* Commission toggle */}
      <Card className="bg-accent/5 border-accent/20">
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">Commission (20%)</p>
            <p className="text-xs text-muted-foreground">
              {commissionActive ? "Active" : "Mode promo — désactivée"}
            </p>
            <p className="text-lg font-bold text-accent mt-1">{totalRevenu.toLocaleString()} FCFA</p>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">{commissionActive ? "ON" : "OFF"}</Label>
            <Switch checked={commissionActive} onCheckedChange={toggleCommission} />
          </div>
        </CardContent>
      </Card>

      {/* Bar chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Courses / jour (7 derniers jours)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={last7Days}>
              <XAxis dataKey="jour" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="courses" fill="hsl(207, 90%, 54%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Pie chart */}
      {statusData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Répartition des statuts</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, value }) => `${name} (${value})`}
                >
                  {statusData.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}