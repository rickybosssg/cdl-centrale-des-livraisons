import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const livreurIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

const departIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

const arriveeIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

// Ouagadougou center
const CENTER = [12.3714, -1.5197];

export default function MapLivreursActifs({ livreurs = [], courses = [], height = "300px" }) {
  const livreursAvecGPS = livreurs.filter(l => l.gps_latitude && l.gps_longitude && l.disponible);
  const coursesEnCours = courses.filter(c =>
    ["acceptee", "en_cours"].includes(c.statut) && c.livreur_lat && c.livreur_lng
  );

  return (
    <div style={{ height, width: "100%", borderRadius: "12px", overflow: "hidden" }}>
      <MapContainer
        center={CENTER}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Livreurs disponibles */}
        {livreursAvecGPS.map((livreur) => (
          <Marker
            key={livreur.id}
            position={[livreur.gps_latitude, livreur.gps_longitude]}
            icon={livreurIcon}
          >
            <Popup>
              <div className="text-xs">
                <p className="font-bold">🛵 {livreur.full_name}</p>
                <p className="text-muted-foreground">{livreur.quartier}</p>
                {livreur.note_moyenne > 0 && (
                  <p>⭐ {livreur.note_moyenne?.toFixed(1)}/5</p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Courses en cours - trajet */}
        {coursesEnCours.map((course) => (
          <div key={course.id}>
            <Marker
              position={[course.livreur_lat, course.livreur_lng]}
              icon={livreurIcon}
            >
              <Popup>
                <div className="text-xs">
                  <p className="font-bold">🚚 En cours</p>
                  <p>{course.quartier_depart} → {course.quartier_arrivee}</p>
                  <p className="text-muted-foreground">{course.livreur_name}</p>
                </div>
              </Popup>
            </Marker>
          </div>
        ))}
      </MapContainer>
    </div>
  );
}