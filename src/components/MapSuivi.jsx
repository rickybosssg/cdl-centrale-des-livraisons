/**
 * MapSuivi — Carte légère pour suivi rapide (dispatcher, admin)
 * Utilise le scooter animé comme TrackingMap mais version compacte
 */
import { MapContainer, TileLayer } from "react-leaflet";
import L from "leaflet";
import ScooterMarker from "./ScooterMarker";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

export default function MapSuivi({ livreurLat, livreurLng, label }) {
  if (!livreurLat || !livreurLng) return null;

  return (
    <div className="h-48 rounded-xl overflow-hidden border-2 border-gray-200">
      <MapContainer
        center={[livreurLat, livreurLng]}
        zoom={15}
        style={{ height: "100%", width: "100%" }}
        attributionControl={false}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="© OpenStreetMap"
        />
        <ScooterMarker
          lat={livreurLat}
          lng={livreurLng}
          label={label || "En route 🛵"}
          followOnUpdate={true}
        />
      </MapContainer>
    </div>
  );
}