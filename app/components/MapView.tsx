"use client";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import L from "leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({ iconUrl: markerIcon.src, iconRetinaUrl: markerIcon2x.src, shadowUrl: markerShadow.src });

interface Point { city:string; town:string; lat:number; lng:number; count:number; avg_unit:number|null; }

export default function MapView({ query }: { query: string }) {
  const [points, setPoints] = useState<Point[]>([]);
  useEffect(() => {
    fetch("/api/map?" + query).then(r => r.json()).then(d => setPoints(d.points || []));
  }, [query]);
  return (
    <MapContainer center={[23.7, 121]} zoom={7} style={{ height: "70vh", width: "100%" }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
      {points.map((p, i) => (
        <Marker key={i} position={[p.lat, p.lng]}>
          <Popup>{p.city}{p.town}<br/>筆數: {p.count}<br/>均價: {p.avg_unit ? Math.round(p.avg_unit).toLocaleString() : "-"} 元/坪</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
