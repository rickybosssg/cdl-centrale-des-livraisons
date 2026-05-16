/**
 * CDL — Modal Livreurs Dispatchables
 * Affiche le détail de chaque livreur éligible + raisons d'exclusion des autres
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { isDriverEligible, getDriverDispatchReason, scoreDriver } from "@/lib/dispatch";
import { MapPin, Phone, Mail, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

export default function DispatchableDriversModal({ open, onClose }) {
  const [allDrivers, setAllDrivers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    base44.entities.User.filter({ driver_online: true }, '-updated_date', 200)
      .then(users => {
        // Inclure aussi les livreurs récemment en ligne même si driver_online = false pour diagnostic
        setAllDrivers(users);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const dispatchables = allDrivers.filter(d => isDriverEligible(d));
  const nonDispatchables = allDrivers.filter(d => !isDriverEligible(d));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="space-y-4">
          {/* Header */}
          <div>
            <p className="font-bold text-base">🎯 Analyse livreurs dispatchables</p>
            <p className="text-xs text-muted-foreground">
              {loading ? "Chargement..." : `${dispatchables.length} dispatchable(s) · ${nonDispatchables.length} exclu(s)`}
            </p>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          )}

          {/* Livreurs DISPATCHABLES */}
          {!loading && dispatchables.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-green-700 uppercase tracking-wide flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Dispatchables ({dispatchables.length})
              </p>
              {dispatchables.map(d => (
                <DriverCard key={d.id} driver={d} eligible={true} />
              ))}
            </div>
          )}

          {!loading && dispatchables.length === 0 && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-center">
              <XCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
              <p className="text-sm font-bold text-red-700">Aucun livreur dispatchable</p>
              <p className="text-xs text-red-600 mt-1">Vérifiez que des livreurs sont en ligne et validés</p>
            </div>
          )}

          {/* Livreurs EXCLUS */}
          {!loading && nonDispatchables.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-red-700 uppercase tracking-wide flex items-center gap-1.5">
                <XCircle className="h-3.5 w-3.5" /> Exclus du dispatch ({nonDispatchables.length})
              </p>
              {nonDispatchables.map(d => (
                <DriverCard key={d.id} driver={d} eligible={false} reason={getDriverDispatchReason(d)} />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DriverCard({ driver, eligible, reason }) {
  const gpsOk = !!(driver.gps_latitude && driver.gps_longitude);
  const score = scoreDriver(driver, null);

  const eligibilityChecks = [
    { label: "En ligne (driver_online)", ok: driver.driver_online === true, value: String(driver.driver_online) },
    { label: "Disponible", ok: driver.disponible !== false, value: String(driver.disponible ?? true) },
    { label: "Profil validé", ok: !!(driver.profil_valide || driver.statut_validation_livreur === 'valide' || driver.statut_validation_livreur === 'actif'), value: driver.statut_validation_livreur || String(driver.profil_valide) },
    { label: "GPS actif", ok: gpsOk, value: gpsOk ? `${driver.gps_latitude?.toFixed(4)}, ${driver.gps_longitude?.toFixed(4)}` : "Absent" },
    { label: "Non bloqué", ok: !driver.livreur_bloque, value: driver.livreur_bloque ? "BLOQUÉ" : "OK" },
    { label: "Non suspendu", ok: !driver.livreur_suspendu, value: driver.livreur_suspendu ? "SUSPENDU" : "OK" },
    { label: "Courses actives < 2", ok: (driver.nombre_courses_actives || 0) < 2, value: `${driver.nombre_courses_actives || 0}/2` },
  ];

  return (
    <div className={`rounded-xl border-2 p-3 space-y-2 ${eligible ? "border-green-300 bg-green-50" : "border-red-200 bg-red-50/50"}`}>
      {/* Identité */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-sm ${eligible ? "text-green-800" : "text-red-800"}`}>{driver.full_name || "—"}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
            <span className="flex items-center gap-1 text-[10px] text-gray-500">
              <Mail className="h-3 w-3" />{driver.email}
            </span>
            {driver.telephone && (
              <span className="flex items-center gap-1 text-[10px] text-gray-500">
                <Phone className="h-3 w-3" />{driver.telephone}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {eligible ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-600 text-white">✓ Éligible</span>
          ) : (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white">✗ Exclu</span>
          )}
          {eligible && score > 0 && (
            <span className="text-[10px] text-green-700 font-bold">Score {score}</span>
          )}
        </div>
      </div>

      {/* Raison d'exclusion mise en avant */}
      {!eligible && reason && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-red-100 border border-red-200">
          <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
          <p className="text-xs font-bold text-red-700">Raison : {reason}</p>
        </div>
      )}

      {/* Critères détaillés */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {eligibilityChecks.map(({ label, ok, value }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ok ? "bg-green-500" : "bg-red-500"}`} />
            <span className={`text-[10px] ${ok ? "text-gray-600" : "text-red-700 font-bold"}`}>{label}</span>
            <span className="text-[10px] text-gray-400 ml-auto">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}