import type { FeatureCollection, Geometry } from 'geojson';
import * as mockService from './mock/mockService';
import type {
  ReservoirAlert,
  ReservoirChangeResult,
  ReservoirContext,
  ReservoirDashboard,
  ReservoirFeature,
  ReservoirImageInfo,
  ReservoirIndicesResponse,
  ReservoirLandUseResult,
  ReservoirTimeSeriesResult,
  ReservoirWaterbodyResult,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 90000);

const MOCK_FLAG = String(import.meta.env.VITE_RESERVOIR_MOCKS || '')
  .trim()
  .toLowerCase();

const USE_RESERVOIR_MOCKS = ['1', 'true', 'yes', 'on', 'mock'].includes(MOCK_FLAG);

export const isReservoirMockModeEnabled = USE_RESERVOIR_MOCKS;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: init?.signal ?? controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.detail || 'Falha na requisicao.');
    }
    return payload as T;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'name' in error && (error as { name?: string }).name === 'AbortError') {
      throw new Error('Tempo limite excedido ao consultar o servidor.');
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export async function listReservoirs() {
  if (USE_RESERVOIR_MOCKS) return mockService.listReservoirs();
  return fetchJson<FeatureCollection<Geometry, { id: number; name: string; description?: string }>>(
    `${API_BASE_URL}/api/reservoirs`
  );
}

export async function createReservoir(params: { name: string; description?: string; geometry: Geometry }) {
  if (USE_RESERVOIR_MOCKS) return mockService.createReservoir(params);
  return fetchJson<{ id: number; name: string; description?: string; geometry: Geometry }>(
    `${API_BASE_URL}/api/reservoirs`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }
  );
}

export async function deleteReservoir(reservoirId: number) {
  if (USE_RESERVOIR_MOCKS) return mockService.deleteReservoir(reservoirId);
  const response = await fetch(`${API_BASE_URL}/api/reservoirs/${reservoirId}`, { method: 'DELETE' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.detail || 'Falha ao excluir reservatorio.');
  }
}

export async function getReservoirContext(reservoirId: number) {
  if (USE_RESERVOIR_MOCKS) return mockService.getReservoirContext(reservoirId);
  return fetchJson<ReservoirContext>(
    `${API_BASE_URL}/api/reservoir-monitoring/reservoirs/${reservoirId}/context`
  );
}

export async function updateReservoirContext(
  reservoirId: number,
  payload: Partial<ReservoirContext> & { parametros?: Record<string, unknown>; metadados?: Record<string, unknown> }
) {
  if (USE_RESERVOIR_MOCKS) return mockService.updateReservoirContext(reservoirId, payload);
  return fetchJson<ReservoirContext>(
    `${API_BASE_URL}/api/reservoir-monitoring/reservoirs/${reservoirId}/context`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

export async function listMonitoringAreas(reservoirId: number) {
  if (USE_RESERVOIR_MOCKS) return mockService.listMonitoringAreas(reservoirId);
  return fetchJson<FeatureCollection>(
    `${API_BASE_URL}/api/reservoir-monitoring/reservoirs/${reservoirId}/areas`
  );
}

export async function createMonitoringArea(
  reservoirId: number,
  payload: { nome_area: string; tipo_area: string; geometry: Geometry; limiar_degradacao?: number }
) {
  if (USE_RESERVOIR_MOCKS) return mockService.createMonitoringArea(reservoirId, payload);
  return fetchJson<{
    id: number;
    reservoir_id: number;
    nome_area: string;
    tipo_area: string;
    area_ha: number;
    perimetro_km: number;
  }>(`${API_BASE_URL}/api/reservoir-monitoring/reservoirs/${reservoirId}/areas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteMonitoringArea(reservoirId: number, areaId: number) {
  if (USE_RESERVOIR_MOCKS) return mockService.deleteMonitoringArea(reservoirId, areaId);
  const response = await fetch(
    `${API_BASE_URL}/api/reservoir-monitoring/reservoirs/${reservoirId}/areas/${areaId}`,
    { method: 'DELETE' }
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.detail || 'Falha ao remover area.');
  }
}

export async function searchReservoirImages(
  reservoirId: number,
  payload: {
    dateFrom: string;
    dateTo: string;
    cloudPct: number;
    satellite: string;
    polygon?: Geometry;
    maxResults?: number;
  }
) {
  if (USE_RESERVOIR_MOCKS) return mockService.searchReservoirImages(reservoirId, payload);
  return fetchJson<ReservoirImageInfo[]>(
    `${API_BASE_URL}/api/reservoir-monitoring/reservoirs/${reservoirId}/images/search`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

export async function previewReservoirImage(payload: {
  imageId: string;
  satellite: string;
  polygon: Geometry;
}) {
  if (USE_RESERVOIR_MOCKS) return mockService.previewReservoirImage(payload);
  return fetchJson<{
    tileUrl?: string;
    imageOverlayUrl?: string;
    imageOverlayBounds?: [[number, number], [number, number]];
  }>(`${API_BASE_URL}/api/earth-images/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function runReservoirIndices(
  reservoirId: number,
  payload: {
    imageId: string;
    satellite: string;
    indices: string[];
    polygon?: Geometry;
  }
) {
  if (USE_RESERVOIR_MOCKS) return mockService.runReservoirIndices(reservoirId, payload);
  return fetchJson<ReservoirIndicesResponse>(
    `${API_BASE_URL}/api/reservoir-monitoring/reservoirs/${reservoirId}/indices`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

export async function extractWaterbody(
  reservoirId: number,
  payload: {
    imageId: string;
    satellite: string;
    index_name: string;
    threshold: number;
    variation_alert_pct: number;
    polygon?: Geometry;
  }
) {
  if (USE_RESERVOIR_MOCKS) return mockService.extractWaterbody(reservoirId, payload);
  return fetchJson<ReservoirWaterbodyResult>(
    `${API_BASE_URL}/api/reservoir-monitoring/reservoirs/${reservoirId}/waterbody/extract`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

export async function runReservoirTimeSeries(
  reservoirId: number,
  payload: {
    date_start: string;
    date_end: string;
    satellite: string;
    indicator_name: string;
    metric: 'index_mean' | 'water_area';
    threshold?: number;
    max_points?: number;
    polygon?: Geometry;
  }
) {
  if (USE_RESERVOIR_MOCKS) return mockService.runReservoirTimeSeries(reservoirId, payload);
  return fetchJson<ReservoirTimeSeriesResult>(
    `${API_BASE_URL}/api/reservoir-monitoring/reservoirs/${reservoirId}/timeseries`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

export async function classifyReservoirLandUse(
  reservoirId: number,
  payload: {
    imageId: string;
    satellite: string;
    soil_exposed_alert_pct: number;
    anthropic_alert_pct: number;
    polygon?: Geometry;
  }
) {
  if (USE_RESERVOIR_MOCKS) return mockService.classifyReservoirLandUse(reservoirId, payload);
  return fetchJson<ReservoirLandUseResult>(
    `${API_BASE_URL}/api/reservoir-monitoring/reservoirs/${reservoirId}/landuse/classify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

export async function detectReservoirChange(
  reservoirId: number,
  payload: {
    beforeImageId: string;
    afterImageId: string;
    satellite: string;
    threshold: number;
    loss_alert_ha: number;
    polygon?: Geometry;
  }
) {
  if (USE_RESERVOIR_MOCKS) return mockService.detectReservoirChange(reservoirId, payload);
  return fetchJson<ReservoirChangeResult>(
    `${API_BASE_URL}/api/reservoir-monitoring/reservoirs/${reservoirId}/change-detection`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

export async function runRiparianMonitoring(
  reservoirId: number,
  payload: {
    imageId: string;
    satellite: string;
    app_geometry?: Geometry;
    ndvi_drop_alert_pct: number;
  }
) {
  if (USE_RESERVOIR_MOCKS) return mockService.runRiparianMonitoring(reservoirId, payload);
  return fetchJson<{
    analysis_id: number;
    image_date?: string;
    ndvi_mean: number;
    previous_ndvi_mean?: number | null;
    variacao_pct?: number | null;
    alert_id?: number | null;
  }>(
    `${API_BASE_URL}/api/reservoir-monitoring/reservoirs/${reservoirId}/riparian/monitor`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

export async function runTurbidityProxy(
  reservoirId: number,
  payload: {
    imageId: string;
    satellite: string;
    threshold: number;
    polygon?: Geometry;
  }
) {
  if (USE_RESERVOIR_MOCKS) return mockService.runTurbidityProxy(reservoirId, payload);
  return fetchJson<{
    analysis_id: number;
    image_date?: string;
    indicator: string;
    stats: { min?: number | null; max?: number | null; mean?: number | null };
    alert_id?: number | null;
  }>(
    `${API_BASE_URL}/api/reservoir-monitoring/reservoirs/${reservoirId}/proxies/turbidity`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

export async function listReservoirAlerts(reservoirId: number, statusFilter?: string) {
  if (USE_RESERVOIR_MOCKS) return mockService.listReservoirAlerts(reservoirId, statusFilter);
  const suffix = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : '';
  return fetchJson<{ reservoir_id: number; items: ReservoirAlert[] }>(
    `${API_BASE_URL}/api/reservoir-monitoring/reservoirs/${reservoirId}/alerts${suffix}`
  );
}

export async function updateAlertStatus(alertId: number, status: string) {
  if (USE_RESERVOIR_MOCKS) return mockService.updateAlertStatus(alertId, status);
  return fetchJson<{ id: number; status: string }>(
    `${API_BASE_URL}/api/reservoir-monitoring/alerts/${alertId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }
  );
}

export async function listReservoirHistory(reservoirId: number) {
  if (USE_RESERVOIR_MOCKS) return mockService.listReservoirHistory(reservoirId);
  return fetchJson<{ reservoir_id: number; items: Array<Record<string, unknown>> }>(
    `${API_BASE_URL}/api/reservoir-monitoring/reservoirs/${reservoirId}/history`
  );
}

export async function listWaterHistory(reservoirId: number) {
  if (USE_RESERVOIR_MOCKS) return mockService.listWaterHistory(reservoirId);
  return fetchJson<{ reservoir_id: number; items: Array<Record<string, unknown>> }>(
    `${API_BASE_URL}/api/reservoir-monitoring/reservoirs/${reservoirId}/waterbody/history`
  );
}

export async function generateReservoirInsight(
  reservoirId: number,
  payload: { periodo_inicio?: string; periodo_fim?: string; limite_analises?: number }
) {
  if (USE_RESERVOIR_MOCKS) return mockService.generateReservoirInsight(reservoirId, payload);
  return fetchJson<{
    id: number;
    reservoir_id: number;
    insight: Record<string, unknown>;
    texto: string;
  }>(`${API_BASE_URL}/api/reservoir-monitoring/reservoirs/${reservoirId}/ai-insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function getReservoirDashboard() {
  if (USE_RESERVOIR_MOCKS) return mockService.getReservoirDashboard();
  return fetchJson<ReservoirDashboard>(`${API_BASE_URL}/api/reservoir-monitoring/dashboard`);
}

export function getReservoirReportCsvUrl(reservoirId: number, dateStart?: string, dateEnd?: string) {
  if (USE_RESERVOIR_MOCKS) return mockService.getReservoirReportCsvUrl(reservoirId, dateStart, dateEnd);
  const params = new URLSearchParams({ export_format: 'csv' });
  if (dateStart) params.set('date_start', dateStart);
  if (dateEnd) params.set('date_end', dateEnd);
  return `${API_BASE_URL}/api/reservoir-monitoring/reservoirs/${reservoirId}/report?${params.toString()}`;
}

export async function getReservoirReportJson(reservoirId: number, dateStart?: string, dateEnd?: string) {
  if (USE_RESERVOIR_MOCKS) return mockService.getReservoirReportJson(reservoirId, dateStart, dateEnd);
  const params = new URLSearchParams({ export_format: 'json' });
  if (dateStart) params.set('date_start', dateStart);
  if (dateEnd) params.set('date_end', dateEnd);
  return fetchJson<Record<string, unknown>>(
    `${API_BASE_URL}/api/reservoir-monitoring/reservoirs/${reservoirId}/report?${params.toString()}`
  );
}

export function featureGeometry(feature?: ReservoirFeature | null): Geometry | undefined {
  return feature?.geometry;
}
