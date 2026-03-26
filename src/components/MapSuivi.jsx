import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export default function MapSuivi({ livreurLat, livreurLng }) {
  if (!livreurLat || !livreurLng) return null;

  return (
    <div className="h-48 rounded-lg overflow-hidden border">
      <MapContainer
        center={[livreurLat, livreurLng]}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        key={`${livreurLat}-${livreurLng}`}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="© OpenStreetMap"
        />
        <Marker position={[livreurLat, livreurLng]}>
          <Popup>🛵 Livreur en route</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}