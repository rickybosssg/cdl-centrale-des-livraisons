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

const scooterIcon = new L.Icon({
  iconUrl: "https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a3038b25e_generated_image.png",
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20],
  className: "scooter-marker",
});



// Ouagadougou center
const CENTER = [12.3714, -1.5197];

export default function MapLivreursActifs({ livreurs = [], courses = [], height = "300px" }) {
  const livreursAvecGPS = livreurs.filter(l => l.gps_latitude && l.gps_longitude && l.disponible);
  const coursesEnCours = courses.filter(c =>
    ["acceptee", "en_cours"].includes(c.statut) && c.livreur_lat && c.livreur_lng
  );

  // Créer icône scooter avec rotation basée sur la direction
  const createRotatedScooterIcon = (heading = 0) => {
    const svgString = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
        <style>
          .scooter { transform: rotate(${heading}deg); transform-origin: center; }
        </style>
        <g class="scooter">
          <image href="https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a3038b25e_generated_image.png" x="0" y="0" width="40" height="40" />
        </g>
      </svg>
    `;
    const encoded = btoa(svgString);
    return `data:image/svg+xml;base64,${encoded}`;
  };

  const createScooterIconWithRotation = (heading = 0) => new L.Icon({
    iconUrl: createRotatedScooterIcon(heading),
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });

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

        {/* Livreurs disponibles avec icône scooter */}
        {livreursAvecGPS.map((livreur) => {
          const heading = livreur.heading || 0;
          const icon = createScooterIconWithRotation(heading);
          return (
            <Marker
              key={livreur.id}
              position={[livreur.gps_latitude, livreur.gps_longitude]}
              icon={icon}
            >
              <Popup>
                <div className="text-xs space-y-0.5">
                  <p className="font-bold">🛵 {livreur.full_name}</p>
                  <p className="text-muted-foreground">{livreur.quartier}</p>
                  <p className="text-green-600 font-medium">🟢 En ligne</p>
                  {livreur.note_moyenne > 0 && (
                    <p>⭐ {livreur.note_moyenne?.toFixed(1)}/5</p>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Courses en cours avec icône scooter */}
        {coursesEnCours.map((course) => {
          const heading = course.heading || 0;
          const icon = createScooterIconWithRotation(heading);
          return (
            <Marker
              key={course.id}
              position={[course.livreur_lat, course.livreur_lng]}
              icon={icon}
            >
              <Popup>
                <div className="text-xs space-y-0.5">
                  <p className="font-bold">🚚 En livraison</p>
                  <p className="text-muted-foreground">{course.quartier_depart} → {course.quartier_arrivee}</p>
                  <p className="font-medium">{course.livreur_name}</p>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}