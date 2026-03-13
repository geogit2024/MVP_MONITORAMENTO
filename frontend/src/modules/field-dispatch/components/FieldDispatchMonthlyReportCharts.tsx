import React from 'react';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend as ChartLegend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { FIELD_TASK_STATUS_COLORS, FIELD_TASK_STATUS_LABEL } from '../types';
import type { FieldDispatchMonthlyReportResponse } from '../types-monthly-report';

ChartJS.register(
  ArcElement,
  Tooltip,
  ChartLegend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement
);

interface FieldDispatchMonthlyReportChartsProps {
  report: FieldDispatchMonthlyReportResponse;
}

const CATEGORY_PALETTE = ['#22c55e', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#84cc16'];

const chartCard = (title: string, child: React.ReactNode) => (
  <article className="field-dispatch-chart-card monthly-report-chart-card">
    <strong>{title}</strong>
    <div className="field-dispatch-chart-canvas monthly-report-chart-canvas">{child}</div>
  </article>
);

export function FieldDispatchMonthlyReportCharts({ report }: FieldDispatchMonthlyReportChartsProps) {
  const { breakdowns } = report;
  const categoryLabels = breakdowns.byCategory.map((item) => item.label);
  const categoryValues = breakdowns.byCategory.map((item) => item.count);
  const statusLabels = breakdowns.byStatus.map(
    (item) => FIELD_TASK_STATUS_LABEL[item.label as keyof typeof FIELD_TASK_STATUS_LABEL] || item.label
  );
  const statusValues = breakdowns.byStatus.map((item) => item.count);
  const statusColors = breakdowns.byStatus.map(
    (item) => FIELD_TASK_STATUS_COLORS[item.label as keyof typeof FIELD_TASK_STATUS_COLORS] || '#38bdf8'
  );
  const priorityLabels = breakdowns.byPriority.map((item) => item.label);
  const priorityValues = breakdowns.byPriority.map((item) => item.count);
  const dayLabels = breakdowns.byDay.map((item) => item.label);
  const dayValues = breakdowns.byDay.map((item) => item.count);
  const weekLabels = breakdowns.byWeek.map((item) => item.label);
  const weekValues = breakdowns.byWeek.map((item) => item.count);
  const agentItems = breakdowns.byAgent.slice(0, 8);
  const agentLabels = agentItems.map((item) => item.agentName || 'Nao atribuido');
  const agentCompleted = agentItems.map((item) => item.completed);
  const slaLabels = breakdowns.bySla.map((item) => item.label);
  const slaValues = breakdowns.bySla.map((item) => item.count);
  const complianceLabels = breakdowns.byCompliance.map((item) => item.label);
  const complianceValues = breakdowns.byCompliance.map((item) => item.count);

  return (
    <section className="dispatch-card monthly-report-section">
      <div className="monthly-report-section__header">
        <div>
          <h3>Graficos analiticos</h3>
          <p className="subtitle">Distribuicao operacional, performance temporal, SLA e conformidade.</p>
        </div>
      </div>

      <div className="field-dispatch-analytics-grid monthly-report-charts-grid">
        {chartCard(
          'Atividades por categoria',
          <Bar
            data={{
              labels: categoryLabels,
              datasets: [
                {
                  label: 'Quantidade',
                  data: categoryValues,
                  backgroundColor: categoryValues.map((_, index) => CATEGORY_PALETTE[index % CATEGORY_PALETTE.length]),
                  borderRadius: 8,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(180,213,235,0.14)' } },
                x: { grid: { display: false } },
              },
            }}
          />
        )}

        {chartCard(
          'Atividades por status',
          <Doughnut
            data={{
              labels: statusLabels,
              datasets: [{ data: statusValues, backgroundColor: statusColors, borderColor: '#081925', borderWidth: 1 }],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              cutout: '60%',
              plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10 } } },
            }}
          />
        )}

        {chartCard(
          'Prioridade',
          <Bar
            data={{
              labels: priorityLabels,
              datasets: [
                {
                  label: 'Quantidade',
                  data: priorityValues,
                  backgroundColor: ['#38bdf8', '#6366f1', '#f59e0b', '#ef4444'],
                  borderRadius: 8,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(180,213,235,0.14)' } },
                x: { grid: { display: false } },
              },
            }}
          />
        )}

        {chartCard(
          'Serie temporal diaria',
          <Line
            data={{
              labels: dayLabels,
              datasets: [
                {
                  label: 'Ocorrencias',
                  data: dayValues,
                  borderColor: '#38bdf8',
                  backgroundColor: 'rgba(56, 189, 248, 0.18)',
                  tension: 0.28,
                  pointRadius: 2,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(180,213,235,0.14)' } },
                x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
              },
            }}
          />
        )}

        {chartCard(
          'Ranking de agentes',
          <Bar
            data={{
              labels: agentLabels,
              datasets: [{ label: 'Concluidas', data: agentCompleted, backgroundColor: '#22c55e', borderRadius: 8 }],
            }}
            options={{
              indexAxis: 'y',
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(180,213,235,0.14)' } },
                y: { grid: { display: false } },
              },
            }}
          />
        )}

        {chartCard(
          'SLA do periodo',
          <Doughnut
            data={{
              labels: slaLabels,
              datasets: [{ data: slaValues, backgroundColor: ['#22c55e', '#ef4444', '#94a3b8'], borderColor: '#081925', borderWidth: 1 }],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              cutout: '58%',
              plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10 } } },
            }}
          />
        )}

        {chartCard(
          'Conformidade documental',
          <Bar
            data={{
              labels: complianceLabels,
              datasets: [
                {
                  label: 'Quantidade',
                  data: complianceValues,
                  backgroundColor: ['#22c55e', '#f59e0b', '#64748b', '#38bdf8', '#ef4444'],
                  borderRadius: 8,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(180,213,235,0.14)' } },
                x: { grid: { display: false } },
              },
            }}
          />
        )}

        {chartCard(
          'Serie semanal',
          <Bar
            data={{
              labels: weekLabels,
              datasets: [{ label: 'Atividades', data: weekValues, backgroundColor: '#6366f1', borderRadius: 8 }],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(180,213,235,0.14)' } },
                x: { grid: { display: false } },
              },
            }}
          />
        )}
      </div>
    </section>
  );
}
