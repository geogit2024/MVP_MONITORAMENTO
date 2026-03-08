import React from 'react';
import type { LandCoverLegendItem } from './types';

interface LegendProps {
  legend: LandCoverLegendItem[];
  visible: boolean;
  onToggleVisible: () => void;
}

export default function Legend({ legend, visible, onToggleVisible }: LegendProps) {
  if (!legend.length) return null;
  return (
    <div className="landcover-card">
      <div className="landcover-title-row">
        <strong>Legenda</strong>
        <button type="button" className="button button-secondary" onClick={onToggleVisible}>
          {visible ? 'Ocultar camada' : 'Mostrar camada'}
        </button>
      </div>
      <div className="landcover-legend-list">
        {legend.map((item) => (
          <div key={item.class_id} className="landcover-legend-item">
            <span className="landcover-swatch" style={{ backgroundColor: item.color }} />
            <span>{item.class}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
