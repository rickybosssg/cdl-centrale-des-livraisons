import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, MapPin, Zap } from "lucide-react";

const DRIVER_NAMES = [
  "Abdoul Salam", "Ibrahim Ouédraogo", "Moussa Kaboré",
  "Issouf Traoré", "Ali Sawadogo", "Boureima Compaoré",
  "Seydou Zongo", "Hamidou Sanogo", "Lassané Diallo", "Adama Kinda",
  "Souleymane Bara", "Noufou Kaboré", "Mamadou Traoré", "Yacouba Ouédraogo",
  "Drissa Sawadogo", "Salif Zongo", "Boubacar Compaoré", "Modibo Sanogo",
  "Oumar Diallo", "Poussi Kaboré",
];

// Coordonnées autour de Ouagadougou
function randomGPS() {
  return {
    lat: 12.37 + (Math.random() - 0.5) * 0.15,
    lng: -1.53 + (Math.random() - 0.5) * 0.15,
  };
}

function generateDrivers(n) {
  return Array.from({ length: n }, (_, i) => {
    const gps = randomGPS();
    return {
      id: `fake_driver_${i}`,
      name: DRIVER_NAMES[i % DRIVER_NAMES.length],
      email: `fake_driver_${i}@sandbox.cdl`,
      driver_online: true,
      gps_latitude: gps.lat,
      gps_longitude: gps.lng,
      gps_enabled: true,
      accept_rate: Math.floor(Math.random() * 40 + 60), // 60-100%
      status: ["disponible", "disponible", "disponible", "en_course"][Math.floor(Math.random() * 4)],
    };
  });
}

export default function SandboxFakeDrivers({ onLog }) {
  const [drivers, setDrivers] = useState([]);
  const [count, setCount] = useState(5);

  const spawn = () => {
    const d = generateDrivers(count);
    setDrivers(d);
    onLog(`👥 ${count} faux livreurs simulés (non persistés en BDD)`, "info");
  };

  const simulateAccept = () => {
    if (drivers.length === 0) return;
    const idx = Math.floor(Math.random() * drivers.length);
    setDrivers((prev) =>
      prev.map((d, i) => i === idx ? { ...d, status: "accepte", accepted_course: true } : d)
    );
    onLog(`✅ Livreur "${drivers[idx].name}" a simulé l'acceptation d'une course`, "success");
  };

  const reset = () => {
    setDrivers([]);
    onLog("🔄 Pool de faux livreurs réinitialisé", "info");
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-bold">Pool de faux livreurs (simulation)</p>
          <p className="text-xs text-muted-foreground">Ces livreurs sont simulés en mémoire uniquement — ils ne sont pas créés en BDD.</p>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {[5, 10, 20].map((n) => (
                <Button key={n} size="sm" variant={count === n ? "default" : "outline"}
                  onClick={() => setCount(n)} className="h-8 w-12 text-xs">
                  {n}
                </Button>
              ))}
            </div>
            <Button size="sm" onClick={spawn} className="gap-1 bg-green-600 hover:bg-green-700 text-white">
              <Users className="h-3 w-3" />
              Générer
            </Button>
            {drivers.length > 0 && (
              <>
                <Button size="sm" onClick={simulateAccept} className="gap-1 bg-blue-600 text-white">
                  <Zap className="h-3 w-3" />
                  Sim. Acceptation
                </Button>
                <Button size="sm" variant="outline" onClick={reset}>Reset</Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {drivers.length > 0 && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">Livreurs simulés</p>
              <Badge className="bg-green-100 text-green-700 text-xs">{drivers.length} en ligne</Badge>
            </div>
            <div className="max-h-80 overflow-y-auto space-y-1.5">
              {drivers.map((d) => (
                <div key={d.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full flex-shrink-0 ${d.status === "accepte" ? "bg-green-500" : d.status === "en_course" ? "bg-blue-500" : "bg-green-400"}`} />
                    <div>
                      <p className="text-xs font-semibold">{d.name}</p>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-2.5 w-2.5" />
                        {d.gps_latitude.toFixed(4)}, {d.gps_longitude.toFixed(4)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge className="text-[9px] bg-gray-100 text-gray-600">{d.accept_rate}%</Badge>
                    <Badge className={`text-[9px] ${d.status === "accepte" ? "bg-green-100 text-green-700" : d.status === "en_course" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {d.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}