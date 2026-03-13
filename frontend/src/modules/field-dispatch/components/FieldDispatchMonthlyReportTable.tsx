import React, { useMemo, useState } from 'react';
import { FIELD_TASK_STATUS_LABEL } from '../types';
import type { FieldDispatchMonthlyReportRow } from '../types-monthly-report';

interface FieldDispatchMonthlyReportTableProps {
  rows: FieldDispatchMonthlyReportRow[];
  onExportCsv: () => void;
}

type SortKey =
  | 'id'
  | 'title'
  | 'category'
  | 'priority'
  | 'status'
  | 'agentName'
  | 'createdAt'
  | 'dueDate'
  | 'completedAt'
  | 'overdueState';

const PAGE_SIZE = 10;

function formatDate(value: string | null | undefined) {
  if (!value) return '--';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR');
}

function formatOverdueState(value: FieldDispatchMonthlyReportRow['overdueState']) {
  switch (value) {
    case 'overdue':
      return 'Em atraso';
    case 'on_time':
      return 'No prazo';
    case 'no_due_date':
      return 'Sem prazo';
    default:
      return 'Aberta no prazo';
  }
}

function normalizeSortValue(row: FieldDispatchMonthlyReportRow, sortKey: SortKey): string | number {
  const value = row[sortKey];
  if (sortKey === 'createdAt' || sortKey === 'dueDate' || sortKey === 'completedAt') {
    return value ? new Date(value as string).getTime() : 0;
  }
  if (sortKey === 'id') return row.id;
  return String(value || '').toLowerCase();
}

export function FieldDispatchMonthlyReportTable({
  rows,
  onExportCsv,
}: FieldDispatchMonthlyReportTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const sortedRows = useMemo(() => {
    return [...rows].sort((left, right) => {
      const leftValue = normalizeSortValue(left, sortKey);
      const rightValue = normalizeSortValue(right, sortKey);
      if (leftValue < rightValue) return sortDirection === 'asc' ? -1 : 1;
      if (leftValue > rightValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [rows, sortDirection, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const currentRows = sortedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleSort = (nextKey: SortKey) => {
    setPage(1);
    setSortDirection((currentDirection) =>
      sortKey === nextKey ? (currentDirection === 'asc' ? 'desc' : 'asc') : 'desc'
    );
    setSortKey(nextKey);
  };

  const renderSortButton = (label: string, key: SortKey) => (
    <button type="button" className="monthly-report-table__sort" onClick={() => handleSort(key)}>
      {label}
      {sortKey === key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
    </button>
  );

  return (
    <section className="dispatch-card monthly-report-section">
      <div className="monthly-report-section__header">
        <div>
          <h3>Tabela detalhada</h3>
          <p className="subtitle">Mesma base filtrada dos graficos e KPIs, com ordenacao e paginacao simples.</p>
        </div>
        <button type="button" className="dispatch-button ghost" onClick={onExportCsv}>
          Exportar CSV
        </button>
      </div>

      <div className="monthly-report-table-wrapper">
        <table className="monthly-report-table">
          <thead>
            <tr>
              <th>{renderSortButton('ID', 'id')}</th>
              <th>{renderSortButton('Titulo', 'title')}</th>
              <th>{renderSortButton('Categoria', 'category')}</th>
              <th>{renderSortButton('Prioridade', 'priority')}</th>
              <th>{renderSortButton('Status', 'status')}</th>
              <th>{renderSortButton('Responsavel', 'agentName')}</th>
              <th>{renderSortButton('Criado em', 'createdAt')}</th>
              <th>{renderSortButton('Prazo', 'dueDate')}</th>
              <th>{renderSortButton('Concluido em', 'completedAt')}</th>
              <th>{renderSortButton('SLA', 'overdueState')}</th>
              <th>Formulario</th>
              <th>Evidencia</th>
            </tr>
          </thead>
          <tbody>
            {currentRows.length ? (
              currentRows.map((row) => (
                <tr key={row.id}>
                  <td>#{row.id}</td>
                  <td>{row.title}</td>
                  <td>{row.category}</td>
                  <td>{row.priority}</td>
                  <td>{FIELD_TASK_STATUS_LABEL[row.status] || row.status}</td>
                  <td>{row.agentName || '--'}</td>
                  <td>{formatDate(row.createdAt)}</td>
                  <td>{formatDate(row.dueDate)}</td>
                  <td>{formatDate(row.completedAt)}</td>
                  <td>{formatOverdueState(row.overdueState)}</td>
                  <td>{row.hasForm ? (row.formSubmitted ? 'Enviado' : 'Pendente') : 'Sem formulario'}</td>
                  <td>{row.hasEvidence ? 'Sim' : 'Nao'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={12} className="monthly-report-table__empty">
                  Nenhuma atividade encontrada para os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="monthly-report-table__footer">
        <span>
          Pagina {currentPage} de {totalPages}
        </span>
        <div className="monthly-report-table__pagination">
          <button
            type="button"
            className="dispatch-button ghost"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={currentPage <= 1}
          >
            Anterior
          </button>
          <button
            type="button"
            className="dispatch-button ghost"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={currentPage >= totalPages}
          >
            Proxima
          </button>
        </div>
      </div>
    </section>
  );
}
