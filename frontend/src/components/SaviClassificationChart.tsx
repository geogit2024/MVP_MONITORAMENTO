// src/components/SaviClassificationChart.tsx

import React from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import type { SaviAreas } from '../MainApplication'; // <-- 1. IMPORTAR a nova interface

ChartJS.register(ArcElement, Tooltip, Legend, Title, ChartDataLabels);

interface Props {
  data: SaviAreas; // <-- 2. USAR a nova interface nos props
}

const SaviClassificationChart: React.FC<Props> = ({ data }) => {
  const chartData = {
    // 3. ATUALIZAR os rótulos para as classes do SAVI
    labels: ['Água / Solo Nu', 'Vegetação Esparsa', 'Vegetação Moderada', 'Vegetação Densa'],
    datasets: [
      {
        label: 'Área (ha)',
        // 4. ATUALIZAR os dados para corresponder à interface SaviAreas
        data: [
          data.area_agua_solo,
          data.area_vegetacao_esparsa,
          data.area_vegetacao_moderada,
          data.area_vegetacao_densa,
        ],
        // 5. ESCOLHER novas cores para as classes do SAVI
        backgroundColor: ['#74a9cf', '#ffffbf', '#a6d96a', '#1a9641'],
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
        // 6. ATUALIZAR o título do gráfico
        text: 'Classificação SAVI da Área de Interesse',
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
        color: '#000', // Alterado para preto para melhor contraste com as novas cores
        font: {
          weight: 'bold' as const,
          size: 14,
        },
        textStrokeColor: '#fff',
        textStrokeWidth: 2,
      },
    },
  };

  return (
    <div className="savi-chart-container"> {/* Pode usar a mesma classe CSS ou criar uma nova */}
      <Pie options={options} data={chartData} />
      <div className="ndvi-details-list"> {/* Reutilizando a classe CSS */}
        <h4>Resumo da Área (Hectares):</h4>
        {/* 7. ATUALIZAR a lista de resumo */}
        <ul>
          <li><strong>Água / Solo Nu:</strong> {data.area_agua_solo.toFixed(2)} ha</li>
          <li><strong>Vegetação Esparsa:</strong> {data.area_vegetacao_esparsa.toFixed(2)} ha</li>
          <li><strong>Vegetação Moderada:</strong> {data.area_vegetacao_moderada.toFixed(2)} ha</li>
          <li><strong>Vegetação Densa:</strong> {data.area_vegetacao_densa.toFixed(2)} ha</li>
        </ul>
        <div className="ndvi-metadata"> {/* Reutilizando a classe CSS */}
          <p><strong>Sensor:</strong> {data.sensor} | <strong>Resolução:</strong> {data.scale}m</p>
        </div>
      </div>
    </div>
  );
};

export default SaviClassificationChart;