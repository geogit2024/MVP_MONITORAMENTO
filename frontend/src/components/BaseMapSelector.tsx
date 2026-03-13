import React from 'react';

export const baseMaps = [
  {
    key: 'osm',
    label: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  {
    key: 'satellite',
    label: 'Satélite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
  {
    key: 'dark',
    label: 'Escuro',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO',
  },
  {
    key: 'google_streets',
    label: 'Google Streets',
    url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    attribution: '&copy; Google',
  },
  {
    key: 'google_hybrid',
    label: 'Google Hybrid',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google',
  },
] as const;

interface Props {
  value: string;
  onChange: (key: string) => void;
  className?: string;
}

export default function BaseMapSelector({ value, onChange, className = '' }: Props) {
  return (
    <div className={`base-map-selector ${className}`.trim()}>
      <label className="base-map-selector__label">Mapa Base</label>
      <select
        className="base-map-selector__select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {baseMaps.map((bm) => (
          <option value={bm.key} key={bm.key}>{bm.label}</option>
        ))}
      </select>
    </div>
  );
}
