// src/components/MsaviClassificationChart.tsx

import React from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import type { MsaviAreas } from '../MainApplication'; // Importar a nova interface

ChartJS.register(ArcElement, Tooltip, Legend, Title, ChartDataLabels);

interface Props {
  data: MsaviAreas; // Usar a nova interface
}

const MsaviClassificationChart: React.FC<Props> = ({ data }) => {
  const chartData = {
    // Atualizar os rótulos para as classes do MSAVI
    labels: ['Solo Exposto', 'Vegetação Rala', 'Vegetação Moderada', 'Vegetação Densa'],
    datasets: [
      {
        label: 'Área (ha)',
        // Atualizar os dados para corresponder à interface MsaviAreas
        data: [
          data.area_solo_exposto,
          data.area_vegetacao_rala,
          data.area_vegetacao_moderada,
          data.area_vegetacao_densa,
        ],
        // Escolher cores para as classes do MSAVI
        backgroundColor: ['#e0c2a2', '#fdbf6f', '#a6d96a', '#1a9641'],
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
        labels: { color: '#333', font: { size: 14 } }
      },
      title: {
        display: true,
        text: 'Classificação MSAVI da Área de Interesse', // Atualizar o título
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
      datalabels: {
        formatter: (value: number, context: any) => {
          const total = context.chart.data.datasets[0].data.reduce((sum: number, val: number) => sum + val, 0);
          if (total === 0) return '0%';
          const percentage = (value / total) * 100;
          if (percentage < 1) return null;
          return percentage.toFixed(1) + '%';
        },
        color: '#000',
        font: { weight: 'bold' as const, size: 14, },
        textStrokeColor: '#fff',
        textStrokeWidth: 2,
      },
    },
  };

  return (
    <div className="msavi-chart-container">
      <Pie options={options} data={chartData} />
      <div className="ndvi-details-list">
        <h4>Resumo da Área (Hectares):</h4>
        {/* Atualizar a lista de resumo */}
        <ul>
          <li><strong>Solo Exposto:</strong> {data.area_solo_exposto.toFixed(2)} ha</li>
          <li><strong>Vegetação Rala:</strong> {data.area_vegetacao_rala.toFixed(2)} ha</li>
          <li><strong>Vegetação Moderada:</strong> {data.area_vegetacao_moderada.toFixed(2)} ha</li>
          <li><strong>Vegetação Densa:</strong> {data.area_vegetacao_densa.toFixed(2)} ha</li>
        </ul>
        <div className="ndvi-metadata">
          <p><strong>Sensor:</strong> {data.sensor} | <strong>Resolução:</strong> {data.scale}m</p>
        </div>
      </div>
    </div>
  );
};

export default MsaviClassificationChart;