import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, RefreshCw } from "lucide-react";
import moment from "moment";

const QUARTIERS = [
  "Koulouba", "Zogona", "Pissy", "Gounghin", "Nonsin", "Hamdalaye",
  "Patte d'Oie", "Dapoya", "Bilbalogho", "Paspanga", "Tampouy",
  "Tanghin", "Wemtenga", "Ouaga 2000", "Zone du Bois",
];
const COLIS = ["Documents", "Petit colis", "Colis moyen", "Gros colis", "Nourriture", "Autre"];

const STATUT_COLORS = {
  en_attente: "bg-amber-100 text-amber-700",
  assignee_attente: "bg-blue-100 text-blue-700",
  acceptee: "bg-green-100 text-green-700",
  en_cours: "bg-primary/10 text-primary",
  livree: "bg-green-200 text-green-800",
  annulee: "bg-red-100 text-red-700",
  aucun_livreur: "bg-red-200 text-red-800",
};

function randomDep() { return QUARTIERS[Math.floor(Math.random() * QUARTIERS.length)]; }
function randomArr(dep) {
  let a; do { a = QUARTIERS[Math.floor(Math.random() * QUARTIERS.length)]; } while (a === dep);
  return a;
}

async function createOne() {
  const dep = randomDep();
  const arr = randomArr(dep);
  const prix = Math.round((Math.random() * 2500 + 500) / 100) * 100;
  return base44.entities.Course.create({
    quartier_depart: dep,
    quartier_arrivee: arr,
    telephone_expediteur: "+22600000000",
    telephone_destinataire: "+22600000001",
    type_colis: COLIS[Math.floor(Math.random() * COLIS.length)],
    statut: "en_attente",
    client_email: "sandbox@cdl-test.local",
    client_name: "Client Test CDL",
    prix,
    commission_cdl: Math.round(prix * 0.2),
    gain_livreur: Math.round(prix * 0.8),
    mode_assignation: "auto",
    description: "[SANDBOX_TEST]",
  });
}

export default function SandboxCourseGenerator({ onLog, onReload, sandboxCourses }) {
  const [loading, setLoading] = useState(false);
  const [courses, setCourses] = useState([]);
  const [fetching, setFetching] = useState(false);

  const fetchCourses = async () => {
    setFetching(true);
    try {
      const data = await base44.entities.Course.filter({ client_email: "sandbox@cdl-test.local" }, "-created_date", 30);
      setCourses(Array.isArray(data) ? data : []);
    } catch (_) {}
    setFetching(false);
  };

  useEffect(() => { fetchCourses(); }, []);

  const generate = async (n) => {
    setLoading(true);
    onLog(`📦 Génération de ${n} course(s)...`, "info");
    try {
      const results = await Promise.allSettled(Array.from({ length: n }, createOne));
      const ok = results.filter((r) => r.status === "fulfilled").length;
      onLog(`✅ ${ok}/${n} course(s) créées`, "success");
      fetchCourses();
      onReload();
    } catch (e) {
      onLog("❌ Erreur génération: " + e.message, "error");
    }
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-bold">Générer des courses aléatoires</p>
          <div className="flex gap-2 flex-wrap">
            {[1, 3, 5, 10].map((n) => (
              <Button key={n} size="sm" disabled={loading} onClick={() => generate(n)}
                className="gap-1 bg-violet-600 hover:bg-violet-700 text-white">
                <Plus className="h-3 w-3" />
                {n === 1 ? "1 course" : `${n} courses`}
              </Button>
            ))}
            <Button size="sm" variant="outline" onClick={fetchCourses} disabled={fetching} className="ml-auto gap-1">
              <RefreshCw className={`h-3 w-3 ${fetching ? "animate-spin" : ""}`} />
              Rafraîchir
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">Courses sandbox</p>
            <Badge className="bg-violet-100 text-violet-700 text-xs">{courses.length} courses</Badge>
          </div>
          <div className="max-h-72 overflow-y-auto space-y-1.5">
            {courses.length === 0 && (
              <p className="text-xs text-center text-muted-foreground py-6">Aucune course sandbox. Générez-en ci-dessus.</p>
            )}
            {courses.map((c) => (
              <div key={c.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{c.quartier_depart} → {c.quartier_arrivee}</p>
                  <p className="text-[10px] text-muted-foreground">{moment(c.created_date).fromNow()} · {(c.prix || 0).toLocaleString()} F</p>
                </div>
                <Badge className={`text-[9px] ml-2 flex-shrink-0 ${STATUT_COLORS[c.statut] || "bg-gray-100 text-gray-600"}`}>
                  {c.statut}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}