import { useState, useEffect } from "react";
import { MapPin, Navigation, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export default function GpsLocationManager({ onLocationUpdate }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    // Vérifier si localisation déjà activée
    if ("geolocation" in navigator) {
      navigator.permissions?.query({ name: "geolocation" }).then((result) => {
        setIsActive(result.state === "granted");
      });
    }
  }, []);

  const requestLocationPermission = async () => {
    setError("");
    setLoading(true);

    if (!("geolocation" in navigator)) {
      setError("Localisation non disponible sur cet appareil");
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const timestamp = new Date().toISOString();

        // Récupérer le quartier via reverse geocoding simple (API libre)
        let quartier = null;
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          );
          const data = await response.json();
          quartier =
            data?.address?.suburb ||
            data?.address?.quarter ||
            data?.address?.village ||
            data?.address?.town ||
            null;
        } catch (_) {}

        // Sauvegarder dans le profil utilisateur
        const locationData = {
          gps_latitude: latitude,
          gps_longitude: longitude,
          gps_accuracy: accuracy,
          gps_timestamp: timestamp,
          gps_quartier: quartier,
        };

        if (onLocationUpdate) {
          onLocationUpdate(locationData);
        }

        setIsActive(true);
        toast.success("✅ Localisation activée avec succès");
        setLoading(false);
      },
      (err) => {
        setError(`Erreur: ${err.message}`);
        toast.error("❌ Permission de localisation refusée");
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return (
    <Card className={isActive ? "border-green-300 bg-green-50" : ""}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div
              className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                isActive ? "bg-green-200" : "bg-primary/10"
              }`}
            >
              <Navigation
                className={`h-5 w-5 ${isActive ? "text-green-700" : "text-primary"}`}
              />
            </div>
            <div>
              <p className="font-semibold text-sm">
                📍 Ma localisation GPS
              </p>
              <p className="text-xs text-muted-foreground">
                {isActive
                  ? "Localisation activée - CDL utilisera votre position réelle"
                  : "Activez votre localisation pour un dispatch plus rapide"}
              </p>
            </div>
          </div>
          <Button
            onClick={requestLocationPermission}
            disabled={loading || isActive}
            size="sm"
            className={isActive ? "bg-green-600 hover:bg-green-700" : ""}
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : isActive ? (
              <>
                <MapPin className="h-3.5 w-3.5 mr-1" /> Activée
              </>
            ) : (
              <>
                <Navigation className="h-3.5 w-3.5 mr-1" /> Activer
              </>
            )}
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          💡 Votre position est utilisée uniquement pour le dispatch. Elle n'est
          jamais partagée publiquement.
        </p>
      </CardContent>
    </Card>
  );
}