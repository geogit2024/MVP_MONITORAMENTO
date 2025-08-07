// src/components/NdreClassificationChart.tsx

import React from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import type { NdreAreas } from '../MainApplication';

ChartJS.register(ArcElement, Tooltip, Legend, Title, ChartDataLabels);

interface Props {
  data: NdreAreas;
}

const NdreClassificationChart: React.FC<Props> = ({ data }) => {
  const chartData = {
    labels: ['Não Vegetado', 'Vegetação Estressada', 'Vegetação Moderada', 'Vegetação Densa'],
    datasets: [
      {
        label: 'Área (ha)',
        data: [
          data.area_nao_vegetada,
          data.area_vegetacao_estressada,
          data.area_vegetacao_moderada,
          data.area_vegetacao_densa,
        ],
        backgroundColor: ['#d5a07b', '#f4a261', '#90be6d', '#43aa8b'],
        borderColor: '#ffffff',
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const, labels: { color: '#333', font: { size: 14 } } },
      title: { display: true, text: 'Classificação Red-Edge NDVI da Área de Interesse', color: '#333', font: { size: 16 } },
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
        font: { weight: 'bold' as const, size: 14 },
        textStrokeColor: '#fff',
        textStrokeWidth: 2,
      },
    },
  };

  return (
    <div className="ndre-chart-container">
      <Pie options={options} data={chartData} />
      <div className="ndvi-details-list">
        <h4>Resumo da Área (Hectares):</h4>
        <ul>
          <li><strong>Não Vegetado:</strong> {data.area_nao_vegetada.toFixed(2)} ha</li>
          <li><strong>Vegetação Estressada/Rala:</strong> {data.area_vegetacao_estressada.toFixed(2)} ha</li>
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

export default NdreClassificationChart;