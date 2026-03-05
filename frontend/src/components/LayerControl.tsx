// src/components/LayerControl.tsx
import React, { useState } from 'react';
import './LayerControl.css'; // Certifique-se de que o arquivo CSS existe

// Define a interface para as props do componente
interface LayerControlProps {
  onLayerToggle: (layerName: string, visible: boolean) => void;
  initialState: { [key: string]: boolean };
}

const carConditionLegend = [
  { value: 'ATIVO', color: '#2e7d32' },
  { value: 'PENDENTE', color: '#f9a825' },
  { value: 'SUSPENSO', color: '#ef6c00' },
  { value: 'CANCELADO', color: '#c62828' },
  { value: 'OUTROS', color: '#546e7a' },
];

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
            {Object.keys(initialState).map((layerName) => (
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

                {layerName === 'propriedades_car_sp' && initialState[layerName] && (
                  <div className="layer-legend">
                    <div className="layer-legend-title">Simbologia (condicao)</div>
                    {carConditionLegend.map((item) => (
                      <div className="layer-legend-item" key={item.value}>
                        <span className="layer-legend-swatch" style={{ backgroundColor: item.color }} />
                        <span className="layer-legend-label">{item.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LayerControl;
