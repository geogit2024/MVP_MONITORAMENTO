import React from 'react';
import type { FieldAgent, FieldTaskFiltersState } from '../types';

interface FieldTaskFiltersProps {
  filters: FieldTaskFiltersState;
  agents: FieldAgent[];
  onChange: (next: Partial<FieldTaskFiltersState>) => void;
  onApply: () => void;
  onClear: () => void;
}

export function FieldTaskFilters({ filters, agents, onChange, onApply, onClear }: FieldTaskFiltersProps) {
  return (
    <section className="dispatch-card dispatch-form-card">
      <h3>Filtros operacionais</h3>
      <div className="dispatch-grid-2">
        <label>
          Status
          <select value={filters.status} onChange={(e) => onChange({ status: e.target.value })}>
            <option value="">Todos</option>
            <option value="rascunho">Rascunho</option>
            <option value="despachada">Despachada</option>
            <option value="recebida">Recebida</option>
            <option value="aceita">Aceita</option>
            <option value="em_deslocamento">Em deslocamento</option>
            <option value="no_local">No local</option>
            <option value="em_execucao">Em execução</option>
            <option value="concluida">Concluída</option>
            <option value="recusada">Recusada</option>
            <option value="cancelada">Cancelada</option>
            <option value="erro_execucao">Erro execução</option>
          </select>
        </label>
        <label>
          Agente
          <select value={filters.agentId} onChange={(e) => onChange({ agentId: e.target.value })}>
            <option value="">Todos</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Prioridade
          <select value={filters.priority} onChange={(e) => onChange({ priority: e.target.value })}>
            <option value="">Todas</option>
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
            <option value="critica">Crítica</option>
          </select>
        </label>
        <label>
          Categoria
          <input
            type="text"
            value={filters.category}
            placeholder="ambiental, vistoria..."
            onChange={(e) => onChange({ category: e.target.value })}
          />
        </label>
        <label>
          De
          <input type="date" value={filters.dateFrom} onChange={(e) => onChange({ dateFrom: e.target.value })} />
        </label>
        <label>
          Até
          <input type="date" value={filters.dateTo} onChange={(e) => onChange({ dateTo: e.target.value })} />
        </label>
      </div>
      <div className="dispatch-grid-2">
        <button type="button" className="dispatch-button" onClick={onApply}>
          Aplicar filtros
        </button>
        <button type="button" className="dispatch-button ghost" onClick={onClear}>
          Limpar
        </button>
      </div>
    </section>
  );
}
