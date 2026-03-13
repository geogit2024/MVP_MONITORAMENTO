import React from 'react';

interface DispatchToolbarProps {
  creatingByMap: boolean;
  loading: boolean;
  loadingMessage: string;
  onToggleCreateByMap: (enabled: boolean) => void;
  onRefresh: () => void;
  onOpenMonthlyReport: () => void;
  onOpenFormBuilder: () => void;
}

export function DispatchToolbar({
  creatingByMap,
  loading,
  loadingMessage,
  onToggleCreateByMap,
  onRefresh,
  onOpenMonthlyReport,
  onOpenFormBuilder,
}: DispatchToolbarProps) {
  return (
    <section className="dispatch-card">
      <h3>Barra de despacho</h3>
      <div className="dispatch-grid-2 dispatch-toolbar-grid">
        <button
          type="button"
          className={`dispatch-button ${creatingByMap ? 'warn' : 'toolbar-create'}`}
          onClick={() => onToggleCreateByMap(!creatingByMap)}
        >
          {creatingByMap ? 'Cancelar ponto no mapa' : 'Criar atividade no mapa'}
        </button>
        <button
          type="button"
          className="dispatch-button toolbar-refresh"
          onClick={onRefresh}
          disabled={loading}
        >
          Atualizar
        </button>
        <button
          type="button"
          className="dispatch-button toolbar-report"
          onClick={onOpenMonthlyReport}
        >
          Relatório mensal
        </button>
        <button
          type="button"
          className="dispatch-button toolbar-builder"
          onClick={onOpenFormBuilder}
        >
          Construtor de formulários
        </button>
      </div>
      <p className="subtitle">
        {loading ? loadingMessage || 'Processando...' : 'Clique no mapa para definir localização da atividade.'}
      </p>
    </section>
  );
}
