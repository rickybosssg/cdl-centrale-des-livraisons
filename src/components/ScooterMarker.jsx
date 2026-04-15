/**
 * ScooterMarker — Marqueur scooter animé pour Leaflet
 * - Interpolation fluide requestAnimationFrame (ease-out)
 * - Orientation automatique selon le bearing GPS
 * - Bulle contextuelle discrète
 * - Pas de recreation du marker, seulement setLatLng + setIcon
 * - Compatible mobile / APK Android
 */
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

// ── Bearing entre deux coords (°) ──────────────────────────────────────────
function calcBearing(lat1, lng1, lat2, lng2) {
  const R = Math.PI / 180;
  const dLon = (lng2 - lng1) * R;
  const y = Math.sin(dLon) * Math.cos(lat2 * R);
  const x =
    Math.cos(lat1 * R) * Math.sin(lat2 * R) -
    Math.sin(lat1 * R) * Math.cos(lat2 * R) * Math.cos(dLon);
  return ((Math.atan2(y, x) / R) + 360) % 360;
}

// ── Distance en mètres ──────────────────────────────────────────────────────
function distMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Génère l'icône divIcon scooter SVG ─────────────────────────────────────
// Le scooter SVG pointe vers la DROITE (angle 0°) — on tourne selon bearing
function makeScooterIcon(bearing, label) {
  const labelHtml = label
    ? `<div style="
        position:absolute;top:-38px;left:50%;transform:translateX(-50%);
        background:rgba(255,255,255,0.96);color:#1a73e8;
        font-size:10.5px;font-weight:700;padding:3px 9px;
        border-radius:20px;white-space:nowrap;
        box-shadow:0 2px 10px rgba(26,115,232,0.22);
        border:1.5px solid #c7d9ff;font-family:Inter,system-ui,sans-serif;
        pointer-events:none;line-height:1.3;
      ">${label}</div>`
    : "";

  // SVG scooter moderne orienté vers la droite → bearing 0 = Est (natif Leaflet bearing)
  // On soustrait 90° car le scooter est en fait orienté vers le haut dans le SVG
  const rotate = bearing - 90;

  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:48px;height:48px;display:flex;align-items:center;justify-content:center;">
      ${labelHtml}
      <div style="
        width:48px;height:48px;
        background:linear-gradient(135deg,#1a73e8,#1557b0);
        border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 4px 14px rgba(26,115,232,0.5);
        border:2.5px solid rgba(255,255,255,0.95);
        transform:rotate(${rotate}deg);
      ">
        <svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Roue arrière -->
          <circle cx="10" cy="34" r="7" stroke="white" stroke-width="3.5" fill="none"/>
          <!-- Roue avant -->
          <circle cx="38" cy="34" r="7" stroke="white" stroke-width="3.5" fill="none"/>
          <!-- Axe/fourche avant -->
          <line x1="38" y1="27" x2="35" y2="18" stroke="white" stroke-width="3" stroke-linecap="round"/>
          <!-- Guidon -->
          <line x1="31" y1="15" x2="39" y2="15" stroke="white" stroke-width="3" stroke-linecap="round"/>
          <!-- Cadre principal -->
          <path d="M10 27 L22 18 L34 18" stroke="white" stroke-width="3" stroke-linecap="round" fill="none"/>
          <!-- Siège -->
          <path d="M18 18 L28 18" stroke="white" stroke-width="4" stroke-linecap="round" opacity="0.85"/>
          <!-- Carénage/corps -->
          <path d="M10 27 Q10 22 16 20 L22 18" stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.7"/>
          <!-- Phare avant -->
          <circle cx="38" cy="21" r="2.5" fill="white" opacity="0.9"/>
        </svg>
      </div>
      <!-- Ombre sol -->
      <div style="
        position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);
        width:28px;height:6px;
        background:rgba(26,115,232,0.18);
        border-radius:50%;filter:blur(3px);
      "></div>
    </div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -28],
  });
}

const ANIM_MS = 1000; // durée interpolation ms

export default function ScooterMarker({ lat, lng, label = "", followOnUpdate = false }) {
  const map = useMap();
  const markerRef = useRef(null);
  const animRef = useRef(null);
  const fromRef = useRef({ lat, lng });
  const bearingRef = useRef(0);

  // ── Initialisation (une seule fois) ────────────────────────────────────────
  useEffect(() => {
    if (!lat || !lng) return;
    const icon = makeScooterIcon(0, label);
    const m = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(map);
    markerRef.current = m;
    fromRef.current = { lat, lng };
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      map.removeLayer(m);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mise à jour animée ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!markerRef.current || !lat || !lng) return;

    const from = { ...fromRef.current };
    const to = { lat, lng };

    // Calculer bearing uniquement si déplacement > 8m (évite rotations parasites)
    const dist = distMeters(from.lat, from.lng, to.lat, to.lng);
    if (dist > 8) {
      bearingRef.current = calcBearing(from.lat, from.lng, to.lat, to.lng);
    }
    const bearing = bearingRef.current;

    // Annuler anim précédente
    if (animRef.current) cancelAnimationFrame(animRef.current);

    const t0 = performance.now();
    const sLat = from.lat;
    const sLng = from.lng;

    const step = (now) => {
      const p = Math.min((now - t0) / ANIM_MS, 1);
      // Ease-out cubic
      const e = 1 - Math.pow(1 - p, 3);
      const cLat = sLat + (to.lat - sLat) * e;
      const cLng = sLng + (to.lng - sLng) * e;

      markerRef.current.setLatLng([cLat, cLng]);

      if (p < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = { lat: to.lat, lng: to.lng };
        markerRef.current.setIcon(makeScooterIcon(bearing, label));
        if (followOnUpdate) {
          map.panTo([to.lat, to.lng], { animate: true, duration: 0.4 });
        }
      }
    };

    // Mettre l'icône avec le bon bearing dès le départ
    markerRef.current.setIcon(makeScooterIcon(bearing, label));
    animRef.current = requestAnimationFrame(step);

    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [lat, lng, label, followOnUpdate, map]);

  return null;
}