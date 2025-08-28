// src/components/GridTool.tsx
import React, { useState } from 'react';
import './GridTool.css';

// As interfaces permanecem as mesmas
interface TalhaoFeature {
  type: 'Feature';
  properties: {
    id: number;
    nome: string;
  };
  geometry: {
    type: string;
    coordinates: any[];
  };
}

interface GridToolProps {
  selectedTalhao: TalhaoFeature | null;
  onGridGenerated: (pointsGeoJSON: any) => void;
  onClose: () => void;
}

const GridTool: React.FC<GridToolProps> = ({ selectedTalhao, onGridGenerated, onClose }) => {
  // Estados para os campos do formulário (sem alterações)
  const [spacingX, setSpacingX] = useState(100);
  const [spacingY, setSpacingY] = useState(100);
  const [startId, setStartId] = useState(1);
  const [depth, setDepth] = useState('0-20');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ REMOVIDO: O estado 'isEditingGrid' não é mais necessário.

  // A função para gerar a grade permanece a mesma
  const handleGenerateGrid = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!selectedTalhao) {
        throw new Error("Nenhum talhão selecionado.");
      }
      const response = await fetch(`http://localhost:8000/api/talhoes/${selectedTalhao.properties.id}/generate-grid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spacingX, spacingY, startId, depth }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Falha ao gerar a grade.');
      }
      
      const newPointsGeoJSON = await response.json();
      onGridGenerated(newPointsGeoJSON);
      
    } catch (err: any) {
      setError(err.message);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="grid-tool-sidebar">
      <div className="grid-tool-header">
        <h3>Gerar Grade de Amostragem</h3>
        <button onClick={onClose} className="close-button">&times;</button>
      </div>
      
      {/* ✅ LÓGICA SIMPLIFICADA: Mostra o formulário ou o aviso, sem passo intermediário. */}
      {selectedTalhao ? (
        // Se um talhão ESTÁ selecionado, mostra o formulário diretamente
        <>
          <div className="talhao-info">
            <strong>Talhão:</strong> {selectedTalhao.properties.nome}
          </div>
          <div className="grid-tool-form">
            <div className="form-group">
              <label htmlFor="startId">Id Inicial do Ponto</label>
              <input
                id="startId"
                type="number"
                value={startId}
                onChange={e => setStartId(Number(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="depth">Profundidade (ex: 0-20)</label>
              <input
                id="depth"
                type="text"
                value={depth}
                onChange={e => setDepth(e.target.value)}
              />
            </div>
            <div className="form-group-inline">
              <div className="form-group">
                <label htmlFor="spacingX">Espaçamento X (m)</label>
                <input
                  id="spacingX"
                  type="number"
                  value={spacingX}
                  onChange={e => setSpacingX(Number(e.target.value))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="spacingY">Espaçamento Y (m)</label>
                <input
                  id="spacingY"
                  type="number"
                  value={spacingY}
                  onChange={e => setSpacingY(Number(e.target.value))}
                />
              </div>
            </div>
            <button onClick={handleGenerateGrid} disabled={isLoading} className="generate-button">
              {isLoading ? 'Gerando...' : 'Gerar Grade'}
            </button>
            {error && <p className="error-message">{error}</p>}
          </div>
        </>
      ) : (
        // Se NENHUM talhão estiver selecionado, mostra o aviso
        <div className="grid-tool-prompt">
          <p>Selecione um talhão no mapa para configurar a grade de amostragem.</p>
        </div>
      )}
    </div>
  );
};

export default GridTool;