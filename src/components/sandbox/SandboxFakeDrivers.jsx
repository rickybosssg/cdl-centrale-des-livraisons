import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Play, Square, RefreshCw, MapPin, Wifi, WifiOff, Loader } from "lucide-react";

// Quartiers Ouagadougou avec coords GPS approximatives
const QUARTIERS_GPS = [
  { name: "Koulouba", lat: 12.3700, lng: -1.5250 },
  { name: "Zogona", lat: 12.3780, lng: -1.5100 },
  { name: "Pissy", lat: 12.3500, lng: -1.5500 },
  { name: "Gounghin", lat: 12.3650, lng: -1.5350 },
  { name: "Nonsin", lat: 12.3820, lng: -1.5200 },
  { name: "Hamdalaye", lat: 12.3560, lng: -1.5180 },
  { name: "Patte d'Oie", lat: 12.3690, lng: -1.5400 },
  { name: "Dapoya", lat: 12.3720, lng: -1.5280 },
  { name: "Bilbalogho", lat: 12.3800, lng: -1.5050 },
  { name: "Paspanga", lat: 12.3580, lng: -1.5320 },
  { name: "Tampouy", lat: 12.3850, lng: -1.5150 },
  { name: "Tanghin", lat: 12.3610, lng: -1.5450 },
  { name: "Wemtenga", lat: 12.3750, lng: -1.4980 },
  { name: "Ouaga 2000", lat: 12.3380, lng: -1.5550 },
  { name: "Zone du Bois", lat: 12.3660, lng: -1.5260 },
];

const DRIVER_NAMES = [
  "Ouédraogo K.", "Traoré B.", "Sawadogo I.", "Compaoré A.", "Tapsoba R.",
  "Kaboré L.", "Nana M.", "Zongo D.", "Yélemou S.", "Belem F.",
  "Ouattara C.", "Koné A.", "Ilboudo T.", "Somda P.", "Yago N.",
  "Bonkoungou E.", "Siri W.", "Diallo H.", "Bagré O.", "Yanogo M.",
];

function makeDriver(i) {
  const zone = QUARTIERS_GPS[i % QUARTIERS_GPS.length];
  return {
    id: `fake_driver_${i}`,
    name: DRIVER_NAMES[i % DRIVER_NAMES.length],
    lat: zone.lat + (Math.random() - 0.5) * 0.02,
    lng: zone.lng + (Math.random() - 0.5) * 0.02,
    zone: zone.name,
    status: Math.random() > 0.3 ? "online" : Math.random() > 0.5 ? "busy" : "offline",
    acceptRate: Math.round(Math.random() * 60 + 40), // 40-100%
    ping: Math.round(Math.random() * 200 + 50), // ms
    courses_acceptees: Math.floor(Math.random() * 50),
  };
}

const STATUS_CONFIG = {
  online: { label: "En ligne", color: "bg-green-100 text-green-700", dot: "bg-green-500" },
  busy: { label: "Occupé", color: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  offline: { label: "Hors ligne", color: "bg-gray-100 text-gray-500", dot: "bg-gray-400" },
};

export default function SandboxFakeDrivers({ onLog }) {
  const [driverCount, setDriverCount] = useState(8);
  const [drivers, setDrivers] = useState([]);
  const [simRunning, setSimRunning] = useState(false);
  const [acceptRate, setAcceptRate] = useState([70]);
  const intervalRef = useRef(null);

  const generateDrivers = (count) => {
    const d = Array.from({ length: count }, (_, i) => makeDriver(i));
    setDrivers(d);
    onLog(`🛵 ${count} faux livreurs générés (simulation locale — pas en BDD)`, "info");
  };

  useEffect(() => {
    generateDrivers(driverCount);
    return () => clearInterval(intervalRef.current);
  }, []);

  const startSim = () => {
    setSimRunning(true);
    onLog("▶️ Simulation livreurs démarrée (mise à jour toutes les 3s)", "info");
    intervalRef.current = setInterval(() => {
      setDrivers((prev) =>
        prev.map((d) => {
          const roll = Math.random();
          let newStatus = d.status;
          if (roll < 0.1) newStatus = "offline";
          else if (roll < 0.25) newStatus = "busy";
          else newStatus = "online";
          return {
            ...d,
            lat: d.lat + (Math.random() - 0.5) * 0.001,
            lng: d.lng + (Math.random() - 0.5) * 0.001,
            status: newStatus,
            ping: Math.round(Math.random() * 250 + 30),
          };
        })
      );
    }, 3000);
  };

  const stopSim = () => {
    clearInterval(intervalRef.current);
    setSimRunning(false);
    onLog("⏹️ Simulation livreurs arrêtée", "warn");
  };

  const simulateAccept = () => {
    const rate = acceptRate[0];
    const eligible = drivers.filter((d) => d.status === "online");
    let accepted = 0;
    setDrivers((prev) =>
      prev.map((d) => {
        if (d.status !== "online") return d;
        const willAccept = Math.random() * 100 < rate;
        if (willAccept) {
          accepted++;
          return { ...d, status: "busy" };
        }
        return d;
      })
    );
    onLog(
      `🎯 Simulation acceptation: ${accepted}/${eligible.length} livreurs ont accepté (taux configuré: ${rate}%)`,
      accepted > 0 ? "success" : "warn"
    );
  };

  const online = drivers.filter((d) => d.status === "online").length;
  const busy = drivers.filter((d) => d.status === "busy").length;
  const offline = drivers.filter((d) => d.status === "offline").length;

  return (
    <div className="space-y-3">
      {/* Controls */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <p className="text-sm font-bold">Simulation livreurs virtuels</p>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Nombre de livreurs</span>
              <Badge className="text-xs">{driverCount}</Badge>
            </div>
            <Slider
              min={5}
              max={20}
              step={1}
              value={[driverCount]}
              onValueChange={([v]) => setDriverCount(v)}
              className="mb-2"
            />
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs h-8"
              onClick={() => generateDrivers(driverCount)}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Régénérer {driverCount} livreurs
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 h-9 bg-green-600 text-white gap-1 text-xs"
              onClick={startSim}
              disabled={simRunning}
            >
              <Play className="h-3 w-3" />
              Démarrer sim
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-9 border-red-300 text-red-600 gap-1 text-xs"
              onClick={stopSim}
              disabled={!simRunning}
            >
              <Square className="h-3 w-3" />
              Arrêter
            </Button>
          </div>

          {simRunning && (
            <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 p-2 rounded-lg">
              <Loader className="h-3 w-3 animate-spin" />
              Simulation active — positions mises à jour toutes les 3s
            </div>
          )}
        </CardContent>
      </Card>

      {/* Acceptation simulée */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-bold">Simuler acceptation course</p>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Taux d'acceptation</span>
              <Badge className={`text-xs ${acceptRate[0] >= 70 ? "bg-green-100 text-green-700" : acceptRate[0] >= 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                {acceptRate[0]}%
              </Badge>
            </div>
            <Slider min={0} max={100} step={5} value={acceptRate} onValueChange={setAcceptRate} />
          </div>
          <Button
            className="w-full h-9 bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs font-bold"
            onClick={simulateAccept}
          >
            🎯 Simuler acceptation par les livreurs en ligne
          </Button>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "En ligne", val: online, color: "border-green-400 bg-green-50 text-green-700" },
          { label: "Occupés", val: busy, color: "border-amber-400 bg-amber-50 text-amber-700" },
          { label: "Hors ligne", val: offline, color: "border-gray-300 bg-gray-50 text-gray-500" },
        ].map((s) => (
          <Card key={s.label} className={`border-2 ${s.color}`}>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-black">{s.val}</p>
              <p className="text-[10px] mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Liste livreurs */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
          {drivers.length} livreurs virtuels (simulation locale)
        </p>
        {drivers.map((d) => {
          const sc = STATUS_CONFIG[d.status];
          return (
            <Card key={d.id} className="border border-violet-100">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${sc.dot} ${d.status === "online" ? "animate-pulse" : ""}`} />
                    <span className="text-xs font-bold">{d.name}</span>
                  </div>
                  <Badge className={`text-[10px] ${sc.color}`}>{sc.label}</Badge>
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{d.zone}</span>
                  <span>Acc: {d.acceptRate}%</span>
                  <span className="flex items-center gap-1">
                    {d.ping < 100 ? <Wifi className="h-3 w-3 text-green-500" /> : <WifiOff className="h-3 w-3 text-red-400" />}
                    {d.ping}ms
                  </span>
                  <span>📦 {d.courses_acceptees}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}