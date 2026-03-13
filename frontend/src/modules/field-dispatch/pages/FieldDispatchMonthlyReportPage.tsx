import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FieldDispatchMonthlyReportAI } from '../components/FieldDispatchMonthlyReportAI';
import { FieldDispatchMonthlyReportCharts } from '../components/FieldDispatchMonthlyReportCharts';
import { FieldDispatchMonthlyReportFilters } from '../components/FieldDispatchMonthlyReportFilters';
import { FieldDispatchMonthlyReportSummary } from '../components/FieldDispatchMonthlyReportSummary';
import { FieldDispatchMonthlyReportTable } from '../components/FieldDispatchMonthlyReportTable';
import { fieldDispatchMonthlyReportApi } from '../services/fieldDispatchMonthlyReportApi';
import type {
  FieldDispatchMonthlyReportFilterFormState,
  FieldDispatchMonthlyReportFilters as ApiFilters,
  FieldDispatchMonthlyReportResponse,
} from '../types-monthly-report';
import '../field-dispatch.css';

const DISPATCHER_CONTEXT = { role: 'despachante' as const, userId: 'dispatcher.web' };

function createDefaultFilters(): FieldDispatchMonthlyReportFilterFormState {
  const now = new Date();
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    timeBasis: 'createdAt',
    category: '',
    status: '',
    priority: '',
    agentId: '',
    createdBy: '',
    dueDateFrom: '',
    dueDateTo: '',
    overdueState: 'all',
    hasForm: '',
    formRequired: '',
    formSubmitted: '',
    hasEvidence: '',
    search: '',
  };
}

function parseBooleanFilter(value: '' | 'true' | 'false'): boolean | undefined {
  if (value === '') return undefined;
  return value === 'true';
}

function toApiFilters(form: FieldDispatchMonthlyReportFilterFormState): ApiFilters {
  return {
    month: form.month,
    year: form.year,
    timeBasis: form.timeBasis,
    category: form.category || undefined,
    status: form.status || undefined,
    priority: form.priority || undefined,
    agentId: form.agentId ? Number(form.agentId) : undefined,
    createdBy: form.createdBy || undefined,
    dueDateFrom: form.dueDateFrom || undefined,
    dueDateTo: form.dueDateTo || undefined,
    overdueState: form.overdueState,
    hasForm: parseBooleanFilter(form.hasForm),
    formRequired: parseBooleanFilter(form.formRequired),
    formSubmitted: parseBooleanFilter(form.formSubmitted),
    hasEvidence: parseBooleanFilter(form.hasEvidence),
    search: form.search || undefined,
  };
}

function formatMonthYear(month: number, year: number) {
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function csvEscape(value: string | number | boolean | null | undefined) {
  const raw = String(value ?? '');
  if (raw.includes(';') || raw.includes('"') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export default function FieldDispatchMonthlyReportPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<FieldDispatchMonthlyReportFilterFormState>(() => createDefaultFilters());
  const [report, setReport] = useState<FieldDispatchMonthlyReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiText, setAiText] = useState('');
  const [aiSource, setAiSource] = useState('');

  const loadInterpretation = useCallback(async (nextReport: FieldDispatchMonthlyReportResponse) => {
    if (!nextReport.rows.length) {
      setAiText('');
      setAiSource('');
      setAiError('');
      return;
    }

    try {
      setAiLoading(true);
      setAiError('');
      const response = await fieldDispatchMonthlyReportApi.interpretMonthlyReport(
        {
          filtersApplied: nextReport.filtersApplied,
          summary: nextReport.summary,
          breakdowns: nextReport.breakdowns,
        },
        DISPATCHER_CONTEXT
      );
      setAiText(response.interpretation);
      setAiSource(response.source);
    } catch (innerError: unknown) {
      setAiText('');
      setAiSource('');
      setAiError((innerError as Error)?.message || 'Falha ao interpretar relatorio.');
    } finally {
      setAiLoading(false);
    }
  }, []);

  const loadReport = useCallback(
    async (nextFilters: FieldDispatchMonthlyReportFilterFormState) => {
      try {
        setLoading(true);
        setError('');
        const response = await fieldDispatchMonthlyReportApi.getMonthlyReport(
          toApiFilters(nextFilters),
          DISPATCHER_CONTEXT
        );
        setReport(response);
        await loadInterpretation(response);
      } catch (requestError: unknown) {
        setError((requestError as Error)?.message || 'Falha ao carregar relatorio.');
        setReport(null);
        setAiText('');
        setAiSource('');
        setAiError('');
      } finally {
        setLoading(false);
      }
    },
    [loadInterpretation]
  );

  useEffect(() => {
    void loadReport(filters);
  }, [filters.month, filters.year, filters.timeBasis, loadReport]);

  const handleFilterChange = <K extends keyof FieldDispatchMonthlyReportFilterFormState>(
    key: K,
    nextValue: FieldDispatchMonthlyReportFilterFormState[K]
  ) => {
    setFilters((current) => ({ ...current, [key]: nextValue }));
  };

  const handleApply = () => {
    void loadReport(filters);
  };

  const handleReset = () => {
    const defaults = createDefaultFilters();
    setFilters(defaults);
    void loadReport(defaults);
  };

  const handleRefreshInterpretation = () => {
    if (!report) return;
    void loadInterpretation(report);
  };

  const exportCsv = () => {
    if (!report?.rows.length) return;
    const lines = [
      [
        'ID',
        'Titulo',
        'Categoria',
        'Prioridade',
        'Status',
        'Responsavel',
        'Criado em',
        'Prazo',
        'Concluido em',
        'SLA',
        'Formulario enviado',
        'Evidencia',
      ].join(';'),
      ...report.rows.map((row) =>
        [
          row.id,
          csvEscape(row.title),
          csvEscape(row.category),
          csvEscape(row.priority),
          csvEscape(row.status),
          csvEscape(row.agentName || ''),
          csvEscape(row.createdAt),
          csvEscape(row.dueDate),
          csvEscape(row.completedAt),
          csvEscape(row.overdueState),
          row.formSubmitted ? 'sim' : 'nao',
          row.hasEvidence ? 'sim' : 'nao',
        ].join(';')
      ),
    ];

    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio-despacho-${filters.year}-${String(filters.month).padStart(2, '0')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const heroMeta = useMemo(() => {
    if (!report) return 'Sem dados carregados';
    return `${report.summary.total} atividade(s) no recorte de ${formatMonthYear(filters.month, filters.year)}`;
  }, [filters.month, filters.year, report]);

  return (
    <div className="field-dispatch-layout field-forms-layout monthly-report-page">
      <aside className="field-dispatch-sidebar field-forms-sidebar monthly-report-sidebar">
        <FieldDispatchMonthlyReportFilters
          value={filters}
          availableFilters={report?.availableFilters}
          loading={loading}
          onChange={handleFilterChange}
          onApply={handleApply}
          onReset={handleReset}
          onBack={() => navigate('/field-dispatch')}
        />
      </aside>

      <main className="field-dispatch-main monthly-report-main">
        <section className="form-builder-hero monthly-report-hero">
          <div>
            <span className="form-builder-hero__eyebrow">Despacho em Campo</span>
            <h3>Relatorio mensal de atividades</h3>
            <p>Analise operacional consolidada com filtros estruturais, graficos analiticos e leitura assistida por IA.</p>
          </div>
          <div className="form-builder-hero__meta">
            <span>{heroMeta}</span>
            <span>Base temporal: {filters.timeBasis}</span>
          </div>
        </section>

        {error ? <div className="floating-toast">{error}</div> : null}

        {loading && !report ? (
          <section className="dispatch-card monthly-report-section">
            <p className="subtitle">Carregando relatorio mensal...</p>
          </section>
        ) : null}

        {report ? (
          <>
            <FieldDispatchMonthlyReportSummary summary={report.summary} />
            <FieldDispatchMonthlyReportCharts report={report} />
            <FieldDispatchMonthlyReportAI
              interpretation={aiText}
              source={aiSource}
              loading={aiLoading}
              error={aiError}
              onRefresh={handleRefreshInterpretation}
            />
            <FieldDispatchMonthlyReportTable rows={report.rows} onExportCsv={exportCsv} />
          </>
        ) : null}
      </main>
    </div>
  );
}
