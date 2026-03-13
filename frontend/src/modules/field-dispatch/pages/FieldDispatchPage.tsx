import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DispatchToolbar } from '../components/DispatchToolbar';
import {
  FieldDispatchDockablePanel,
  type DockablePanelPosition,
  type DockablePanelSize,
} from '../components/FieldDispatchDockablePanel';
import { FieldTaskFilters } from '../components/FieldTaskFilters';
import { FieldTaskForm } from '../components/FieldTaskForm';
import { FieldTaskList } from '../components/FieldTaskList';
import { FieldTaskMap } from '../components/FieldTaskMap';
import { FieldTaskDetailsDrawer } from '../components/FieldTaskDetailsDrawer';
import { FieldTaskAnalyticsPanel } from '../components/FieldTaskAnalyticsPanel';
import { useFieldDispatch } from '../hooks/useFieldDispatch';
import '../field-dispatch.css';
import type { CreateFieldTaskPayload, FieldTaskStatus, UpdateFieldTaskPayload } from '../types';

const PANEL_FLOAT_MARGIN = 12;
const FIELD_DISPATCH_HELP_IMAGE_URL = '/help/O%20SISTEMA.png';
const FIELD_DISPATCH_PANEL_LAYOUT_STORAGE_KEY = 'field-dispatch.panel-layout.v1';

type DockablePanelId = 'sidebar' | 'details' | 'analytics';

type DockablePanelState = {
  detached: boolean;
  width: number;
  height: number;
  x: number;
  y: number;
};

const PANEL_DEFAULT_STATE: Record<DockablePanelId, DockablePanelState> = {
  sidebar: {
    detached: false,
    width: 420,
    height: 860,
    x: 0,
    y: 0,
  },
  details: {
    detached: false,
    width: 860,
    height: 360,
    x: 24,
    y: 24,
  },
  analytics: {
    detached: false,
    width: 560,
    height: 360,
    x: 120,
    y: 72,
  },
};

const PANEL_MIN_WIDTH: Record<DockablePanelId, number> = {
  sidebar: 320,
  details: 420,
  analytics: 360,
};

const PANEL_MIN_HEIGHT: Record<DockablePanelId, number> = {
  sidebar: 320,
  details: 260,
  analytics: 260,
};

const isDockablePanelId = (value: string): value is DockablePanelId =>
  value === 'sidebar' || value === 'details' || value === 'analytics';

const loadStoredPanelState = (): Record<DockablePanelId, DockablePanelState> => {
  if (typeof window === 'undefined') {
    return PANEL_DEFAULT_STATE;
  }

  try {
    const rawValue = window.localStorage.getItem(FIELD_DISPATCH_PANEL_LAYOUT_STORAGE_KEY);
    if (!rawValue) {
      return PANEL_DEFAULT_STATE;
    }

    const parsed = JSON.parse(rawValue) as Partial<Record<DockablePanelId, Partial<DockablePanelState>>>;
    const merged = { ...PANEL_DEFAULT_STATE };

    (Object.keys(parsed) as string[]).forEach((panelId) => {
      if (!isDockablePanelId(panelId)) return;
      const candidate = parsed[panelId];
      if (!candidate) return;

      merged[panelId] = {
        ...PANEL_DEFAULT_STATE[panelId],
        detached: typeof candidate.detached === 'boolean' ? candidate.detached : PANEL_DEFAULT_STATE[panelId].detached,
        width: Number.isFinite(candidate.width) ? Number(candidate.width) : PANEL_DEFAULT_STATE[panelId].width,
        height: Number.isFinite(candidate.height) ? Number(candidate.height) : PANEL_DEFAULT_STATE[panelId].height,
        x: Number.isFinite(candidate.x) ? Number(candidate.x) : PANEL_DEFAULT_STATE[panelId].x,
        y: Number.isFinite(candidate.y) ? Number(candidate.y) : PANEL_DEFAULT_STATE[panelId].y,
      };
    });

    return merged;
  } catch {
    return PANEL_DEFAULT_STATE;
  }
};

export default function FieldDispatchPage() {
  const navigate = useNavigate();
  const { state, selectedTask, actions } = useFieldDispatch();
  const [toast, setToast] = useState<string>('');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [draftAddressReference, setDraftAddressReference] = useState('');
  const [panelState, setPanelState] = useState<Record<DockablePanelId, DockablePanelState>>(() => loadStoredPanelState());
  const [activeFloatingPanel, setActiveFloatingPanel] = useState<DockablePanelId>('sidebar');
  const [mapResizeToken, setMapResizeToken] = useState(0);

  const mainRef = useRef<HTMLElement | null>(null);

  const selectedTracking = useMemo(() => {
    if (!state.selectedTaskId) return undefined;
    return state.trackingByTaskId[state.selectedTaskId];
  }, [state.selectedTaskId, state.trackingByTaskId]);

  const getWorkspaceBounds = useCallback(() => {
    const containerWidth = mainRef.current?.clientWidth || window.innerWidth;
    const containerHeight = mainRef.current?.clientHeight || window.innerHeight;

    return {
      width: Math.max(0, containerWidth - PANEL_FLOAT_MARGIN * 2),
      height: Math.max(0, containerHeight - PANEL_FLOAT_MARGIN * 2),
    };
  }, []);

  const clampPanelState = useCallback(
    (panelId: DockablePanelId, nextState: DockablePanelState): DockablePanelState => {
      const { width: containerWidth, height: containerHeight } = getWorkspaceBounds();
      const minWidth = PANEL_MIN_WIDTH[panelId];
      const minHeight = PANEL_MIN_HEIGHT[panelId];
      const maxWidth = Math.max(minWidth, containerWidth);
      const maxHeight = Math.max(minHeight, containerHeight);
      const width = Math.min(Math.max(nextState.width, minWidth), maxWidth);
      const height = Math.min(Math.max(nextState.height, minHeight), maxHeight);
      const maxX = Math.max(0, containerWidth - width);
      const maxY = Math.max(0, containerHeight - height);

      return {
        ...nextState,
        width,
        height,
        x: Math.min(Math.max(nextState.x, 0), maxX),
        y: Math.min(Math.max(nextState.y, 0), maxY),
      };
    },
    [getWorkspaceBounds]
  );

  const getAnchoredPositionForState = useCallback(
    (
      panelId: DockablePanelId,
      currentState: Record<DockablePanelId, DockablePanelState>
    ): DockablePanelPosition => {
      const { width: containerWidth, height: containerHeight } = getWorkspaceBounds();

      if (panelId === 'sidebar') {
        return { x: 0, y: 0 };
      }

      if (panelId === 'details') {
        const leftOffset = currentState.sidebar.detached
          ? 0
          : Math.min(
              currentState.sidebar.width + PANEL_FLOAT_MARGIN,
              Math.max(0, containerWidth - currentState.details.width)
            );

        return {
          x: leftOffset,
          y: Math.max(0, containerHeight - currentState.details.height),
        };
      }

      return {
        x: Math.max(0, containerWidth - currentState.analytics.width),
        y: Math.max(0, containerHeight - currentState.analytics.height),
      };
    },
    [getWorkspaceBounds]
  );

  const updatePanelState = useCallback(
    (panelId: DockablePanelId, updater: (current: DockablePanelState) => DockablePanelState) => {
      setPanelState((current) => {
        const nextPanelState = clampPanelState(panelId, updater(current[panelId]));
        const currentPanelState = current[panelId];
        if (
          nextPanelState.detached === currentPanelState.detached &&
          nextPanelState.width === currentPanelState.width &&
          nextPanelState.height === currentPanelState.height &&
          nextPanelState.x === currentPanelState.x &&
          nextPanelState.y === currentPanelState.y
        ) {
          return current;
        }

        return {
          ...current,
          [panelId]: nextPanelState,
        };
      });
    },
    [clampPanelState]
  );

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 4200);
  };

  const runAndNotify = async (action: () => Promise<unknown>, successMessage: string) => {
    try {
      await action();
      notify(successMessage);
      actions.requestRefresh();
    } catch (error: unknown) {
      notify((error as Error)?.message || 'Operacao falhou.');
    }
  };

  const handleCreateTask = async (payload: CreateFieldTaskPayload) => {
    await runAndNotify(async () => {
      await actions.createTask(payload);
      actions.setCreatingByMap(false);
      actions.setDraftGeometry(null);
      setDraftAddressReference('');
    }, payload.initialStatus === 'despachada' ? 'Atividade despachada com sucesso.' : 'Rascunho salvo.');
  };

  const handleUpdateTask = async (taskId: number, payload: UpdateFieldTaskPayload) => {
    await runAndNotify(() => actions.updateTask(taskId, payload), 'Atividade atualizada.');
  };

  const handleDispatch = async (taskId: number) => {
    await runAndNotify(() => actions.dispatchTask(taskId), 'Atividade despachada.');
  };

  const handleStatus = async (taskId: number, status: FieldTaskStatus, note?: string) => {
    await runAndNotify(() => actions.updateTaskStatus(taskId, status, note), 'Status atualizado.');
  };

  const handleReassign = async (taskId: number, assignedAgentId: number, note: string) => {
    await runAndNotify(() => actions.reassignTask(taskId, assignedAgentId, note), 'Atividade reatribuida.');
  };

  const handleCancel = async (taskId: number, note: string) => {
    await runAndNotify(() => actions.cancelTask(taskId, note), 'Atividade cancelada.');
  };

  useEffect(() => {
    const mainElement = mainRef.current;
    if (!mainElement || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      setPanelState((current) => ({
        sidebar: clampPanelState('sidebar', current.sidebar),
        details: clampPanelState('details', current.details),
        analytics: clampPanelState('analytics', current.analytics),
      }));
      setMapResizeToken((current) => current + 1);
    });

    observer.observe(mainElement);
    return () => observer.disconnect();
  }, [clampPanelState]);

  useEffect(() => {
    setPanelState((current) => ({
      sidebar: clampPanelState('sidebar', current.sidebar),
      details: clampPanelState('details', current.details),
      analytics: clampPanelState('analytics', current.analytics),
    }));
  }, [clampPanelState]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      FIELD_DISPATCH_PANEL_LAYOUT_STORAGE_KEY,
      JSON.stringify(panelState)
    );
  }, [panelState]);

  const handlePanelFocus = (panelId: DockablePanelId) => {
    setActiveFloatingPanel(panelId);
  };

  const togglePanelDetached = (panelId: DockablePanelId) => {
    setPanelState((current) => {
      const currentPanelState = current[panelId];
      const nextDetached = !currentPanelState.detached;
      const anchoredPosition = getAnchoredPositionForState(panelId, current);

      return {
        ...current,
        [panelId]: clampPanelState(panelId, {
          ...currentPanelState,
          detached: nextDetached,
          x: nextDetached ? anchoredPosition.x : currentPanelState.x,
          y: nextDetached ? anchoredPosition.y : currentPanelState.y,
        }),
      };
    });
    setActiveFloatingPanel(panelId);
  };

  const handlePanelPositionChange = (panelId: DockablePanelId, position: DockablePanelPosition) => {
    updatePanelState(panelId, (current) => ({
      ...current,
      x: position.x,
      y: position.y,
    }));
  };

  const handlePanelSizeChange = (panelId: DockablePanelId, size: DockablePanelSize) => {
    updatePanelState(panelId, (current) => ({
      ...current,
      width: size.width,
      height: size.height,
    }));
  };

  const sidebarPanelPosition = panelState.sidebar.detached
    ? panelState.sidebar
    : getAnchoredPositionForState('sidebar', panelState);
  const analyticsPanelPosition = panelState.analytics.detached
    ? panelState.analytics
    : getAnchoredPositionForState('analytics', panelState);
  const hasDraftPoint = Boolean(state.draftGeometry);
  const showTaskForm = Boolean(selectedTask || hasDraftPoint);
  const showDetailsPanel = Boolean(selectedTask);
  const detailsPanelPosition = panelState.details.detached
    ? panelState.details
    : getAnchoredPositionForState('details', panelState);

  return (
    <div className="field-dispatch-layout">
      <main ref={mainRef} className="field-dispatch-main field-dispatch-main--floating-workspace">
        <FieldTaskMap
          tasks={state.tasks}
          agents={state.agents}
          selectedTaskId={state.selectedTaskId}
          creatingByMap={state.creatingByMap}
          draftGeometry={state.draftGeometry}
          resizeToken={mapResizeToken}
          onMapPointSelected={(geometry) => {
            setDraftAddressReference('');
            actions.setDraftGeometry(geometry);
          }}
          onAddressSearchSelect={({ geometry, formattedAddress }) => {
            setDraftAddressReference(formattedAddress);
            actions.setDraftGeometry(geometry);
          }}
          onTaskSelect={actions.selectTask}
        />

        <div className="field-dispatch-floating-layer">
          <FieldDispatchDockablePanel
            title="Gestao e Despacho em Campo"
            detached={panelState.sidebar.detached}
            size={panelState.sidebar}
            position={sidebarPanelPosition}
            minWidth={PANEL_MIN_WIDTH.sidebar}
            minHeight={PANEL_MIN_HEIGHT.sidebar}
            zIndex={activeFloatingPanel === 'sidebar' ? 1700 : 1450}
            onFocus={() => handlePanelFocus('sidebar')}
            onToggleDetached={() => togglePanelDetached('sidebar')}
            onPositionChange={(position) => handlePanelPositionChange('sidebar', position)}
            onSizeChange={(size) => handlePanelSizeChange('sidebar', size)}
            headerActions={
              <button
                type="button"
                className="dispatch-button ghost"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => setIsHelpOpen(true)}
              >
                Help
              </button>
            }
          >
            <div className="field-dispatch-sidebar-panel-content">
              <p className="subtitle">
                Fluxo operacional: criacao, despacho, aceite, deslocamento, execucao e conclusao.
              </p>

              <DispatchToolbar
                creatingByMap={state.creatingByMap}
                loading={state.loading}
                loadingMessage={state.loadingMessage}
                onToggleCreateByMap={actions.setCreatingByMap}
                onRefresh={actions.requestRefresh}
                onOpenMonthlyReport={() => navigate('/field-dispatch/reports/monthly')}
                onOpenFormBuilder={() => navigate('/field-dispatch/forms')}
              />

              {showTaskForm ? (
                <FieldTaskForm
                  agents={state.agents}
                  draftGeometry={state.draftGeometry}
                  draftAddressReference={draftAddressReference}
                  selectedTask={selectedTask}
                  onCreateTask={handleCreateTask}
                  onUpdateTask={handleUpdateTask}
                  onRefreshAgents={actions.requestRefresh}
                />
              ) : null}

              <FieldTaskFilters
                filters={state.filters}
                agents={state.agents}
                onChange={actions.setFilters}
                onApply={() => void actions.applyFilters()}
                onClear={() => void actions.clearFilters()}
              />

              <FieldTaskList
                tasks={state.tasks}
                selectedTaskId={state.selectedTaskId}
                onSelectTask={actions.selectTask}
              />
            </div>
          </FieldDispatchDockablePanel>

          {showDetailsPanel && selectedTask ? (
            <FieldDispatchDockablePanel
              title={`Detalhes da atividade #${selectedTask.id}`}
              detached={panelState.details.detached}
              size={panelState.details}
              position={detailsPanelPosition}
              minWidth={PANEL_MIN_WIDTH.details}
              minHeight={PANEL_MIN_HEIGHT.details}
              zIndex={activeFloatingPanel === 'details' ? 1650 : 1500}
              onFocus={() => handlePanelFocus('details')}
              onToggleDetached={() => togglePanelDetached('details')}
              onPositionChange={(position) => handlePanelPositionChange('details', position)}
              onSizeChange={(size) => handlePanelSizeChange('details', size)}
            >
              <FieldTaskDetailsDrawer
                task={selectedTask}
                agents={state.agents}
                tracking={selectedTracking}
                onDispatch={handleDispatch}
                onStatusUpdate={handleStatus}
                onReassign={handleReassign}
                onCancel={handleCancel}
                embedded
                showTitle={false}
              />
            </FieldDispatchDockablePanel>
          ) : null}

          <FieldDispatchDockablePanel
            title="Painel de atividades"
            detached={panelState.analytics.detached}
            size={panelState.analytics}
            position={analyticsPanelPosition}
            minWidth={PANEL_MIN_WIDTH.analytics}
            minHeight={PANEL_MIN_HEIGHT.analytics}
            zIndex={activeFloatingPanel === 'analytics' ? 1650 : 1500}
            onFocus={() => handlePanelFocus('analytics')}
            onToggleDetached={() => togglePanelDetached('analytics')}
            onPositionChange={(position) => handlePanelPositionChange('analytics', position)}
            onSizeChange={(size) => handlePanelSizeChange('analytics', size)}
          >
            <FieldTaskAnalyticsPanel tasks={state.tasks} embedded showTitle={false} />
          </FieldDispatchDockablePanel>
        </div>
      </main>

      {toast || state.errorMessage ? (
        <div className="floating-toast" onClick={() => actions.setError(null)}>
          {toast || state.errorMessage}
        </div>
      ) : null}

      {isHelpOpen ? (
        <div className="dispatch-help-backdrop" onClick={() => setIsHelpOpen(false)}>
          <section
            className="dispatch-help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="field-dispatch-help-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dispatch-help-modal__header">
              <div>
                <h2 id="field-dispatch-help-title">Guia Operacional</h2>
                <p>Fluxo objetivo do modulo Gestao e Despacho em Campo.</p>
              </div>
              <div className="dispatch-help-modal__actions">
                <a
                  className="dispatch-button ghost"
                  href={FIELD_DISPATCH_HELP_IMAGE_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir imagem
                </a>
                <button
                  type="button"
                  className="dispatch-button"
                  onClick={() => setIsHelpOpen(false)}
                >
                  Fechar
                </button>
              </div>
            </div>
            <div className="dispatch-help-modal__body">
              <img
                src={FIELD_DISPATCH_HELP_IMAGE_URL}
                alt="Guia Operacional de Gestao e Despacho em Campo"
              />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
