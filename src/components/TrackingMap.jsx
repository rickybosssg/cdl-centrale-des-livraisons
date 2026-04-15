/**
 * TrackingMap — Carte plein écran style Uber
 * - Grande carte principale, pas de chrome superflu
 * - Scooter animé orienté avec BoundsAdjuster intelligent
 * - Itinéraire ligne continue élégante
 * - Points départ/arrivée avec icônes épurées
 * - Optimisé mobile / APK
 */
import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import ScooterMarker from "./ScooterMarker";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ── Pin départ (vert, style épuré) ─────────────────────────────────────────
const departIcon = L.divIcon({
  className: "",
  html: `<div style="
    position:relative;width:36px;height:36px;
    display:flex;align-items:center;justify-content:center;
  ">
    <div style="
      width:36px;height:36px;
      background:#16a34a;
      border:3px solid white;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 3px 10px rgba(22,163,74,0.45);
    "></div>
    <div style="
      position:absolute;
      width:10px;height:10px;
      background:white;
      border-radius:50%;
      top:9px;left:9px;
    "></div>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 36],
});

// ── Pin arrivée (rouge, style épuré) ───────────────────────────────────────
const arriveeIcon = L.divIcon({
  className: "",
  html: `<div style="
    position:relative;width:36px;height:36px;
    display:flex;align-items:center;justify-content:center;
  ">
    <div style="
      width:36px;height:36px;
      background:#dc2626;
      border:3px solid white;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 3px 10px rgba(220,38,38,0.45);
    "></div>
    <div style="
      position:absolute;
      width:10px;height:10px;
      background:white;
      border-radius:50%;
      top:9px;left:9px;
    "></div>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 36],
});

// ── Ajuste bounds une seule fois, puis suit le scooter discrètement ────────
function BoundsAdjuster({ livreurLat, livreurLng, departLat, departLng, arriveLat, arriveLng }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (!livreurLat || !livreurLng) return;
    if (fitted.current) return;
    const pts = [[livreurLat, livreurLng]];
    if (departLat && departLng) pts.push([departLat, departLng]);
    if (arriveLat && arriveLng) pts.push([arriveLat, arriveLng]);
    if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 16, animate: false });
    } else {
      map.setView([livreurLat, livreurLng], 15, { animate: false });
    }
    fitted.current = true;
  }, [livreurLat, livreurLng, departLat, departLng, arriveLat, arriveLng, map]);

  return null;
}

function getScooterLabel(statut, eta) {
  switch (statut) {
    case "acceptee":  return "En route";
    case "en_cours":  return eta ? `~${eta}` : "En livraison";
    case "livree":    return "Livré ✓";
    default:          return "";
  }
}

export default function TrackingMap({
  livreurLat, livreurLng,
  clientLat, clientLng,
  destinationLat, destinationLng,
  livreurName, eta, course,
  height = 340,
}) {
  const statut = course?.statut || "en_cours";
  const scooterLabel = getScooterLabel(statut, eta);
  const hasLivreur = !!(livreurLat && livreurLng);
  const centerLat = livreurLat || clientLat || 12.365;
  const centerLng = livreurLng || clientLng || -1.52;

  // Ligne itinéraire : départ → scooter → arrivée
  const routePoints = [];
  if (clientLat && clientLng) routePoints.push([clientLat, clientLng]);
  if (livreurLat && livreurLng) routePoints.push([livreurLat, livreurLng]);
  if (destinationLat && destinationLng) routePoints.push([destinationLat, destinationLng]);

  if (!hasLivreur) {
    return (
      <div
        className="w-full rounded-2xl overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center"
        style={{ height }}
      >
        <div className="text-center space-y-3">
          <div className="text-4xl animate-pulse">🛵</div>
          <p className="text-sm font-medium text-gray-500">Position GPS en attente…</p>
          <p className="text-xs text-gray-400">Le livreur partage sa position</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full rounded-2xl overflow-hidden border border-gray-200 shadow-sm" style={{ height }}>
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={14}
        style={{ height: "100%", width: "100%" }}
        attributionControl={false}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="© OpenStreetMap"
        />

        <BoundsAdjuster
          livreurLat={livreurLat} livreurLng={livreurLng}
          departLat={clientLat} departLng={clientLng}
          arriveLat={destinationLat} arriveLng={destinationLng}
        />

        {/* Itinéraire — ligne continue, légère */}
        {routePoints.length >= 2 && (
          <Polyline
            positions={routePoints}
            color="#1a73e8"
            weight={4}
            opacity={0.55}
            dashArray="10 6"
          />
        )}

        {/* Point départ */}
        {clientLat && clientLng && (
          <Marker position={[clientLat, clientLng]} icon={departIcon} />
        )}

        {/* Point arrivée */}
        {destinationLat && destinationLng && (
          <Marker position={[destinationLat, destinationLng]} icon={arriveeIcon} />
        )}

        {/* 🛵 Scooter animé */}
        <ScooterMarker
          lat={livreurLat}
          lng={livreurLng}
          label={scooterLabel}
          followOnUpdate={false}
        />
      </MapContainer>
    </div>
  );
}