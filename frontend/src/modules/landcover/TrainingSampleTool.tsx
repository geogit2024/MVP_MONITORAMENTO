import React from 'react';
import type { LandCoverClassDef } from './types';

interface TrainingSampleToolProps {
  selectedClassId: number | null;
  classes: LandCoverClassDef[];
  drawing: boolean;
  sampleCount: number;
  onToggleDrawing: () => void;
  onClearSamples: () => void;
}

export default function TrainingSampleTool({
  selectedClassId,
  classes,
  drawing,
  sampleCount,
  onToggleDrawing,
  onClearSamples,
}: TrainingSampleToolProps) {
  const selectedClass = classes.find((c) => c.id === selectedClassId);

  return (
    <div className="landcover-card">
      <div className="landcover-title-row">
        <strong>Amostras</strong>
        <span className="landcover-badge">{sampleCount}</span>
      </div>
      <p className="landcover-helper">
        Classe ativa:{' '}
        <strong style={{ color: selectedClass?.color || '#fff' }}>
          {selectedClass?.name || 'Nenhuma'}
        </strong>
      </p>
      <div className="landcover-row">
        <button type="button" className="button button-primary" onClick={onToggleDrawing}>
          {drawing ? 'Parar desenho' : 'Desenhar amostras'}
        </button>
        <button type="button" className="button button-danger" onClick={onClearSamples}>
          Limpar
        </button>
      </div>
    </div>
  );
}
