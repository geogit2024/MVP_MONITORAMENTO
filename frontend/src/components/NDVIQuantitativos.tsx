// src/components/NDVIQuantitativos.tsx

import React from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels'; // <-- 1. IMPORTAR o novo plugin
import type { NdviAreas } from '../MainApplication';

// <-- 2. REGISTRAR o novo plugin
ChartJS.register(ArcElement, Tooltip, Legend, Title, ChartDataLabels);

interface Props {
  data: NdviAreas;
}

const NdviClassificationChart: React.FC<Props> = ({ data }) => {
  const chartData = {
    labels: ['Água', 'Solo Exposto', 'Vegetação Rala', 'Vegetação Densa'],
    datasets: [
      {
        label: 'Área (ha)',
        data: [
          data.area_agua,
          data.area_solo_exposto,
          data.area_vegetacao_rala,
          data.area_vegetacao_densa,
        ],
        backgroundColor: ['#4287f5', '#d4a276', '#a6d96a', '#1a9641'],
        borderColor: '#ffffff',
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#333',
          font: { size: 14 }
        }
      },
      title: {
        display: true,
        text: 'Classificação NDVI da Área de Interesse',
        color: '#333',
        font: { size: 16 }
      },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            let label = context.dataset.label || '';
            if (label) { label += ': '; }
            if (context.parsed !== null) { label += context.parsed.toFixed(2) + ' ha'; }
            return label;
          }
        }
      },
      // <-- 3. CONFIGURAR o plugin para exibir os percentuais
      datalabels: {
        formatter: (value: number, context: any) => {
          // Calcula o total de todas as fatias
          const total = context.chart.data.datasets[0].data.reduce((sum: number, val: number) => sum + val, 0);
          if (total === 0) {
            return '0%';
          }
          // Calcula o percentual
          const percentage = (value / total) * 100;
          // Não exibe o rótulo se o percentual for muito pequeno (ex: < 1%)
          if (percentage < 1) {
            return null;
          }
          return percentage.toFixed(1) + '%';
        },
        color: '#fff', // Cor do texto do percentual
        font: {
          weight: 'bold' as const,
          size: 14,
        },
        // Adiciona uma pequena borda preta ao texto para melhorar a legibilidade
        textStrokeColor: '#000',
        textStrokeWidth: 2,
      },
    },
  };

  return (
    <div className="ndvi-chart-container">
      <Pie options={options} data={chartData} />
      <div className="ndvi-details-list">
        <h4>Resumo da Área (Hectares):</h4>
        <ul>
          <li><strong>Água:</strong> {data.area_agua.toFixed(2)} ha</li>
          <li><strong>Solo Exposto:</strong> {data.area_solo_exposto.toFixed(2)} ha</li>
          <li><strong>Vegetação Rala:</strong> {data.area_vegetacao_rala.toFixed(2)} ha</li>
          <li><strong>Vegetação Densa:</strong> {data.area_vegetacao_densa.toFixed(2)} ha</li>
        </ul>
        <div className="ndvi-metadata">
          <p><strong>Sensor:</strong> {data.sensor} | <strong>Resolução:</strong> {data.scale}m</p>
        </div>
      </div>
    </div>
  );
};

export default NdviClassificationChart;