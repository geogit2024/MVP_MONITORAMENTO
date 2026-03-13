import type { FieldAgent, FieldTask, FieldTaskFiltersState, PointGeometry, TaskTrackingResponse } from '../types';

export interface FieldDispatchState {
  agents: FieldAgent[];
  tasks: FieldTask[];
  selectedTaskId: number | null;
  trackingByTaskId: Record<number, TaskTrackingResponse | undefined>;
  filters: FieldTaskFiltersState;
  creatingByMap: boolean;
  draftGeometry: PointGeometry | null;
  loading: boolean;
  loadingMessage: string;
  errorMessage: string | null;
}

export type FieldDispatchAction =
  | { type: 'setAgents'; payload: FieldAgent[] }
  | { type: 'setTasks'; payload: FieldTask[] }
  | { type: 'setSelectedTaskId'; payload: number | null }
  | { type: 'setTracking'; payload: { taskId: number; tracking: TaskTrackingResponse } }
  | { type: 'setFilters'; payload: Partial<FieldTaskFiltersState> }
  | { type: 'setCreatingByMap'; payload: boolean }
  | { type: 'setDraftGeometry'; payload: PointGeometry | null }
  | { type: 'setLoading'; payload: { active: boolean; message?: string } }
  | { type: 'setError'; payload: string | null };

export const initialFieldDispatchState: FieldDispatchState = {
  agents: [],
  tasks: [],
  selectedTaskId: null,
  trackingByTaskId: {},
  filters: {
    status: '',
    agentId: '',
    priority: '',
    category: '',
    dateFrom: '',
    dateTo: '',
  },
  creatingByMap: false,
  draftGeometry: null,
  loading: false,
  loadingMessage: '',
  errorMessage: null,
};

export function fieldDispatchReducer(
  state: FieldDispatchState,
  action: FieldDispatchAction
): FieldDispatchState {
  switch (action.type) {
    case 'setAgents':
      return { ...state, agents: action.payload };
    case 'setTasks':
      return { ...state, tasks: action.payload };
    case 'setSelectedTaskId':
      return { ...state, selectedTaskId: action.payload };
    case 'setTracking':
      return {
        ...state,
        trackingByTaskId: {
          ...state.trackingByTaskId,
          [action.payload.taskId]: action.payload.tracking,
        },
      };
    case 'setFilters':
      return { ...state, filters: { ...state.filters, ...action.payload } };
    case 'setCreatingByMap':
      return { ...state, creatingByMap: action.payload };
    case 'setDraftGeometry':
      return { ...state, draftGeometry: action.payload };
    case 'setLoading':
      return {
        ...state,
        loading: action.payload.active,
        loadingMessage: action.payload.message || '',
      };
    case 'setError':
      return { ...state, errorMessage: action.payload };
    default:
      return state;
  }
}
