import React from 'react';

const baseMaps = [
  { key: 'osm', label: 'OpenStreetMap' },
  { key: 'satellite', label: 'Satélite' },
  { key: 'dark', label: 'Escuro' },
  { key: 'google_streets', label: 'Google Streets' },
  { key: 'google_hybrid', label: 'Google Hybrid' }
];

interface Props {
  value: string;
  onChange: (key: string) => void;
}

export default function BaseMapSelector({ value, onChange }: Props) {
  return (
    <div style={{
      position: 'absolute',
      top: 20,
      right: 20,
      zIndex: 1200,
      background: 'rgba(255,255,255,0.95)',
      borderRadius: 8,
      padding: 8,
      boxShadow: '0 2px 8px rgba(0,0,0,0.18)'
    }}>
      <label style={{ marginRight: 8, fontWeight: 500 }}>Mapa Base:</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ fontSize: 15, padding: 2 }}>
        {baseMaps.map(bm => (
          <option value={bm.key} key={bm.key}>{bm.label}</option>
        ))}
      </select>
    </div>
  );
}
