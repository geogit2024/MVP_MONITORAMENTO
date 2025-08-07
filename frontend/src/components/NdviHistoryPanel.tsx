// src/components/NdviHistoryPanel.tsx

import React, { useState } from 'react';
import Draggable from 'react-draggable';
import './NdviHistoryPanel.css'; // Criaremos este CSS a seguir

interface Props {
  onClose: () => void;
  onGenerate: (params: { scale: number; interval: string; reducer: string }) => void;
  loading: boolean;
  satellite: string; // Recebe o satélite selecionado para definir a resolução padrão
}

const NdviHistoryPanel: React.FC<Props> = ({ onClose, onGenerate, loading, satellite }) => {
  const defaultScale = satellite.startsWith('SENTINEL') ? 10 : 30;
  const [scale, setScale] = useState(defaultScale);
  const [interval, setInterval] = useState('monthly');
  const [reducer, setReducer] = useState('mean');

  const handleGenerateClick = () => {
    onGenerate({ scale, interval, reducer });
  };

  return (
    <Draggable handle=".panel-header" bounds=".app-container">
      <div className="floating-panel-box history-panel">
        <div className="panel-header">
          <h3>Análise de Histórico de NDVI</h3>
          <button onClick={onClose} className="panel-close-button">&times;</button>
        </div>
        <div className="panel-body">
          <p className="panel-description">
            Configure os parâmetros para gerar o gráfico da série temporal de NDVI para a área de interesse selecionada.
          </p>
          <div className="form-group">
            <label htmlFor="scale-input">Resolução (escala em metros)</label>
            <input
              id="scale-input"
              type="number"
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              placeholder={`Padrão: ${defaultScale}m`}
            />
          </div>
          <div className="form-group">
            <label htmlFor="interval-select">Intervalo Temporal</label>
            <select id="interval-select" value={interval} onChange={(e) => setInterval(e.target.value)}>
              <option value="monthly">Mensal</option>
              <option value="weekly">Semanal</option>
              <option value="daily">Diário</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="reducer-select">Função Estatística</label>
            <select id="reducer-select" value={reducer} onChange={(e) => setReducer(e.target.value)}>
              <option value="mean">Média</option>
              <option value="median">Mediana</option>
              <option value="max">Máximo</option>
              <option value="min">Mínimo</option>
            </select>
          </div>
          <div className="panel-actions">
            <button onClick={handleGenerateClick} className="button button-primary" disabled={loading}>
              {loading ? 'Gerando...' : 'Gerar Gráfico'}
            </button>
          </div>
        </div>
      </div>
    </Draggable>
  );
};

export default NdviHistoryPanel;