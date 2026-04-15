/**
 * ScooterMarker — Marqueur scooter animé pour Leaflet
 * - Déplacement interpolé (pas de saut brutal)
 * - Orientation automatique selon le cap de déplacement
 * - Bulle contextuelle selon l'état de la course
 * - Optimisé mobile/APK
 */
import { useEffect, useRef, useCallback } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

// Calcule le bearing (cap) entre deux points GPS en degrés
function calcBearing(lat1, lng1, lat2, lng2) {
  const toRad = d => (d * Math.PI) / 180;
  const toDeg = r => (r * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Distance entre deux points en mètres (Haversine simplifié)
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Génère le HTML de l'icône scooter SVG avec rotation
function makeScooterIcon(bearing = 0, label = "") {
  const labelHtml = label
    ? `<div style="
        position:absolute;
        top:-34px;
        left:50%;
        transform:translateX(-50%);
        background:white;
        color:#1a73e8;
        font-size:11px;
        font-weight:700;
        padding:3px 8px;
        border-radius:20px;
        white-space:nowrap;
        box-shadow:0 2px 8px rgba(0,0,0,0.18);
        border:1.5px solid #e0eaff;
        font-family:Inter,sans-serif;
        pointer-events:none;
      ">${label}</div>`
    : "";

  return L.divIcon({
    className: "",
    html: `
      <div style="
        position:relative;
        display:flex;
        align-items:center;
        justify-content:center;
        width:46px;
        height:46px;
      ">
        ${labelHtml}
        <div style="
          background:#1a73e8;
          border-radius:50%;
          width:46px;
          height:46px;
          display:flex;
          align-items:center;
          justify-content:center;
          box-shadow:0 3px 12px rgba(26,115,232,0.45);
          border:3px solid white;
          transform:rotate(${bearing}deg);
          transition:transform 0.6s ease;
        ">
          <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 64 64" fill="white">
            <!-- Corps scooter simplifié, moderne -->
            <ellipse cx="20" cy="44" rx="9" ry="9" fill="none" stroke="white" stroke-width="4"/>
            <ellipse cx="44" cy="44" rx="9" ry="9" fill="none" stroke="white" stroke-width="4"/>
            <path d="M29 44 H38" stroke="white" stroke-width="3.5" stroke-linecap="round"/>
            <path d="M20 36 L28 20 L42 20 L44 36" fill="white" opacity="0.9"/>
            <path d="M28 20 L30 14 L38 14 L42 20" fill="white"/>
            <rect x="38" y="10" width="10" height="5" rx="2" fill="white" opacity="0.8"/>
            <path d="M20 36 Q16 36 15 38" stroke="white" stroke-width="3" stroke-linecap="round" fill="none"/>
          </svg>
        </div>
        <div style="
          position:absolute;
          bottom:-6px;
          left:50%;
          transform:translateX(-50%);
          width:10px;
          height:10px;
          background:rgba(26,115,232,0.25);
          border-radius:50%;
          filter:blur(2px);
        "></div>
      </div>
    `,
    iconSize: [46, 46],
    iconAnchor: [23, 23],
    popupAnchor: [0, -28],
  });
}

const ANIMATION_DURATION = 1200; // ms pour l'interpolation

export default function ScooterMarker({ lat, lng, label, followOnUpdate = false }) {
  const map = useMap();
  const markerRef = useRef(null);
  const animRef = useRef(null);
  const prevPos = useRef(null);
  const currentPos = useRef({ lat, lng });
  const bearingRef = useRef(0);

  // Init marker
  useEffect(() => {
    if (!lat || !lng) return;
    const icon = makeScooterIcon(0, label);
    const marker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(map);
    markerRef.current = marker;
    currentPos.current = { lat, lng };
    prevPos.current = { lat, lng };
    return () => {
      map.removeLayer(marker);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mise à jour animée à chaque changement de position
  useEffect(() => {
    if (!markerRef.current || !lat || !lng) return;

    const from = currentPos.current;
    const to = { lat, lng };

    // Calculer bearing seulement si déplacement significatif (>5m)
    const dist = distanceMeters(from.lat, from.lng, to.lat, to.lng);
    let newBearing = bearingRef.current;
    if (dist > 5) {
      newBearing = calcBearing(from.lat, from.lng, to.lat, to.lng);
      bearingRef.current = newBearing;
    }

    // Annuler animation précédente
    if (animRef.current) cancelAnimationFrame(animRef.current);

    const startTime = performance.now();
    const startLat = from.lat;
    const startLng = from.lng;

    const animate = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / ANIMATION_DURATION, 1);
      // Easing ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);

      const curLat = startLat + (to.lat - startLat) * eased;
      const curLng = startLng + (to.lng - startLng) * eased;

      markerRef.current.setLatLng([curLat, curLng]);
      markerRef.current.setIcon(makeScooterIcon(newBearing, label));
      currentPos.current = { lat: curLat, lng: curLng };

      if (t < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        currentPos.current = { lat: to.lat, lng: to.lng };
        prevPos.current = { lat: to.lat, lng: to.lng };
        if (followOnUpdate) {
          map.panTo([to.lat, to.lng], { animate: true, duration: 0.5 });
        }
      }
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [lat, lng, label, followOnUpdate, map]);

  return null;
}