import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { fieldDispatchApi } from '../services/fieldDispatchApi';
import {
  fieldDispatchReducer,
  initialFieldDispatchState,
} from '../store/fieldDispatchStore';
import type {
  CreateFieldTaskPayload,
  FieldTaskFiltersState,
  FieldTask,
  FieldTaskStatus,
  PointGeometry,
  UpdateFieldTaskPayload,
} from '../types';

const DEFAULT_DISPATCHER_CONTEXT = {
  role: 'despachante' as const,
  userId: 'dispatcher.web',
};

export function useFieldDispatch() {
  const [state, dispatch] = useReducer(fieldDispatchReducer, initialFieldDispatchState);
  const [refreshTick, setRefreshTick] = useState(0);

  const selectedTask = useMemo<FieldTask | null>(() => {
    if (!state.selectedTaskId) return null;
    return state.tasks.find((task) => task.id === state.selectedTaskId) || null;
  }, [state.selectedTaskId, state.tasks]);

  const setError = useCallback((message: string | null) => {
    dispatch({ type: 'setError', payload: message });
  }, []);

  const setLoading = useCallback((active: boolean, message = '') => {
    dispatch({ type: 'setLoading', payload: { active, message } });
  }, []);

  const refreshTasks = useCallback(async () => {
    const response = await fieldDispatchApi.listTasks(
      {
        status: state.filters.status || undefined,
        agentId: state.filters.agentId ? Number(state.filters.agentId) : undefined,
        priority: state.filters.priority || undefined,
        category: state.filters.category || undefined,
        dateFrom: state.filters.dateFrom || undefined,
        dateTo: state.filters.dateTo || undefined,
      },
      DEFAULT_DISPATCHER_CONTEXT
    );
    dispatch({ type: 'setTasks', payload: response.items || [] });
  }, [state.filters]);

  const refreshAgents = useCallback(async () => {
    const agents = await fieldDispatchApi.listAgents(DEFAULT_DISPATCHER_CONTEXT);
    dispatch({ type: 'setAgents', payload: agents });
  }, []);

  const refreshTaskDetails = useCallback(async (taskId: number) => {
    const task = await fieldDispatchApi.getTask(taskId, DEFAULT_DISPATCHER_CONTEXT);
    dispatch({
      type: 'setTasks',
      payload: state.tasks.map((current) => (current.id === task.id ? task : current)),
    });
  }, [state.tasks]);

  const refreshTracking = useCallback(async (taskId: number) => {
    const tracking = await fieldDispatchApi.getTracking(taskId, DEFAULT_DISPATCHER_CONTEXT);
    dispatch({ type: 'setTracking', payload: { taskId, tracking } });
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      setLoading(true, 'Carregando atividades...');
      await Promise.all([refreshAgents(), refreshTasks()]);
      setError(null);
    } catch (error: unknown) {
      setError((error as Error)?.message || 'Falha ao carregar modulo de despacho.');
    } finally {
      setLoading(false);
    }
  }, [refreshAgents, refreshTasks, setError, setLoading]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap, refreshTick]);

  useEffect(() => {
    const selectedTaskId = state.selectedTaskId;
    if (!selectedTaskId) return;
    const interval = window.setInterval(() => {
      void refreshTracking(selectedTaskId);
    }, 7000);
    return () => window.clearInterval(interval);
  }, [refreshTracking, state.selectedTaskId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshAgents().catch(() => {
        // silent background polling failure
      });
    }, 7000);
    return () => window.clearInterval(interval);
  }, [refreshAgents]);

  const requestRefresh = useCallback(() => {
    setRefreshTick((prev) => prev + 1);
  }, []);

  const selectTask = useCallback((taskId: number | null) => {
    const nextTaskId = taskId && state.selectedTaskId === taskId ? null : taskId;
    dispatch({ type: 'setSelectedTaskId', payload: nextTaskId });
    if (nextTaskId) {
      void refreshTaskDetails(nextTaskId);
      void refreshTracking(nextTaskId);
    }
  }, [refreshTaskDetails, refreshTracking, state.selectedTaskId]);

  const setFilters = useCallback((next: Partial<FieldTaskFiltersState>) => {
    dispatch({ type: 'setFilters', payload: next });
  }, []);

  const applyFilters = useCallback(async () => {
    try {
      setLoading(true, 'Aplicando filtros...');
      await refreshTasks();
      setError(null);
    } catch (error: unknown) {
      setError((error as Error)?.message || 'Falha ao aplicar filtros.');
    } finally {
      setLoading(false);
    }
  }, [refreshTasks, setError, setLoading]);

  const clearFilters = useCallback(async () => {
    dispatch({
      type: 'setFilters',
      payload: {
        status: '',
        agentId: '',
        priority: '',
        category: '',
        dateFrom: '',
        dateTo: '',
      },
    });
    requestRefresh();
  }, [requestRefresh]);

  const setCreatingByMap = useCallback((enabled: boolean) => {
    dispatch({ type: 'setCreatingByMap', payload: enabled });
    if (enabled) {
      dispatch({ type: 'setSelectedTaskId', payload: null });
    }
    if (!enabled) {
      dispatch({ type: 'setDraftGeometry', payload: null });
    }
  }, []);

  const setDraftGeometry = useCallback((geometry: PointGeometry | null) => {
    dispatch({ type: 'setDraftGeometry', payload: geometry });
  }, []);

  const createTask = useCallback(async (payload: CreateFieldTaskPayload) => {
    const created = await fieldDispatchApi.createTask(payload, DEFAULT_DISPATCHER_CONTEXT);
    dispatch({ type: 'setTasks', payload: [created, ...state.tasks] });
    dispatch({ type: 'setSelectedTaskId', payload: created.id });
    return created;
  }, [state.tasks]);

  const updateTask = useCallback(async (taskId: number, payload: UpdateFieldTaskPayload) => {
    const updated = await fieldDispatchApi.updateTask(taskId, payload, DEFAULT_DISPATCHER_CONTEXT);
    dispatch({
      type: 'setTasks',
      payload: state.tasks.map((task) => (task.id === updated.id ? updated : task)),
    });
    return updated;
  }, [state.tasks]);

  const dispatchTask = useCallback(async (taskId: number) => {
    const updated = await fieldDispatchApi.dispatchTask(taskId, DEFAULT_DISPATCHER_CONTEXT);
    dispatch({
      type: 'setTasks',
      payload: state.tasks.map((task) => (task.id === updated.id ? updated : task)),
    });
    return updated;
  }, [state.tasks]);

  const updateTaskStatus = useCallback(async (taskId: number, status: FieldTaskStatus, note?: string) => {
    const updated = await fieldDispatchApi.updateStatus(
      taskId,
      { newStatus: status, note },
      DEFAULT_DISPATCHER_CONTEXT
    );
    dispatch({
      type: 'setTasks',
      payload: state.tasks.map((task) => (task.id === updated.id ? updated : task)),
    });
    return updated;
  }, [state.tasks]);

  const reassignTask = useCallback(async (taskId: number, assignedAgentId: number, note: string) => {
    const updated = await fieldDispatchApi.reassignTask(
      taskId,
      assignedAgentId,
      note,
      DEFAULT_DISPATCHER_CONTEXT
    );
    dispatch({
      type: 'setTasks',
      payload: state.tasks.map((task) => (task.id === updated.id ? updated : task)),
    });
    return updated;
  }, [state.tasks]);

  const cancelTask = useCallback(async (taskId: number, note: string) => {
    const updated = await fieldDispatchApi.cancelTask(taskId, note, DEFAULT_DISPATCHER_CONTEXT);
    dispatch({
      type: 'setTasks',
      payload: state.tasks.map((task) => (task.id === updated.id ? updated : task)),
    });
    return updated;
  }, [state.tasks]);

  return {
    state,
    selectedTask,
    actions: {
      bootstrap,
      requestRefresh,
      setError,
      setLoading,
      selectTask,
      setFilters,
      applyFilters,
      clearFilters,
      setCreatingByMap,
      setDraftGeometry,
      createTask,
      updateTask,
      dispatchTask,
      updateTaskStatus,
      reassignTask,
      cancelTask,
      refreshTaskDetails,
      refreshTracking,
    },
  };
}

