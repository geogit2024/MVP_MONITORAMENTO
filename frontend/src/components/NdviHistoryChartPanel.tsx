// src/components/NdviHistoryChartPanel.tsx

import React, { useRef } from 'react';
import Draggable from 'react-draggable';
import { ResizableBox } from 'react-resizable';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface TimeSeriesDataPoint {
  date: string;
  value: number | null;
}

interface Props {
  data: {
    series: TimeSeriesDataPoint[];
    parameters: { [key: string]: any };
  };
  onClose: () => void;
}

const NdviHistoryChartPanel: React.FC<Props> = ({ data, onClose }) => {
  const nodeRef = useRef(null);

  const chartData = {
    labels: data.series.map(d => new Date(d.date).toLocaleDateString('pt-BR', {timeZone: 'UTC'})),
    datasets: [
      {
        label: `NDVI (${data.parameters.reducer})`,
        // Conecta pontos nulos para uma linha contínua, mas não os desenha
        data: data.series.map(d => d.value),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
        tension: 0.1,
        spanGaps: true, // Conecta a linha sobre pontos nulos
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: 'Histórico de NDVI na Área de Interesse' },
    },
    scales: {
        y: {
            beginAtZero: false, // O NDVI pode ser negativo
            title: { display: true, text: 'Valor do NDVI' }
        }
    }
  };

  return (
    <Draggable nodeRef={nodeRef} handle=".panel-header" bounds=".app-container">
      <ResizableBox
        ref={nodeRef}
        width={800}
        height={500}
        minConstraints={[400, 300]}
        className="floating-panel-box"
      >
        <div className="panel-header">
          <h3>Gráfico de Histórico de NDVI</h3>
          <button onClick={onClose} className="panel-close-button">&times;</button>
        </div>
        <div className="panel-body">
          <Line options={options} data={chartData} />
          <div style={{textAlign: 'center', fontSize: '12px', marginTop: '10px', color: '#666'}}>
            Parâmetros: Satélite: {data.parameters.satellite} | Resolução: {data.parameters.scale}m | Intervalo: {data.parameters.interval}
          </div>
        </div>
      </ResizableBox>
    </Draggable>
  );
};

export default NdviHistoryChartPanel;