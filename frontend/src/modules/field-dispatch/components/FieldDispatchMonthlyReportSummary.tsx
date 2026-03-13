import React from 'react';
import type { FieldDispatchMonthlyReportSummary as Summary } from '../types-monthly-report';

interface FieldDispatchMonthlyReportSummaryProps {
  summary: Summary;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatHours(value: number | null) {
  if (value === null || Number.isNaN(value)) return '--';
  return `${value.toFixed(1)} h`;
}

const KPI_ITEMS: Array<{ key: keyof Summary; label: string; formatter?: (value: number | null) => string }> = [
  { key: 'total', label: 'Total no periodo' },
  { key: 'completed', label: 'Concluidas' },
  { key: 'overdue', label: 'Em atraso' },
  { key: 'backlogEndOfMonth', label: 'Backlog fim do mes' },
  { key: 'completionRate', label: 'Taxa de conclusao', formatter: (value) => formatPercent(Number(value || 0)) },
  { key: 'overdueRate', label: 'Taxa de atraso', formatter: (value) => formatPercent(Number(value || 0)) },
  { key: 'formSubmissionRate', label: 'Formulario enviado', formatter: (value) => formatPercent(Number(value || 0)) },
  { key: 'evidenceRate', label: 'Com evidencia', formatter: (value) => formatPercent(Number(value || 0)) },
  { key: 'avgDispatchHours', label: 'Tempo medio despacho', formatter: formatHours },
  { key: 'avgCompletionHours', label: 'Tempo medio conclusao', formatter: formatHours },
  { key: 'cancellationRate', label: 'Taxa de cancelamento', formatter: (value) => formatPercent(Number(value || 0)) },
  { key: 'refusalRate', label: 'Taxa de recusa', formatter: (value) => formatPercent(Number(value || 0)) },
];

export function FieldDispatchMonthlyReportSummary({ summary }: FieldDispatchMonthlyReportSummaryProps) {
  return (
    <section className="dispatch-card monthly-report-section">
      <div className="monthly-report-section__header">
        <div>
          <h3>Resumo executivo</h3>
          <p className="subtitle">Indicadores consolidados do periodo filtrado.</p>
        </div>
      </div>

      <div className="monthly-report-summary-grid">
        {KPI_ITEMS.map((item) => {
          const raw = summary[item.key];
          const content = item.formatter ? item.formatter(raw as number | null) : String(raw ?? '--');
          return (
            <article key={item.key} className="monthly-report-kpi-card">
              <span>{item.label}</span>
              <strong>{content}</strong>
            </article>
          );
        })}
      </div>
    </section>
  );
}
