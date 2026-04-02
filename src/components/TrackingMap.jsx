import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import { Icon } from "leaflet";
import { MapPin, Navigation, Clock } from "lucide-react";
import L from "leaflet";

// Icons personnalisées
const livreurIcon = new Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/3149/3149159.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [38, 38],
  shadowSize: [41, 41],
  iconAnchor: [19, 38],
  shadowAnchor: [12, 41],
  popupAnchor: [0, -30],
});

const clientIcon = new Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/747/747376.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [38, 38],
  shadowSize: [41, 41],
  iconAnchor: [19, 38],
  shadowAnchor: [12, 41],
  popupAnchor: [0, -30],
});

const destinationIcon = new Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/3597/3597084.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [40, 40],
  shadowSize: [41, 41],
  iconAnchor: [20, 40],
  shadowAnchor: [12, 41],
  popupAnchor: [0, -30],
});

export default function TrackingMap({
  livreurLat,
  livreurLng,
  clientLat,
  clientLng,
  destinationLat,
  destinationLng,
  livreurName,
  eta,
  course,
}) {
  const mapRef = useRef(null);
  const [mapInitialized, setMapInitialized] = useState(false);

  // Centrer la carte automatiquement
  useEffect(() => {
    if (!mapRef.current || !livreurLat) return;
    
    const bounds = L.latLngBounds([
      [livreurLat, livreurLng],
      [clientLat || livreurLat, clientLng || livreurLng],
      [destinationLat || livreurLat, destinationLng || livreurLng],
    ]);

    mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }, [livreurLat, livreurLng, clientLat, clientLng, destinationLat, destinationLng]);

  // Itinéraire
  const routePoints = [];
  if (clientLat && clientLng) routePoints.push([clientLat, clientLng]);
  if (livreurLat && livreurLng) routePoints.push([livreurLat, livreurLng]);
  if (destinationLat && destinationLng) routePoints.push([destinationLat, destinationLng]);

  return (
    <div className="space-y-3">
      {/* Infos haut */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
          <div className="flex items-center gap-1 text-xs text-blue-700 font-medium">
            <Navigation className="h-3.5 w-3.5" />
            Livreur en route
          </div>
          <p className="text-sm font-bold text-blue-900">{livreurName || "Livreur"}</p>
        </div>
        <div className="p-3 rounded-lg bg-green-50 border border-green-200">
          <div className="flex items-center gap-1 text-xs text-green-700 font-medium">
            <Clock className="h-3.5 w-3.5" />
            Arrivée estimée
          </div>
          <p className="text-sm font-bold text-green-900">{eta || "Calcul..."}</p>
        </div>
      </div>

      {/* Carte */}
      <div className="rounded-lg overflow-hidden border-2 border-gray-200 h-80 bg-gray-100">
        <MapContainer
          ref={mapRef}
          center={[livreurLat || 12.365, livreurLng || -1.52]}
          zoom={13}
          style={{ height: "100%" }}
          attributionControl={true}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          {/* Itinéraire */}
          {routePoints.length > 1 && (
            <Polyline
              positions={routePoints}
              color="blue"
              weight={3}
              opacity={0.7}
              dashArray="5, 5"
            />
          )}

          {/* Position client */}
          {clientLat && clientLng && (
            <Marker position={[clientLat, clientLng]} icon={clientIcon}>
              <Popup>
                <div className="text-xs">
                  <p className="font-bold">📍 Votre position</p>
                  <p className="text-gray-600">{course?.quartier_depart}</p>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Position livreur */}
          {livreurLat && livreurLng && (
            <Marker position={[livreurLat, livreurLng]} icon={livreurIcon}>
              <Popup>
                <div className="text-xs">
                  <p className="font-bold">🛵 {livreurName}</p>
                  <p className="text-gray-600">En livraison</p>
                  <p className="text-gray-500 mt-1">
                    {livreurLat.toFixed(4)}, {livreurLng.toFixed(4)}
                  </p>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Position destination */}
          {destinationLat && destinationLng && (
            <Marker position={[destinationLat, destinationLng]} icon={destinationIcon}>
              <Popup>
                <div className="text-xs">
                  <p className="font-bold">📦 Destination</p>
                  <p className="text-gray-600">{course?.quartier_arrivee}</p>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      {/* Distance et détails */}
      {livreurLat && destinationLat && (
        <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Distance estimée:</span> ~{
              (Math.sqrt(
                Math.pow(destinationLat - livreurLat, 2) +
                Math.pow(destinationLng - livreurLng, 2)
              ) * 111).toFixed(1)
            } km
          </p>
        </div>
      )}
    </div>
  );
}