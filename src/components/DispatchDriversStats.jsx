/**
 * CDL — Compteurs livreurs dispatchables (dashboard admin)
 * Affiche 3 niveaux distincts :
 *   1. En ligne (driver_online=true)
 *   2. Avec GPS valide
 *   3. Réellement dispatchables (tous critères)
 * Et liste les raisons pour ceux en ligne mais non dispatchables.
 */
import { useState, useEffect } from "react";
import { getDriversDispatchStats, isDriverDispatchable, getDriverDispatchReason } from "@/lib/dispatch";
import { Users, MapPin, Zap, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DispatchDriversStats() {
  const [stats, setStats] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDriversDispatchStats().then(s => {
      setStats(s);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
      <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      Analyse livreurs...
    </div>
  );

  if (!stats) return null;

  const { enLigne, avecGPS, dispatchables, nonDispatchables } = stats;
  const ecartVisible = enLigne > dispatchables;

  return (
    <Card className={ecartVisible ? "border-amber-300" : "border-border"}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Livreurs — Vue détaillée dispatch
          {ecartVisible && (
            <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium ml-auto">
              ⚠️ Écart détecté
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 3 compteurs */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2.5 rounded-xl bg-blue-50 border border-blue-200">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Users className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <p className="text-xl font-bold text-blue-700">{enLigne}</p>
            <p className="text-[10px] text-blue-600 font-medium">En ligne</p>
            <p className="text-[9px] text-blue-500">tous profils confondus</p>
          </div>
          <div className="text-center p-2.5 rounded-xl bg-cyan-50 border border-cyan-200">
            <div className="flex items-center justify-center gap-1 mb-1">
              <MapPin className="h-3.5 w-3.5 text-cyan-600" />
            </div>
            <p className="text-xl font-bold text-cyan-700">{avecGPS}</p>
            <p className="text-[10px] text-cyan-600 font-medium">Avec GPS</p>
            <p className="text-[9px] text-cyan-500">lat+lng valides</p>
          </div>
          <div className={`text-center p-2.5 rounded-xl border ${dispatchables > 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-center justify-center gap-1 mb-1">
              <Zap className={`h-3.5 w-3.5 ${dispatchables > 0 ? 'text-green-600' : 'text-red-500'}`} />
            </div>
            <p className={`text-xl font-bold ${dispatchables > 0 ? 'text-green-700' : 'text-red-600'}`}>{dispatchables}</p>
            <p className={`text-[10px] font-medium ${dispatchables > 0 ? 'text-green-600' : 'text-red-600'}`}>Dispatchables</p>
            <p className={`text-[9px] ${dispatchables > 0 ? 'text-green-500' : 'text-red-500'}`}>profil+online+dispo</p>
          </div>
        </div>

        {/* Alerte si écart */}
        {ecartVisible && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800">
              <p className="font-semibold">{enLigne} livreurs en ligne, mais seulement {dispatchables} dispatchables</p>
              <p className="text-amber-700">{enLigne - dispatchables} livreur(s) exclu(s) — voir détails ci-dessous</p>
            </div>
          </div>
        )}

        {/* Détail livreurs non dispatchables */}
        {nonDispatchables.length > 0 && (
          <div>
            <button
              onClick={() => setShowDetail(v => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {showDetail ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showDetail ? 'Masquer' : 'Voir'} les {nonDispatchables.length} livreur(s) en ligne non dispatchables
            </button>
            {showDetail && (
              <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
                {nonDispatchables.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border">
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{d.nom || d.email}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{d.email}</p>
                    </div>
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                      {d.raison}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {dispatchables === 0 && enLigne === 0 && (
          <p className="text-xs text-center text-muted-foreground py-2">Aucun livreur connecté</p>
        )}
      </CardContent>
    </Card>
  );
}