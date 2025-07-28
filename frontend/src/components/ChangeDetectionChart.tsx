// src/components/ChangeDetectionChart.tsx

import React from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

ChartJS.register(ArcElement, Tooltip, Legend, Title, ChartDataLabels);

interface Props {
  gainArea: number;
  lossArea: number;
  totalArea: number;
}

const ChangeDetectionChart: React.FC<Props> = ({ gainArea, lossArea, totalArea }) => {
  const noChangeArea = Math.max(0, totalArea - gainArea - lossArea);

  const chartData = {
    labels: ['Ganho de Vegetação', 'Perda de Vegetação', 'Sem Mudança'],
    datasets: [
      {
        label: 'Área (ha)',
        data: [gainArea, lossArea, noChangeArea],
        backgroundColor: ['#1a9641', '#d7191c', '#a9a9a9'], // Verde, Vermelho, Cinza
        borderColor: '#ffffff',
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const, labels: { color: '#333' } },
      title: { display: true, text: 'Resultado da Detecção de Mudança', color: '#333' },
      datalabels: {
        formatter: (value: number) => {
          if (totalArea === 0) return '0%';
          const percentage = (value / totalArea) * 100;
          if (percentage < 1) return null;
          return percentage.toFixed(1) + '%';
        },
        color: '#fff',
        font: { weight: 'bold' as const },
        textStrokeColor: '#000',
        textStrokeWidth: 2,
      },
    },
  };

  return (
    <div>
      <Pie options={options} data={chartData} />
      <div className="ndvi-details-list">
        <h4>Resumo da Mudança (Hectares):</h4>
        <ul>
          <li><strong>Área de Ganho:</strong> {gainArea.toFixed(2)} ha</li>
          <li><strong>Área de Perda:</strong> {lossArea.toFixed(2)} ha</li>
          <li><strong>Área sem Mudança:</strong> {noChangeArea.toFixed(2)} ha</li>
        </ul>
        <div className="ndvi-metadata">
          <p><strong>Área Total Analisada:</strong> {totalArea.toFixed(2)} ha</p>
        </div>
      </div>
    </div>
  );
};

export default ChangeDetectionChart;