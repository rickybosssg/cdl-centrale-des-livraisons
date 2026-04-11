/**
 * CDL — Widget stats dispatch (taux acceptation par prix, zones lentes, temps moyen)
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { TrendingUp, MapPin, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DispatchStatsWidget() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const compute = async () => {
      const courses = await base44.entities.Course.list("-created_date", 200);

      // Temps moyen de dispatch (en_attente → acceptee)
      const accepted = courses.filter(c => c.date_acceptation && c.created_date);
      const avgDispatch = accepted.length > 0
        ? Math.round(accepted.reduce((sum, c) => {
            return sum + (new Date(c.date_acceptation) - new Date(c.created_date)) / 60000;
          }, 0) / accepted.length)
        : null;

      // Taux d'acceptation par tranche de prix
      const tranches = [
        { label: '< 500', min: 0, max: 499 },
        { label: '500-999', min: 500, max: 999 },
        { label: '1000-1499', min: 1000, max: 1499 },
        { label: '1500-2999', min: 1500, max: 2999 },
        { label: '≥ 3000', min: 3000, max: Infinity },
      ];
      const tauxParPrix = tranches.map(t => {
        const inRange = courses.filter(c => (c.prix || 0) >= t.min && (c.prix || 0) <= t.max);
        const ok = inRange.filter(c => ['acceptee', 'en_cours', 'livree'].includes(c.statut));
        return {
          label: t.label,
          total: inRange.length,
          taux: inRange.length > 0 ? Math.round((ok.length / inRange.length) * 100) : null,
        };
      }).filter(t => t.total > 0);

      // Zones lentes (taux aucun_livreur > 30%)
      const zoneMap = {};
      courses.forEach(c => {
        const z = c.quartier_depart;
        if (!z) return;
        if (!zoneMap[z]) zoneMap[z] = { total: 0, echec: 0 };
        zoneMap[z].total++;
        if (c.statut === 'aucun_livreur' || c.statut === 'annulee') zoneMap[z].echec++;
      });
      const zonesLentes = Object.entries(zoneMap)
        .filter(([, v]) => v.total >= 3 && v.echec / v.total > 0.3)
        .map(([zone, v]) => ({ zone, taux: Math.round((v.echec / v.total) * 100), total: v.total }))
        .sort((a, b) => b.taux - a.taux)
        .slice(0, 5);

      setStats({ avgDispatch, tauxParPrix, zonesLentes });
    };
    compute();
  }, []);

  if (!stats) return null;

  return (
    <div className="space-y-3">
      {/* Temps moyen */}
      {stats.avgDispatch !== null && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 border border-blue-200">
          <Clock className="h-4 w-4 text-blue-600 flex-shrink-0" />
          <div>
            <p className="text-xs text-blue-700 font-semibold">Temps moyen de dispatch</p>
            <p className="text-lg font-bold text-blue-800">{stats.avgDispatch} min</p>
          </div>
        </div>
      )}

      {/* Taux par prix */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-600" />
            Taux d'acceptation par prix
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {stats.tauxParPrix.map(t => (
            <div key={t.label} className="flex items-center gap-3">
              <span className="text-xs w-20 flex-shrink-0 text-muted-foreground">{t.label} F</span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${t.taux >= 70 ? 'bg-green-500' : t.taux >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${t.taux || 0}%` }}
                />
              </div>
              <span className={`text-xs font-bold w-10 text-right ${t.taux >= 70 ? 'text-green-600' : t.taux >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                {t.taux !== null ? `${t.taux}%` : '—'}
              </span>
              <span className="text-[10px] text-muted-foreground w-12 text-right">{t.total} crse</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Zones lentes */}
      {stats.zonesLentes.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MapPin className="h-4 w-4 text-orange-600" />
              ⚠️ Zones à problèmes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.zonesLentes.map(z => (
              <div key={z.zone} className="flex items-center justify-between">
                <span className="text-xs font-medium">{z.zone}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{z.total} courses</span>
                  <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                    {z.taux}% échec
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}