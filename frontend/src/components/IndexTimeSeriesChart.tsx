// src/components/IndexTimeSeriesChart.tsx

import React from 'react';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';

// Registrar os componentes do Chart.js que serão usados
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
);

// Interface para os dados históricos
interface HistoricalDataPoint {
    date: string;
    // Aqui assumimos que a API retornará os nomes dos índices como chaves
    [key: string]: string | number; 
}

interface IndexTimeSeriesChartProps {
    data: HistoricalDataPoint[];
    selectedIndices: string[];
    onClose: () => void;
    theme: 'light' | 'dark';
}

const IndexTimeSeriesChart: React.FC<IndexTimeSeriesChartProps> = ({ data, selectedIndices, onClose, theme }) => {
    if (!data || data.length === 0) {
        return (
            <div className="floating-popup" data-theme={theme}>
                <h2>Histórico de Índices</h2>
                <p>Nenhum dado histórico disponível para os índices e período selecionados.</p>
                <button className="close-button" onClick={onClose}>Fechar</button>
            </div>
        );
    }

    const labels = data.map(item => item.date);

    const datasets = selectedIndices.map((indexName, idx) => {
        const values = data.map(item => typeof item[indexName] === 'number' ? item[indexName] : null);
        
        // Cores de exemplo, você pode personalizar
        const colors = [
            'rgba(75, 192, 192, 1)', // Verde-água para NDVI
            'rgba(153, 102, 255, 1)', // Roxo para EVI
            'rgba(255, 159, 64, 1)',  // Laranja
            'rgba(54, 162, 235, 1)',  // Azul
            'rgba(255, 99, 132, 1)',  // Vermelho
            'rgba(201, 203, 207, 1)', // Cinza
        ];

        return {
            label: indexName,
            data: values,
            borderColor: colors[idx % colors.length],
            backgroundColor: colors[idx % colors.length].replace('1)', '0.2)'), // Fundo transparente
            tension: 0.1, // Suaviza a linha
            pointRadius: 3,
            pointHoverRadius: 5,
            fill: false, // Não preenche a área abaixo da linha
        };
    });

    const chartData = {
        labels,
        datasets,
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false, // Permite que o chart se ajuste melhor ao container
        plugins: {
            legend: {
                position: 'top' as const,
                labels: {
                    color: theme === 'dark' ? '#eee' : '#333', // Cor da legenda
                },
            },
            title: {
                display: true,
                text: 'Histórico de Índices de Sensoriamento Remoto',
                color: theme === 'dark' ? '#eee' : '#333', // Cor do título
            },
            tooltip: {
                mode: 'index' as const,
                intersect: false,
            },
        },
        scales: {
            x: {
                title: {
                    display: true,
                    text: 'Data',
                    color: theme === 'dark' ? '#bbb' : '#666',
                },
                ticks: {
                    color: theme === 'dark' ? '#aaa' : '#444', // Cor dos ticks do eixo X
                },
                grid: {
                    color: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', // Cor da grade
                }
            },
            y: {
                title: {
                    display: true,
                    text: 'Valor do Índice',
                    color: theme === 'dark' ? '#bbb' : '#666',
                },
                ticks: {
                    color: theme === 'dark' ? '#aaa' : '#444', // Cor dos ticks do eixo Y
                },
                grid: {
                    color: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', // Cor da grade
                }
            },
        },
    };

    const containerStyle: React.CSSProperties = {
        width: '100%',
        height: 'calc(100% - 60px)' // Ajuste a altura conforme necessário
    }

    return (
        <div className="floating-popup" data-theme={theme}>
            <div style={containerStyle}>
                <Line data={chartData} options={options} />
            </div>
            <button className="close-button" onClick={onClose}>Fechar</button>
        </div>
    );
};

export default IndexTimeSeriesChart;