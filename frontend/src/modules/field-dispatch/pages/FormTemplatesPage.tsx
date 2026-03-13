import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fieldDispatchApi } from '../services/fieldDispatchApi';
import type { FormTemplate, FormTemplateStatus } from '../types';

const DISPATCHER_CONTEXT = { role: 'despachante' as const, userId: 'dispatcher.web' };
const TEMPLATE_STATUS_LABEL: Record<FormTemplateStatus, string> = {
  draft: 'Rascunho',
  published: 'Publicado',
  archived: 'Arquivado',
};

export default function FormTemplatesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<FormTemplate[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fieldDispatchApi.listFormTemplates(
        { status: statusFilter || undefined, search: search || undefined },
        DISPATCHER_CONTEXT
      );
      setItems(response.items);
      setFeedback('');
    } catch (error: unknown) {
      setFeedback((error as Error)?.message || 'Falha ao carregar templates.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const byStatus = useMemo(() => {
    return items.reduce<Record<FormTemplateStatus, number>>(
      (acc, template) => {
        acc[template.status] += 1;
        return acc;
      },
      { draft: 0, published: 0, archived: 0 }
    );
  }, [items]);

  const runAction = async (action: () => Promise<unknown>, successText: string) => {
    try {
      setLoading(true);
      await action();
      setFeedback(successText);
      await load();
    } catch (error: unknown) {
      setFeedback((error as Error)?.message || 'Operação falhou.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="field-dispatch-layout field-forms-layout form-templates-page">
      <aside className="field-dispatch-sidebar field-forms-sidebar form-templates-sidebar">
        <div className="form-builder-brand">
          <span className="form-builder-brand__eyebrow">Orquestração de Campo</span>
          <h2>Construtor de Formulários</h2>
          <p className="subtitle">
            Crie, versione e publique formulários dinâmicos para atividades em campo.
          </p>
        </div>

        <section className="dispatch-card form-builder-card">
          <h3>Filtros</h3>
          <div className="form-builder-filter-stack">
            <label>
              Busca
              <input
                type="text"
                value={search}
                placeholder="Nome do template..."
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label>
              Status
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">Todos</option>
                <option value="draft">Rascunho</option>
                <option value="published">Publicado</option>
                <option value="archived">Arquivado</option>
              </select>
            </label>
          </div>
          <div className="dispatch-grid-2 form-builder-filter-actions">
            <button
              type="button"
              className="dispatch-button toolbar-refresh"
              onClick={() => void load()}
              disabled={loading}
            >
              Buscar
            </button>
            <button
              type="button"
              className="dispatch-button ghost"
              onClick={() => navigate('/field-dispatch')}
            >
              Voltar despacho
            </button>
          </div>
        </section>

        <section className="dispatch-card form-builder-card">
          <h3>Resumo</h3>
          <div className="form-builder-stats">
            <article className="form-builder-stat-card">
              <span className="form-builder-stat-card__label">Rascunhos</span>
              <strong>{byStatus.draft}</strong>
            </article>
            <article className="form-builder-stat-card">
              <span className="form-builder-stat-card__label">Publicados</span>
              <strong>{byStatus.published}</strong>
            </article>
            <article className="form-builder-stat-card">
              <span className="form-builder-stat-card__label">Arquivados</span>
              <strong>{byStatus.archived}</strong>
            </article>
          </div>
        </section>

        <button
          type="button"
          className="dispatch-button success form-builder-create-button"
          onClick={() => navigate('/field-dispatch/forms/new')}
        >
          Novo template
        </button>
      </aside>

      <main className="field-dispatch-main form-builder-main">
        <section className="form-builder-hero">
          <div>
            <span className="form-builder-hero__eyebrow">Biblioteca de templates</span>
            <h3>Governança de formulários operacionais</h3>
            <p>
              Centralize versões, publique novas estruturas de coleta e mantenha rastreabilidade
              das mudanças por template.
            </p>
          </div>
          <div className="form-builder-hero__meta">
            <span>{loading ? 'Atualizando lista...' : `${items.length} template(s) encontrados`}</span>
            <span>{statusFilter ? `Filtro: ${TEMPLATE_STATUS_LABEL[statusFilter as FormTemplateStatus]}` : 'Filtro: todos'}</span>
          </div>
        </section>

        <section className="dispatch-card form-builder-list-card">
          <div className="form-builder-list-header">
            <div>
              <h3>Templates</h3>
              <p className="subtitle">Selecione um item para editar, duplicar, publicar ou arquivar.</p>
            </div>
            <span className="form-builder-list-count">{items.length}</span>
          </div>

          {items.length === 0 ? (
            <div className="form-builder-empty-state">
              <strong>Nenhum template encontrado.</strong>
              <p>Ajuste os filtros ou crie um novo template para iniciar a biblioteca.</p>
            </div>
          ) : (
            <div className="form-template-grid">
              {items.map((template) => (
                <article key={template.id} className="form-template-card">
                  <div className="form-template-card__header">
                    <div>
                      <h4>{template.name}</h4>
                      <p className="subtitle">Template #{template.id}</p>
                    </div>
                    <span className={`form-template-status-pill is-${template.status}`}>
                      {TEMPLATE_STATUS_LABEL[template.status]}
                    </span>
                  </div>

                  <div className="form-template-card__metrics">
                    <div className="form-template-metric">
                      <span>Versão ativa</span>
                      <strong>v{template.activeVersion ?? '-'}</strong>
                    </div>
                    <div className="form-template-metric">
                      <span>Última versão</span>
                      <strong>v{template.latestVersion ?? '-'}</strong>
                    </div>
                  </div>

                  <div className="form-template-card__actions">
                    <button
                      type="button"
                      className="dispatch-button toolbar-refresh"
                      onClick={() => navigate(`/field-dispatch/forms/${template.id}`)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="dispatch-button ghost"
                      onClick={() =>
                        void runAction(
                          () => fieldDispatchApi.duplicateFormTemplate(template.id, DISPATCHER_CONTEXT),
                          'Template duplicado.'
                        )
                      }
                    >
                      Duplicar
                    </button>
                    <button
                      type="button"
                      className="dispatch-button warn"
                      disabled={template.status === 'published' && template.activeVersion === template.latestVersion}
                      onClick={() =>
                        void runAction(
                          () => fieldDispatchApi.publishFormTemplate(template.id, DISPATCHER_CONTEXT),
                          'Template publicado.'
                        )
                      }
                    >
                      Publicar
                    </button>
                    <button
                      type="button"
                      className="dispatch-button danger"
                      disabled={template.status === 'archived'}
                      onClick={() =>
                        void runAction(
                          () => fieldDispatchApi.archiveFormTemplate(template.id, DISPATCHER_CONTEXT),
                          'Template arquivado.'
                        )
                      }
                    >
                      Arquivar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {feedback ? <div className="floating-toast">{feedback}</div> : null}
      </main>
    </div>
  );
}
