/**
 * TrackingMap — Carte de suivi premium avec scooter animé
 * - Scooter orienté dans le sens du déplacement
 * - Déplacement interpolé fluide
 * - Points de départ / arrivée clairs
 * - Itinéraire discret
 * - Bulle contextuelle selon statut
 * - Optimisé mobile / APK
 */
import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import { Clock, MapPin, Navigation2 } from "lucide-react";
import L from "leaflet";
import ScooterMarker from "./ScooterMarker";

// Fix icônes Leaflet par défaut
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// ── Icône départ (vert) ────────────────────────────────────────────────────────
const departIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:32px;height:32px;
    background:#22c55e;
    border:3px solid white;
    border-radius:50% 50% 50% 0;
    transform:rotate(-45deg);
    box-shadow:0 2px 8px rgba(34,197,94,0.4);
  "></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -34],
});

// ── Icône arrivée (rouge) ──────────────────────────────────────────────────────
const arriveeIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:32px;height:32px;
    background:#ef4444;
    border:3px solid white;
    border-radius:50% 50% 50% 0;
    transform:rotate(-45deg);
    box-shadow:0 2px 8px rgba(239,68,68,0.4);
  "></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -34],
});

// ── Sous-composant qui ajuste les bounds sans recréer la carte ─────────────────
function BoundsAdjuster({ livreurLat, livreurLng, departLat, departLng, arriveLat, arriveLng }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (!livreurLat || !livreurLng || fitted.current) return;
    const pts = [[livreurLat, livreurLng]];
    if (departLat && departLng) pts.push([departLat, departLng]);
    if (arriveLat && arriveLng) pts.push([arriveLat, arriveLng]);
    if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 16, animate: false });
    } else {
      map.setView([livreurLat, livreurLng], 15, { animate: false });
    }
    fitted.current = true;
  }, [livreurLat, livreurLng, departLat, departLng, arriveLat, arriveLng, map]);

  return null;
}

// ── Libellé bulle selon statut ─────────────────────────────────────────────────
function getScooterLabel(statut, eta) {
  switch (statut) {
    case "acceptee":    return "En route 🛵";
    case "en_cours":    return eta ? `~${eta}` : "En livraison";
    case "livree":      return "Livré ✓";
    default:            return "";
  }
}

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
  const statut = course?.statut || "en_cours";
  const scooterLabel = getScooterLabel(statut, eta);

  // Points itinéraire (départ → arrivée via livreur)
  const routePoints = [];
  if (clientLat && clientLng) routePoints.push([clientLat, clientLng]);
  if (livreurLat && livreurLng) routePoints.push([livreurLat, livreurLng]);
  if (destinationLat && destinationLng) routePoints.push([destinationLat, destinationLng]);

  const hasLivreur = !!(livreurLat && livreurLng);
  const centerLat = livreurLat || clientLat || 12.365;
  const centerLng = livreurLng || clientLng || -1.52;

  return (
    <div className="space-y-3">
      {/* ── Infos haut ── */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
          <div className="flex items-center gap-1.5 text-xs text-blue-700 font-semibold mb-1">
            <Navigation2 className="h-3.5 w-3.5" />
            Livreur
          </div>
          <p className="text-sm font-bold text-blue-900 truncate">{livreurName || "En route"}</p>
        </div>
        <div className="p-3 rounded-xl bg-green-50 border border-green-200">
          <div className="flex items-center gap-1.5 text-xs text-green-700 font-semibold mb-1">
            <Clock className="h-3.5 w-3.5" />
            Arrivée estimée
          </div>
          <p className="text-sm font-bold text-green-900">{eta || "Calcul…"}</p>
        </div>
      </div>

      {/* ── Carte ── */}
      <div
        className="rounded-2xl overflow-hidden border-2 border-gray-200"
        style={{ height: 300 }}
      >
        {!hasLivreur ? (
          <div className="w-full h-full flex items-center justify-center bg-gray-50">
            <div className="text-center space-y-2">
              <div className="text-3xl">🛵</div>
              <p className="text-sm text-muted-foreground">Position GPS en attente…</p>
            </div>
          </div>
        ) : (
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
              livreurLat={livreurLat}
              livreurLng={livreurLng}
              departLat={clientLat}
              departLng={clientLng}
              arriveLat={destinationLat}
              arriveLng={destinationLng}
            />

            {/* Itinéraire discret */}
            {routePoints.length >= 2 && (
              <Polyline
                positions={routePoints}
                color="#1a73e8"
                weight={3}
                opacity={0.4}
                dashArray="8 6"
              />
            )}

            {/* Point de départ */}
            {clientLat && clientLng && (
              <Marker position={[clientLat, clientLng]} icon={departIcon}>
                <Popup>
                  <p className="text-xs font-bold">📦 Récupération</p>
                  <p className="text-xs text-gray-500">{course?.quartier_depart}</p>
                </Popup>
              </Marker>
            )}

            {/* Point d'arrivée */}
            {destinationLat && destinationLng && (
              <Marker position={[destinationLat, destinationLng]} icon={arriveeIcon}>
                <Popup>
                  <p className="text-xs font-bold">🎯 Destination</p>
                  <p className="text-xs text-gray-500">{course?.quartier_arrivee}</p>
                </Popup>
              </Marker>
            )}

            {/* 🛵 Scooter animé */}
            {hasLivreur && (
              <ScooterMarker
                lat={livreurLat}
                lng={livreurLng}
                label={scooterLabel}
                followOnUpdate={false}
              />
            )}
          </MapContainer>
        )}
      </div>

      {/* ── Légende ── */}
      <div className="flex items-center gap-4 px-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-green-500 inline-block" /> Récupération
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-red-500 inline-block" /> Destination
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-blue-600 inline-block" /> Livreur
        </span>
      </div>
    </div>
  );
}