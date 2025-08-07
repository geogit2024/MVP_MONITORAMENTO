// src/components/SatelliteInfoPanel.tsx

import React from 'react';
import './SatelliteInfoPanel.css'; // Usaremos este CSS no próximo passo

// Definimos a interface para as propriedades que o componente receberá.
// Neste caso, ele precisa apenas de uma função para ser chamada quando o usuário quiser fechar o painel.
interface SatelliteInfoPanelProps {
  onClose: () => void;
}

// Array com os dados dos satélites, extraídos da sua tabela.
const satelliteData = [
  {
    name: 'Sentinel-2A',
    resolution: '10m / 20m / 60m',
    revisit: '5 dias (com 2A + 2B)',
    bands: 13,
    radiometry: '12 bits',
    applications: 'NDVI, análise de saúde da cultura, detecção de falhas',
    diffs: 'Alta resolução, frequência elevada, bandas para vegetação',
  },
  {
    name: 'Sentinel-2B',
    resolution: '10m / 20m / 60m',
    revisit: '5 dias (com 2A + 2B)',
    bands: 13,
    radiometry: '12 bits',
    applications: 'NDVI, análise de sanidade, acompanhamento rápido',
    diffs: 'Atuação conjunta com 2A, dobrando frequência',
  },
  {
    name: 'Landsat 8',
    resolution: '30m (óptica) / 15m (pancromática)',
    revisit: '16 dias',
    bands: 11,
    radiometry: '12 bits',
    applications: 'NDVI, análise de ciclo agrícola, avaliação de grandes áreas',
    diffs: 'Série histórica longa, robustez em grandes regiões',
  },
  {
    name: 'Landsat 9',
    resolution: '30m (óptica) / 15m (pancromática)',
    revisit: '16 dias',
    bands: 11,
    radiometry: '12 bits',
    applications: 'NDVI, continuidade de monitoramento, uso extensivo',
    diffs: 'Continuidade sem gaps, mesma tecnologia do L8',
  },
];

export default function SatelliteInfoPanel({ onClose }: SatelliteInfoPanelProps) {
  return (
    // O 'backdrop' é o fundo escurecido que fica atrás do painel.
    // Clicar nele também fechará o painel.
    <div className="info-panel-backdrop" onClick={onClose}>
      {/* O 'panel-container' evita que o clique dentro do painel o feche. */}
      <div className="info-panel-container" onClick={(e) => e.stopPropagation()}>
        <div className="info-panel-header">
          <h2>Comparativo de Satélites</h2>
          {/* O botão 'X' para fechar o painel. */}
          <button onClick={onClose} className="info-panel-close-button">&times;</button>
        </div>
        <div className="info-panel-content">
          {/* Criamos a tabela para exibir os dados de forma organizada. */}
          <table>
            <thead>
              <tr>
                <th>Satélite</th>
                <th>Resolução Espacial</th>
                <th>Frequência de Revisita</th>
                <th>Aplicações Principais</th>
                <th>Diferenciais</th>
              </tr>
            </thead>
            <tbody>
              {/* Usamos a função .map() para percorrer o array de dados e criar uma linha (<tr>) para cada satélite. */}
              {satelliteData.map((sat) => (
                <tr key={sat.name}>
                  <td>{sat.name}</td>
                  <td>{sat.resolution}</td>
                  <td>{sat.revisit}</td>
                  <td>{sat.applications}</td>
                  <td>{sat.diffs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}