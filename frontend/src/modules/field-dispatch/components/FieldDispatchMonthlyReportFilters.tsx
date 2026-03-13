import React from 'react';
import type {
  FieldDispatchMonthlyReportAvailableFilters,
  FieldDispatchMonthlyReportFilterFormState,
} from '../types-monthly-report';
import { FIELD_TASK_STATUS_LABEL } from '../types';

interface FieldDispatchMonthlyReportFiltersProps {
  value: FieldDispatchMonthlyReportFilterFormState;
  availableFilters?: FieldDispatchMonthlyReportAvailableFilters;
  loading: boolean;
  onChange: <K extends keyof FieldDispatchMonthlyReportFilterFormState>(
    key: K,
    nextValue: FieldDispatchMonthlyReportFilterFormState[K]
  ) => void;
  onApply: () => void;
  onReset: () => void;
  onBack: () => void;
}

const MONTH_LABELS = [
  'Janeiro',
  'Fevereiro',
  'Marco',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const TIME_BASIS_OPTIONS = [
  { value: 'createdAt', label: 'Criacao' },
  { value: 'dispatchedAt', label: 'Despacho' },
  { value: 'completedAt', label: 'Conclusao' },
  { value: 'updatedAt', label: 'Ultima atualizacao' },
] as const;

const BOOLEAN_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'true', label: 'Sim' },
  { value: 'false', label: 'Nao' },
];

export function FieldDispatchMonthlyReportFilters({
  value,
  availableFilters,
  loading,
  onChange,
  onApply,
  onReset,
  onBack,
}: FieldDispatchMonthlyReportFiltersProps) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, index) => currentYear - index);

  return (
    <section className="dispatch-card monthly-report-filter-card">
      <div className="monthly-report-sidebar__header">
        <div>
          <span className="form-builder-brand__eyebrow">Analytics operacional</span>
          <h2>Relatorio mensal</h2>
          <p className="subtitle">
            KPIs, SLA, conformidade documental e interpretacao assistida por IA.
          </p>
        </div>
      </div>

      <div className="monthly-report-filter-grid">
        <label>
          Mes
          <select value={value.month} onChange={(event) => onChange('month', Number(event.target.value))}>
            {MONTH_LABELS.map((label, index) => (
              <option key={label} value={index + 1}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Ano
          <select value={value.year} onChange={(event) => onChange('year', Number(event.target.value))}>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>

        <label>
          Base temporal
          <select
            value={value.timeBasis}
            onChange={(event) =>
              onChange('timeBasis', event.target.value as FieldDispatchMonthlyReportFilterFormState['timeBasis'])
            }
          >
            {TIME_BASIS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Categoria
          <select value={value.category} onChange={(event) => onChange('category', event.target.value)}>
            <option value="">Todas</option>
            {(availableFilters?.categories || []).map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label>
          Status
          <select
            value={value.status}
            onChange={(event) =>
              onChange('status', event.target.value as FieldDispatchMonthlyReportFilterFormState['status'])
            }
          >
            <option value="">Todos</option>
            {(availableFilters?.statuses || []).map((status) => (
              <option key={status} value={status}>
                {FIELD_TASK_STATUS_LABEL[status as keyof typeof FIELD_TASK_STATUS_LABEL] || status}
              </option>
            ))}
          </select>
        </label>

        <label>
          Prioridade
          <select
            value={value.priority}
            onChange={(event) =>
              onChange('priority', event.target.value as FieldDispatchMonthlyReportFilterFormState['priority'])
            }
          >
            <option value="">Todas</option>
            {(availableFilters?.priorities || []).map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </label>

        <label>
          Responsavel
          <select value={value.agentId} onChange={(event) => onChange('agentId', event.target.value)}>
            <option value="">Todos</option>
            {(availableFilters?.agents || []).map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Criado por
          <select value={value.createdBy} onChange={(event) => onChange('createdBy', event.target.value)}>
            <option value="">Todos</option>
            {(availableFilters?.creators || []).map((creator) => (
              <option key={creator} value={creator}>
                {creator}
              </option>
            ))}
          </select>
        </label>

        <label>
          Prazo de
          <input type="date" value={value.dueDateFrom} onChange={(event) => onChange('dueDateFrom', event.target.value)} />
        </label>

        <label>
          Prazo ate
          <input type="date" value={value.dueDateTo} onChange={(event) => onChange('dueDateTo', event.target.value)} />
        </label>

        <label>
          SLA
          <select
            value={value.overdueState}
            onChange={(event) =>
              onChange(
                'overdueState',
                event.target.value as FieldDispatchMonthlyReportFilterFormState['overdueState']
              )
            }
          >
            <option value="all">Todos</option>
            <option value="overdue">Em atraso</option>
            <option value="on_time">No prazo</option>
            <option value="no_due_date">Sem prazo</option>
          </select>
        </label>

        <label>
          Com formulario
          <select
            value={value.hasForm}
            onChange={(event) =>
              onChange('hasForm', event.target.value as FieldDispatchMonthlyReportFilterFormState['hasForm'])
            }
          >
            {BOOLEAN_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Formulario obrigatorio
          <select
            value={value.formRequired}
            onChange={(event) =>
              onChange(
                'formRequired',
                event.target.value as FieldDispatchMonthlyReportFilterFormState['formRequired']
              )
            }
          >
            {BOOLEAN_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Formulario enviado
          <select
            value={value.formSubmitted}
            onChange={(event) =>
              onChange(
                'formSubmitted',
                event.target.value as FieldDispatchMonthlyReportFilterFormState['formSubmitted']
              )
            }
          >
            {BOOLEAN_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Com evidencia
          <select
            value={value.hasEvidence}
            onChange={(event) =>
              onChange(
                'hasEvidence',
                event.target.value as FieldDispatchMonthlyReportFilterFormState['hasEvidence']
              )
            }
          >
            {BOOLEAN_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="monthly-report-filter-grid__full">
          Busca textual
          <input
            type="text"
            value={value.search}
            placeholder="Titulo, descricao ou referencia..."
            onChange={(event) => onChange('search', event.target.value)}
          />
        </label>
      </div>

      <div className="dispatch-grid-3 monthly-report-filter-actions">
        <button type="button" className="dispatch-button toolbar-refresh" onClick={onApply} disabled={loading}>
          {loading ? 'Atualizando...' : 'Aplicar filtros'}
        </button>
        <button type="button" className="dispatch-button ghost" onClick={onReset} disabled={loading}>
          Resetar
        </button>
        <button type="button" className="dispatch-button toolbar-builder" onClick={onBack}>
          Voltar despacho
        </button>
      </div>
    </section>
  );
}
