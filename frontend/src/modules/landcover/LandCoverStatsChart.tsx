import React, { useMemo } from 'react';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend as ChartLegend,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';
import type { LandCoverStatItem } from './types';

ChartJS.register(ArcElement, Tooltip, ChartLegend, CategoryScale, LinearScale, BarElement);

interface LandCoverStatsChartProps {
  stats: LandCoverStatItem[];
}

export default function LandCoverStatsChart({ stats }: LandCoverStatsChartProps) {
  const chartData = useMemo(() => {
    const labels = stats.map((s) => s.class);
    const values = stats.map((s) => Number(s.area_ha || 0));
    const colors = stats.map((s) => s.color);
    return { labels, values, colors };
  }, [stats]);

  if (!stats.length) return null;

  return (
    <div className="landcover-card">
      <strong>Estatisticas de Area (ha)</strong>
      <div className="landcover-chart-block">
        <Pie
          data={{
            labels: chartData.labels,
            datasets: [{ data: chartData.values, backgroundColor: chartData.colors }],
          }}
        />
      </div>
      <div className="landcover-chart-block">
        <Bar
          data={{
            labels: chartData.labels,
            datasets: [
              {
                label: 'Area (ha)',
                data: chartData.values,
                backgroundColor: chartData.colors,
              },
            ],
          }}
          options={{ responsive: true, plugins: { legend: { display: false } } }}
        />
      </div>
    </div>
  );
}
