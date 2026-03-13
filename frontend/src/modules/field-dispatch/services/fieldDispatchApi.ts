import type {
  AgentLoginResponse,
  CreateFieldAgentPayload,
  CreateEvidencePayload,
  CreateFieldTaskPayload,
  FieldAgent,
  FieldEvidence,
  FieldTask,
  FieldTaskListResponse,
  FormTemplate,
  FormTemplateListResponse,
  FormTemplateSchema,
  LocationPayload,
  TaskFormDescriptor,
  TaskFormSubmission,
  TaskTrackingResponse,
  UpdateFieldTaskPayload,
  UpdateTaskStatusPayload,
} from '../types';

const rawApiBaseUrl = String(import.meta.env.VITE_API_URL || '').trim();
const LOCAL_API_HOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function resolveApiBaseUrl(): string {
  const candidate = rawApiBaseUrl.replace(/\/$/, '');
  if (!candidate || typeof window === 'undefined') {
    return candidate;
  }

  const appOrigin = window.location.origin;
  const appUsesLocalOrigin = LOCAL_API_HOST_PATTERN.test(appOrigin);
  const apiUsesLocalOrigin = LOCAL_API_HOST_PATTERN.test(candidate);

  // When the frontend is exposed through a public tunnel, a local API URL becomes
  // unreachable from the client device. In this case, keep requests same-origin
  // and let the Vite proxy forward them to the backend.
  if (!appUsesLocalOrigin && apiUsesLocalOrigin) {
    return '';
  }

  return candidate;
}

const API_BASE_URL = resolveApiBaseUrl();
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 45000);

type RequestRole = 'administrador' | 'despachante' | 'agente_campo' | 'supervisor';

interface RequestContext {
  role?: RequestRole;
  userId?: string;
  agentToken?: string;
}

function buildApiUrl(path: string): string {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

function headersFromContext(context?: RequestContext, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  if (context?.role) headers.set('x-user-role', context.role);
  if (context?.userId) headers.set('x-user-id', context.userId);
  if (context?.agentToken) headers.set('authorization', `Bearer ${context.agentToken}`);
  return headers;
}

async function fetchJson<T>(path: string, init?: RequestInit, context?: RequestContext): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(buildApiUrl(path), {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: headersFromContext(context, init?.headers),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = (payload as { detail?: unknown }).detail;
      if (typeof detail === 'string') {
        throw new Error(detail);
      }
      if (detail && typeof detail === 'object' && 'message' in detail) {
        throw new Error(String((detail as { message?: unknown }).message || 'Falha na requisicao.'));
      }
      throw new Error('Falha na requisicao.');
    }
    return payload as T;
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'name' in error &&
      (error as { name?: string }).name === 'AbortError'
    ) {
      throw new Error('Tempo limite excedido ao consultar o servidor.');
    }
    if (error instanceof TypeError) {
      throw new Error('Falha de conexao com a API. Verifique o tunel publico e o backend.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export const fieldDispatchApi = {
  listAgents(context: RequestContext) {
    return fetchJson<FieldAgent[]>('/api/field-dispatch/agents', undefined, context);
  },

  createAgent(payload: CreateFieldAgentPayload, context: RequestContext) {
    return fetchJson<FieldAgent>(
      '/api/field-dispatch/agents',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      context
    );
  },

  agentLogin(payload: { userId: string; password: string }) {
    return fetchJson<AgentLoginResponse>(
      '/api/field-dispatch/agents/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      undefined
    );
  },

  listTasks(
    params: {
      status?: string;
      agentId?: number;
      priority?: string;
      category?: string;
      dateFrom?: string;
      dateTo?: string;
    },
    context: RequestContext
  ) {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.agentId !== undefined) query.set('agentId', String(params.agentId));
    if (params.priority) query.set('priority', params.priority);
    if (params.category) query.set('category', params.category);
    if (params.dateFrom) query.set('dateFrom', params.dateFrom);
    if (params.dateTo) query.set('dateTo', params.dateTo);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return fetchJson<FieldTaskListResponse>(`/api/field-dispatch/tasks${suffix}`, undefined, context);
  },

  getTask(taskId: number, context: RequestContext) {
    return fetchJson<FieldTask>(`/api/field-dispatch/tasks/${taskId}`, undefined, context);
  },

  createTask(payload: CreateFieldTaskPayload, context: RequestContext) {
    return fetchJson<FieldTask>(
      '/api/field-dispatch/tasks',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      context
    );
  },

  updateTask(taskId: number, payload: UpdateFieldTaskPayload, context: RequestContext) {
    return fetchJson<FieldTask>(
      `/api/field-dispatch/tasks/${taskId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      context
    );
  },

  dispatchTask(taskId: number, context: RequestContext) {
    return fetchJson<FieldTask>(
      `/api/field-dispatch/tasks/${taskId}/dispatch`,
      { method: 'POST' },
      context
    );
  },

  updateStatus(taskId: number, payload: UpdateTaskStatusPayload, context: RequestContext) {
    return fetchJson<FieldTask>(
      `/api/field-dispatch/tasks/${taskId}/status`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      context
    );
  },

  reassignTask(taskId: number, assignedAgentId: number, note: string, context: RequestContext) {
    return fetchJson<FieldTask>(
      `/api/field-dispatch/tasks/${taskId}/reassign`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedAgentId, note }),
      },
      context
    );
  },

  cancelTask(taskId: number, note: string, context: RequestContext) {
    return fetchJson<FieldTask>(
      `/api/field-dispatch/tasks/${taskId}/cancel`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      },
      context
    );
  },

  listAgentTasks(agentId: number, includeClosed: boolean, context: RequestContext) {
    const query = new URLSearchParams();
    query.set('includeClosed', includeClosed ? 'true' : 'false');
    return fetchJson<FieldTask[]>(
      `/api/field-dispatch/agents/${agentId}/tasks?${query.toString()}`,
      undefined,
      context
    );
  },

  sendLocation(taskId: number, payload: LocationPayload, context: RequestContext) {
    return fetchJson<{ ok: boolean; timestamp: string }>(
      `/api/field-dispatch/tasks/${taskId}/location`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      context
    );
  },

  getTracking(taskId: number, context: RequestContext) {
    return fetchJson<TaskTrackingResponse>(
      `/api/field-dispatch/tasks/${taskId}/tracking`,
      undefined,
      context
    );
  },

  async uploadEvidenceFile(taskId: number, file: File, context: RequestContext) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(buildApiUrl(`/api/field-dispatch/tasks/${taskId}/evidence/upload`), {
      method: 'POST',
      headers: headersFromContext(context),
      body: formData,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String((payload as { detail?: string }).detail || 'Falha no upload da evidencia.'));
    }
    return payload as { fileUrl: string; sizeBytes: number };
  },

  createEvidence(taskId: number, payload: CreateEvidencePayload, context: RequestContext) {
    return fetchJson<FieldEvidence>(
      `/api/field-dispatch/tasks/${taskId}/evidence`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      context
    );
  },

  listEvidence(taskId: number, context: RequestContext) {
    return fetchJson<FieldEvidence[]>(`/api/field-dispatch/tasks/${taskId}/evidence`, undefined, context);
  },

  listFormTemplates(
    params: { status?: string; search?: string } = {},
    context: RequestContext
  ) {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return fetchJson<FormTemplateListResponse>(`/api/field-forms/templates${suffix}`, undefined, context);
  },

  getFormTemplate(templateId: number, context: RequestContext) {
    return fetchJson<FormTemplate>(`/api/field-forms/templates/${templateId}`, undefined, context);
  },

  createFormTemplate(
    payload: { name: string; description?: string; schema?: FormTemplateSchema },
    context: RequestContext
  ) {
    return fetchJson<FormTemplate>(
      '/api/field-forms/templates',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      context
    );
  },

  updateFormTemplate(
    templateId: number,
    payload: { name?: string; description?: string; schema?: FormTemplateSchema },
    context: RequestContext
  ) {
    return fetchJson<FormTemplate>(
      `/api/field-forms/templates/${templateId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      context
    );
  },

  publishFormTemplate(templateId: number, context: RequestContext) {
    return fetchJson<FormTemplate>(
      `/api/field-forms/templates/${templateId}/publish`,
      { method: 'POST' },
      context
    );
  },

  duplicateFormTemplate(templateId: number, context: RequestContext) {
    return fetchJson<FormTemplate>(
      `/api/field-forms/templates/${templateId}/duplicate`,
      { method: 'POST' },
      context
    );
  },

  archiveFormTemplate(templateId: number, context: RequestContext) {
    return fetchJson<FormTemplate>(
      `/api/field-forms/templates/${templateId}/archive`,
      { method: 'POST' },
      context
    );
  },

  getTaskForm(taskId: number, context: RequestContext) {
    return fetchJson<TaskFormDescriptor>(`/api/field-dispatch/tasks/${taskId}/form`, undefined, context);
  },

  saveTaskFormDraft(taskId: number, answers: Record<string, unknown>, context: RequestContext) {
    return fetchJson<TaskFormSubmission>(
      `/api/field-dispatch/tasks/${taskId}/form/draft`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      },
      context
    );
  },

  submitTaskForm(taskId: number, answers: Record<string, unknown>, context: RequestContext) {
    return fetchJson<TaskFormSubmission>(
      `/api/field-dispatch/tasks/${taskId}/form/submit`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      },
      context
    );
  },
};

export type { RequestContext, RequestRole };
