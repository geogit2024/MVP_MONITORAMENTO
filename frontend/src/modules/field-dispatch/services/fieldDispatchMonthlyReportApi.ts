import type { RequestContext } from './fieldDispatchApi';
import type {
  FieldDispatchMonthlyReportFilters,
  FieldDispatchMonthlyReportInterpretationResponse,
  FieldDispatchMonthlyReportResponse,
} from '../types-monthly-report';

const rawApiBaseUrl = String(import.meta.env.VITE_API_URL || '').trim();
const LOCAL_API_HOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 45000);

function resolveApiBaseUrl(): string {
  const candidate = rawApiBaseUrl.replace(/\/$/, '');
  if (!candidate || typeof window === 'undefined') {
    return candidate;
  }

  const appOrigin = window.location.origin;
  const appUsesLocalOrigin = LOCAL_API_HOST_PATTERN.test(appOrigin);
  const apiUsesLocalOrigin = LOCAL_API_HOST_PATTERN.test(candidate);
  if (!appUsesLocalOrigin && apiUsesLocalOrigin) {
    return '';
  }
  return candidate;
}

const API_BASE_URL = resolveApiBaseUrl();

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
      throw new Error('Falha de conexao com a API. Verifique o backend do despacho.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function appendBoolean(query: URLSearchParams, key: string, value: boolean | undefined) {
  if (value === undefined) return;
  query.set(key, value ? 'true' : 'false');
}

export const fieldDispatchMonthlyReportApi = {
  getMonthlyReport(filters: FieldDispatchMonthlyReportFilters, context: RequestContext) {
    const query = new URLSearchParams();
    query.set('month', String(filters.month));
    query.set('year', String(filters.year));
    query.set('timeBasis', filters.timeBasis);
    if (filters.category) query.set('category', filters.category);
    if (filters.status) query.set('status', filters.status);
    if (filters.priority) query.set('priority', filters.priority);
    if (filters.agentId !== undefined) query.set('agentId', String(filters.agentId));
    if (filters.createdBy) query.set('createdBy', filters.createdBy);
    if (filters.dueDateFrom) query.set('dueDateFrom', filters.dueDateFrom);
    if (filters.dueDateTo) query.set('dueDateTo', filters.dueDateTo);
    if (filters.overdueState) query.set('overdueState', filters.overdueState);
    if (filters.search) query.set('search', filters.search);
    appendBoolean(query, 'hasForm', filters.hasForm);
    appendBoolean(query, 'formRequired', filters.formRequired);
    appendBoolean(query, 'formSubmitted', filters.formSubmitted);
    appendBoolean(query, 'hasEvidence', filters.hasEvidence);
    return fetchJson<FieldDispatchMonthlyReportResponse>(
      `/api/field-dispatch/reports/monthly?${query.toString()}`,
      undefined,
      context
    );
  },

  interpretMonthlyReport(
    payload: Pick<FieldDispatchMonthlyReportResponse, 'filtersApplied' | 'summary' | 'breakdowns'>,
    context: RequestContext
  ) {
    return fetchJson<FieldDispatchMonthlyReportInterpretationResponse>(
      '/api/field-dispatch/reports/monthly/interpret',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      context
    );
  },
};
