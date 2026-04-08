import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { TrendingUp, Flame, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const LEVEL_CFG = {
  extreme: { icon: Flame,      color: "text-red-600",    bg: "bg-red-50 border-red-300",    badge: "bg-red-100 text-red-700",    label: "🔴 Extrême" },
  fort:    { icon: Zap,        color: "text-orange-600", bg: "bg-orange-50 border-orange-300", badge: "bg-orange-100 text-orange-700", label: "🟠 Forte" },
  eleve:   { icon: TrendingUp, color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-300", badge: "bg-yellow-100 text-yellow-700", label: "🟡 Élevée" },
};

export default function SurgeZonesWidget() {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalSurgeRevenu, setTotalSurgeRevenu] = useState(0);

  const load = async () => {
    const courses = await base44.entities.Course.filter({ statut: 'en_attente' }, '-created_date', 200);
    const livreurs = await base44.entities.User.filter({ user_type: 'livreur', disponible: true });
    const livreursActifs = (livreurs || []).filter(l => !l.livreur_bloque);

    // Calculer par zone
    const zoneMap = {};
    (courses || []).forEach(c => {
      const z = c.quartier_depart || 'Inconnu';
      if (!zoneMap[z]) zoneMap[z] = { courses: 0, livreurs: 0 };
      zoneMap[z].courses++;
    });
    livreursActifs.forEach(l => {
      const z = l.quartier || 'Inconnu';
      if (!zoneMap[z]) zoneMap[z] = { courses: 0, livreurs: 0 };
      zoneMap[z].livreurs++;
    });

    const zonesCalc = Object.entries(zoneMap).map(([zone, data]) => {
      const ratio = data.livreurs === 0 ? 10 : data.courses / data.livreurs;
      let level = 'normal', multiplier = 1.0;
      if (ratio >= 4 || data.courses >= 5)      { level = 'extreme'; multiplier = 1.8; }
      else if (ratio >= 2 || data.courses >= 3) { level = 'fort';    multiplier = 1.5; }
      else if (ratio >= 1)                       { level = 'eleve';   multiplier = 1.2; }
      return { zone, ...data, ratio: Math.round(ratio * 10) / 10, level, multiplier };
    }).filter(z => z.level !== 'normal').sort((a, b) => b.courses - a.courses);

    setZones(zonesCalc);

    // Revenus surge générés aujourd'hui
    const today = new Date().toDateString();
    const coursesToday = await base44.entities.Course.list('-created_date', 200);
    const surgeRevenu = (coursesToday || [])
      .filter(c => new Date(c.created_date).toDateString() === today && c.surge_amount > 0)
      .reduce((sum, c) => sum + (c.surge_amount || 0), 0);
    setTotalSurgeRevenu(surgeRevenu);
    setLoading(false);
  };

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  if (loading) return null;
  if (zones.length === 0 && totalSurgeRevenu === 0) return null;

  return (
    <Card className="border-orange-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" />
          Surge Pricing actif
          {totalSurgeRevenu > 0 && (
            <span className="ml-auto text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
              +{totalSurgeRevenu.toLocaleString()} F aujourd'hui
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {zones.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">Aucune zone en surge actuellement</p>
        ) : (
          zones.slice(0, 5).map(z => {
            const cfg = LEVEL_CFG[z.level];
            const Icon = cfg.icon;
            return (
              <div key={z.zone} className={`flex items-center justify-between px-3 py-2 rounded-xl border ${cfg.bg}`}>
                <div className="flex items-center gap-2">
                  <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                  <span className={`text-sm font-semibold ${cfg.color}`}>{z.zone}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{z.courses} courses · {z.livreurs} livreurs</span>
                  <span className={`font-extrabold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                    x{z.multiplier}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}