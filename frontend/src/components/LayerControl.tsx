// src/components/LayerControl.tsx
import React, { useState } from 'react';
import './LayerControl.css'; // Certifique-se de que o arquivo CSS existe

// Define a interface para as props do componente
interface LayerControlProps {
  onLayerToggle: (layerName: string, visible: boolean) => void;
  initialState: { [key: string]: boolean };
}
const HIDDEN_LAYERS = new Set(['propriedades_rurais', 'talhoes', 'propriedades_car_sp']);

const LayerControl: React.FC<LayerControlProps> = ({ onLayerToggle, initialState }) => {
  const [isOpen, setIsOpen] = useState(true); // Começa aberto

  // Função para formatar o nome da camada para exibição (ex: 'propriedades_rurais' -> 'Propriedades Rurais')
  const formatLayerName = (name: string) => {
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  };

  const handleToggle = (layerName: string, event: React.ChangeEvent<HTMLInputElement>) => {
    onLayerToggle(layerName, event.target.checked);
  };

  // Ícone de camadas (SVG embutido)
  const layerIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
      <polyline points="2 17 12 22 22 17"></polyline>
      <polyline points="2 12 12 17 22 12"></polyline>
    </svg>
  );

  return (
    <div className="leaflet-top leaflet-right">
      <div className="leaflet-control leaflet-bar layer-control-container">
        <button
          className="layer-control-toggle-button"
          onClick={() => setIsOpen(!isOpen)}
          title="Controle de Camadas"
        >
          {layerIcon}
        </button>
        {isOpen && (
          <div className="layer-control-panel">
            <h4>Camadas WMS</h4>
            {/* Bloco dinâmico que cria as checkboxes a partir do estado */}
            {Object.keys(initialState)
              .filter((layerName) => !HIDDEN_LAYERS.has(layerName))
              .map((layerName) => (
              <div className="layer-group" key={layerName}>
                <div className="layer-item">
                  <input
                    type="checkbox"
                    id={layerName}
                    onChange={(e) => handleToggle(layerName, e)}
                    checked={initialState[layerName] || false}
                  />
                  <label htmlFor={layerName}>{formatLayerName(layerName)}</label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LayerControl;
