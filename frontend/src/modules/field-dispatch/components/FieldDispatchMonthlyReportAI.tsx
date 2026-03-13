import React from 'react';

interface FieldDispatchMonthlyReportAIProps {
  interpretation: string;
  source?: string;
  loading: boolean;
  error: string;
  onRefresh: () => void;
}

export function FieldDispatchMonthlyReportAI({
  interpretation,
  source,
  loading,
  error,
  onRefresh,
}: FieldDispatchMonthlyReportAIProps) {
  return (
    <section className="dispatch-card monthly-report-section monthly-report-ai-card">
      <div className="monthly-report-section__header">
        <div>
          <h3>Interpretacao por IA</h3>
          <p className="subtitle">Leitura objetiva dos agregados do periodo, sem extrapolar os dados calculados.</p>
        </div>
        <button type="button" className="dispatch-button toolbar-refresh" onClick={onRefresh} disabled={loading}>
          {loading ? 'Interpretando...' : 'Atualizar leitura'}
        </button>
      </div>

      {error ? <div className="monthly-report-ai__error">{error}</div> : null}

      <div className="monthly-report-ai__body">
        {interpretation ? (
          <p>{interpretation}</p>
        ) : (
          <p className="subtitle">Sem interpretacao disponivel para o conjunto atual.</p>
        )}
      </div>

      {source ? <span className="monthly-report-ai__source">Fonte: {source}</span> : null}
    </section>
  );
}
