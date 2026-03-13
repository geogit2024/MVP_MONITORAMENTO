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
import { Bar, Doughnut } from 'react-chartjs-2';
import { FIELD_TASK_STATUS_LABEL } from '../types';
import type { FieldTask, FieldTaskStatus } from '../types';

ChartJS.register(ArcElement, Tooltip, ChartLegend, CategoryScale, LinearScale, BarElement);

interface FieldTaskAnalyticsPanelProps {
  tasks: FieldTask[];
  embedded?: boolean;
  showTitle?: boolean;
}

const STATUS_COLORS: Record<FieldTaskStatus, string> = {
  rascunho: '#94a3b8',
  despachada: '#3b82f6',
  recebida: '#2563eb',
  aceita: '#1d4ed8',
  em_deslocamento: '#0ea5e9',
  no_local: '#22c55e',
  em_execucao: '#14b8a6',
  concluida: '#16a34a',
  recusada: '#ef4444',
  cancelada: '#dc2626',
  erro_execucao: '#f59e0b',
};

const CATEGORY_PALETTE = [
  '#22c55e',
  '#f59e0b',
  '#3b82f6',
  '#a855f7',
  '#ef4444',
  '#06b6d4',
  '#84cc16',
  '#f97316',
];

export function FieldTaskAnalyticsPanel({
  tasks,
  embedded = false,
  showTitle = true,
}: FieldTaskAnalyticsPanelProps) {
  const analytics = useMemo(() => {
    const categoryMap = new Map<string, number>();
    const statusMap = new Map<FieldTaskStatus, number>();

    for (const task of tasks) {
      const category = (task.category || 'sem_categoria').trim();
      categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
      statusMap.set(task.status, (statusMap.get(task.status) || 0) + 1);
    }

    const categoryEntries = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1]);
    const statusEntries = Array.from(statusMap.entries()).sort((a, b) => b[1] - a[1]);

    return {
      categoryLabels: categoryEntries.map(([label]) => label),
      categoryValues: categoryEntries.map(([, value]) => value),
      categoryColors: categoryEntries.map((_, index) => CATEGORY_PALETTE[index % CATEGORY_PALETTE.length]),
      statusLabels: statusEntries.map(([status]) => FIELD_TASK_STATUS_LABEL[status] || status),
      statusValues: statusEntries.map(([, value]) => value),
      statusColors: statusEntries.map(([status]) => STATUS_COLORS[status]),
    };
  }, [tasks]);

  const containerClassName = embedded
    ? 'field-dispatch-embedded-section field-dispatch-embedded-section--analytics'
    : '';

  if (!tasks.length) {
    return (
      <section className={containerClassName}>
        {showTitle ? <h3>Painel de atividades</h3> : null}
        <p className="subtitle">Sem atividades para gerar graficos.</p>
      </section>
    );
  }

  return (
    <section className={containerClassName}>
      {showTitle ? <h3>Painel de atividades</h3> : null}
      <div className="field-dispatch-analytics-grid">
        <div className="field-dispatch-chart-card">
          <strong>Atividades por categoria</strong>
          <div className="field-dispatch-chart-canvas">
            <Bar
              data={{
                labels: analytics.categoryLabels,
                datasets: [
                  {
                    label: 'Quantidade',
                    data: analytics.categoryValues,
                    backgroundColor: analytics.categoryColors,
                    borderRadius: 6,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: { bodyFont: { size: 11 }, titleFont: { size: 11 } },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: { precision: 0, font: { size: 10 } },
                    grid: { color: 'rgba(180, 213, 235, 0.16)' },
                  },
                  x: {
                    ticks: { font: { size: 10 } },
                    grid: { color: 'rgba(180, 213, 235, 0.1)' },
                  },
                },
              }}
            />
          </div>
        </div>

        <div className="field-dispatch-chart-card">
          <strong>Atividades por status</strong>
          <div className="field-dispatch-chart-canvas">
            <Doughnut
              data={{
                labels: analytics.statusLabels,
                datasets: [
                  {
                    data: analytics.statusValues,
                    backgroundColor: analytics.statusColors,
                    borderColor: '#0a2235',
                    borderWidth: 1,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'bottom',
                    labels: { boxWidth: 10, boxHeight: 10, font: { size: 10 } },
                  },
                  tooltip: { bodyFont: { size: 11 }, titleFont: { size: 11 } },
                },
                cutout: '56%',
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
