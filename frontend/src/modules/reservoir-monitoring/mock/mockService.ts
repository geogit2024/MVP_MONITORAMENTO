import type { FeatureCollection, Geometry } from 'geojson';
import type {
  ReservoirChangeResult,
  ReservoirContext,
  ReservoirDashboard,
  ReservoirFeature,
  ReservoirIndicesResponse,
  ReservoirLandUseResult,
  ReservoirTimeSeriesResult,
  ReservoirWaterbodyResult,
} from '../types';
import type { ReservoirMockCycle, ReservoirMockSeedData, ReservoirMockSeriesPoint } from './types';
import seedDataJson from './mock-seed.json';

type GenericFeatureCollection = FeatureCollection<Geometry, Record<string, unknown>>;

const seedData = seedDataJson as ReservoirMockSeedData;

const LATENCY_MS = 120;

const TILE_TEMPLATES: Record<string, string> = {
  preview: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png?mock=preview',
  ndvi: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png?mock=ndvi',
  ndwi: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?mock=ndwi',
  mndwi: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?mock=mndwi',
  ndmi: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png?mock=ndmi',
  savi: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}?mock=savi',
  turbidity_proxy: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?mock=turbidity',
  water: 'https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png?mock=water',
  landuse: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?mock=landuse',
  change: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png?mock=change',
};

const INDEX_KEY_BY_NAME: Record<string, keyof ReservoirMockCycle['indicators']> = {
  NDVI: 'ndvi',
  NDWI: 'ndwi',
  MNDWI: 'mndwi',
  NDMI: 'ndmi',
  SAVI: 'savi',
  TURBIDITY_PROXY: 'turbidity_proxy',
};

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const wait = (ms = LATENCY_MS) => new Promise((resolve) => setTimeout(resolve, ms));

const withLatency = async <T>(factory: () => T): Promise<T> => {
  await wait();
  return factory();
};

const makeOverlayDataUrl = (text: string, colorA = '#065f46', colorB = '#1d4ed8') => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='420'>
<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='${colorA}'/><stop offset='100%' stop-color='${colorB}'/></linearGradient></defs>
<rect width='100%' height='100%' fill='url(#g)' fill-opacity='0.8'/>
<rect x='12' y='12' width='616' height='396' fill='none' stroke='rgba(255,255,255,0.6)' stroke-width='3'/>
<text x='26' y='390' font-size='26' fill='white' font-family='Segoe UI, Arial'>${text}</text>
</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const fallbackFeatureCollection = (): GenericFeatureCollection => ({
  type: 'FeatureCollection',
  features: [],
});

let store: ReservoirMockSeedData = deepClone(seedData);

const getReservoirKey = (reservoirId: number) => String(reservoirId);

const getReservoirFeature = (reservoirId: number): ReservoirFeature | null =>
  (store.reservoirs || []).find((item) => item.properties?.id === reservoirId) || null;

const ensureReservoir = (reservoirId: number) => {
  const feature = getReservoirFeature(reservoirId);
  if (!feature) throw new Error(`Reservatorio ${reservoirId} nao encontrado no mock.`);
  return feature;
};

const getReservoirCycles = (reservoirId: number): ReservoirMockCycle[] =>
  deepClone(store.cycles[getReservoirKey(reservoirId)] || []);

const getReservoirSeries = (reservoirId: number): ReservoirMockSeriesPoint[] =>
  deepClone(store.timeseries[getReservoirKey(reservoirId)] || []);

const getCycleByImage = (reservoirId: number, imageId: string): ReservoirMockCycle | null => {
  const cycles = store.cycles[getReservoirKey(reservoirId)] || [];
  return cycles.find((item) => item.image_id === imageId) || null;
};

const getLatestCycle = (reservoirId: number): ReservoirMockCycle | null => {
  const cycles = store.cycles[getReservoirKey(reservoirId)] || [];
  if (!cycles.length) return null;
  const sorted = [...cycles].sort((a, b) => a.date.localeCompare(b.date));
  return sorted[sorted.length - 1] || null;
};

const getCycleBeforeDate = (reservoirId: number, dateIso: string): ReservoirMockCycle | null => {
  const cycles = store.cycles[getReservoirKey(reservoirId)] || [];
  const filtered = cycles.filter((item) => item.date < dateIso).sort((a, b) => a.date.localeCompare(b.date));
  return filtered[filtered.length - 1] || null;
};

const getBoundsFromGeometry = (geometry: Geometry): number[][] => {
  if (geometry.type !== 'Polygon' || !geometry.coordinates[0]?.length) return [[-60, -10], [-59, -9]];
  const points = geometry.coordinates[0];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  points.forEach(([x, y]) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });
  return [
    [minY, minX],
    [maxY, maxX],
  ];
};

const metricValueByIndicator = (cycle: ReservoirMockCycle, indicatorName: string): number => {
  const key = INDEX_KEY_BY_NAME[indicatorName.toUpperCase()];
  if (!key) return 0;
  return Number(cycle.indicators[key] ?? 0);
};

const metricValueBySeriesPoint = (point: ReservoirMockSeriesPoint, indicatorName: string): number => {
  const key = indicatorName.toUpperCase();
  if (key === 'NDVI') return point.ndvi;
  if (key === 'NDWI') return point.ndwi;
  if (key === 'MNDWI') return point.mndwi;
  if (key === 'NDMI') return point.ndmi;
  if (key === 'SAVI') return point.savi;
  if (key === 'TURBIDITY_PROXY') return point.turbidity_proxy;
  return 0;
};

const computeDashboard = (): ReservoirDashboard => {
  const allAlerts = Object.values(store.alerts).flat();
  const activeAlerts = allAlerts.filter((item) => item.status === 'active');
  const severityList = ['high', 'medium', 'low'];

  const ranking = store.reservoirs
    .map((item) => {
      const reservoirId = Number(item.properties?.id || 0);
      const count = (store.alerts[getReservoirKey(reservoirId)] || []).filter((alert) => alert.status === 'active').length;
      return {
        reservoir_id: reservoirId,
        reservatorio_nome: item.properties?.name || `Reservatorio ${reservoirId}`,
        active_alerts: count,
      };
    })
    .sort((a, b) => b.active_alerts - a.active_alerts);

  const avgVariation =
    store.reservoirs
      .map((item) => {
        const reservoirId = Number(item.properties?.id || 0);
        const cycles = (store.cycles[getReservoirKey(reservoirId)] || []).sort((a, b) => a.date.localeCompare(b.date));
        if (cycles.length < 2) return 0;
        const c1 = cycles[cycles.length - 2];
        const c2 = cycles[cycles.length - 1];
        if (!c1.indicators.water_area_ha) return 0;
        return ((c2.indicators.water_area_ha - c1.indicators.water_area_ha) / c1.indicators.water_area_ha) * 100;
      })
      .reduce((acc, value) => acc + value, 0) / Math.max(1, store.reservoirs.length);

  return {
    total_reservatorios_monitorados: store.reservoirs.length,
    reservatorios_ativos_monitoramento: Object.values(store.contexts).filter((ctx) => ctx.status_monitoramento === 'active').length,
    alertas_ativos: activeAlerts.length,
    variacao_media_area_alagada_pct: Number(avgVariation.toFixed(2)),
    ocorrencias_por_severidade: severityList.map((severidade) => ({
      severidade,
      qtd: activeAlerts.filter((item) => item.severidade === severidade).length,
    })),
    ranking_criticidade: ranking,
  };
};

const csvReportForReservoir = (reservoirId: number, dateStart?: string, dateEnd?: string): string => {
  const rows = getReservoirCycles(reservoirId)
    .filter((cycle) => (!dateStart || cycle.date >= dateStart) && (!dateEnd || cycle.date <= dateEnd))
    .sort((a, b) => a.date.localeCompare(b.date));
  const header = [
    'date',
    'campaign_name',
    'satellite',
    'cloud_pct',
    'water_area_ha',
    'ndvi',
    'ndwi',
    'mndwi',
    'ndmi',
    'savi',
    'turbidity_proxy',
    'app_ndvi_mean',
    'soil_exposed_delta_pct',
    'anthropic_delta_pct',
  ];
  const lines = rows.map((cycle) =>
    [
      cycle.date,
      cycle.campaign_name,
      cycle.satellite,
      cycle.cloud_pct,
      cycle.indicators.water_area_ha,
      cycle.indicators.ndvi,
      cycle.indicators.ndwi,
      cycle.indicators.mndwi,
      cycle.indicators.ndmi,
      cycle.indicators.savi,
      cycle.indicators.turbidity_proxy,
      cycle.app.ndvi_mean,
      cycle.landuse.comparison.soil_exposed_delta_pct ?? '',
      cycle.landuse.comparison.anthropic_delta_pct ?? '',
    ].join(',')
  );
  return [header.join(','), ...lines].join('\n');
};

const pseudoAnalysisId = () => Number(`${Date.now()}`.slice(-9));

export function reseedReservoirMockData() {
  store = deepClone(seedData);
}

export async function listReservoirs() {
  return withLatency(() => ({
    type: 'FeatureCollection',
    features: deepClone(store.reservoirs),
  }));
}

export async function createReservoir(params: { name: string; description?: string; geometry: Geometry }) {
  return withLatency(() => {
    const nextId = (store.reservoirs.reduce((acc, item) => Math.max(acc, Number(item.properties?.id || 0)), 0) || 0) + 1;
    const feature: ReservoirFeature = {
      type: 'Feature',
      geometry: params.geometry,
      properties: {
        id: nextId,
        name: params.name,
        description: params.description || null,
      },
    };
    store.reservoirs.push(feature);
    store.contexts[getReservoirKey(nextId)] = {
      reservoir_id: nextId,
      reservatorio_nome: params.name,
      status_monitoramento: 'active',
      parametros: {},
      metadados: { fonte: 'mock-runtime' },
      geom_monitoramento: params.geometry,
      geom_entorno: null,
      geom_app: null,
      geom_bacia_imediata: null,
      updated_at: new Date().toISOString(),
    };
    store.areas[getReservoirKey(nextId)] = fallbackFeatureCollection();
    store.images[getReservoirKey(nextId)] = [];
    store.timeseries[getReservoirKey(nextId)] = [];
    store.cycles[getReservoirKey(nextId)] = [];
    store.alerts[getReservoirKey(nextId)] = [];
    store.history[getReservoirKey(nextId)] = [];
    return {
      id: nextId,
      name: params.name,
      description: params.description || null,
      geometry: params.geometry,
    };
  });
}

export async function deleteReservoir(reservoirId: number) {
  return withLatency(() => {
    ensureReservoir(reservoirId);
    store.reservoirs = store.reservoirs.filter((item) => Number(item.properties?.id || 0) !== reservoirId);
    delete store.contexts[getReservoirKey(reservoirId)];
    delete store.areas[getReservoirKey(reservoirId)];
    delete store.images[getReservoirKey(reservoirId)];
    delete store.timeseries[getReservoirKey(reservoirId)];
    delete store.cycles[getReservoirKey(reservoirId)];
    delete store.alerts[getReservoirKey(reservoirId)];
    delete store.history[getReservoirKey(reservoirId)];
  });
}

export async function getReservoirContext(reservoirId: number) {
  return withLatency(() => {
    ensureReservoir(reservoirId);
    const ctx = store.contexts[getReservoirKey(reservoirId)];
    if (!ctx) throw new Error(`Contexto mock indisponivel para reservatorio ${reservoirId}.`);
    return deepClone(ctx);
  });
}

export async function updateReservoirContext(
  reservoirId: number,
  payload: Partial<ReservoirContext> & { parametros?: Record<string, unknown>; metadados?: Record<string, unknown> }
) {
  return withLatency(() => {
    const feature = ensureReservoir(reservoirId);
    const current = store.contexts[getReservoirKey(reservoirId)] || {
      reservoir_id: reservoirId,
      reservatorio_nome: feature.properties?.name || `Reservatorio ${reservoirId}`,
      status_monitoramento: 'active',
      parametros: {},
      metadados: {},
    };
    const next: ReservoirContext = {
      ...current,
      ...deepClone(payload),
      parametros: { ...(current.parametros || {}), ...(payload.parametros || {}) },
      metadados: { ...(current.metadados || {}), ...(payload.metadados || {}) },
      updated_at: new Date().toISOString(),
    };
    store.contexts[getReservoirKey(reservoirId)] = next;
    return deepClone(next);
  });
}

export async function listMonitoringAreas(reservoirId: number) {
  return withLatency(() => {
    ensureReservoir(reservoirId);
    return deepClone(store.areas[getReservoirKey(reservoirId)] || fallbackFeatureCollection());
  });
}

export async function createMonitoringArea(
  reservoirId: number,
  payload: { nome_area: string; tipo_area: string; geometry: Geometry; limiar_degradacao?: number }
) {
  return withLatency(() => {
    ensureReservoir(reservoirId);
    const current = store.areas[getReservoirKey(reservoirId)] || fallbackFeatureCollection();
    const allIds = Object.values(store.areas)
      .flatMap((fc) => (fc.features || []).map((feature) => Number(feature.properties?.id || 0)))
      .filter((id) => Number.isFinite(id));
    const id = (allIds.length ? Math.max(...allIds) : 2000) + 1;
    const feature = {
      type: 'Feature',
      geometry: payload.geometry,
      properties: {
        id,
        reservoir_id: reservoirId,
        nome_area: payload.nome_area,
        tipo_area: payload.tipo_area,
        area_ha: 1000,
        perimetro_km: 52,
        limiar_degradacao: payload.limiar_degradacao ?? null,
        created_at: new Date().toISOString(),
      },
    };
    current.features.push(feature as any);
    store.areas[getReservoirKey(reservoirId)] = current;

    const ctx = store.contexts[getReservoirKey(reservoirId)];
    if (ctx) {
      if (payload.tipo_area === 'monitoring_aoi') ctx.geom_monitoramento = payload.geometry;
      if (payload.tipo_area === 'app') ctx.geom_app = payload.geometry;
      if (payload.tipo_area === 'surroundings') ctx.geom_entorno = payload.geometry;
      ctx.updated_at = new Date().toISOString();
    }

    return {
      id,
      reservoir_id: reservoirId,
      nome_area: payload.nome_area,
      tipo_area: payload.tipo_area,
      area_ha: 1000,
      perimetro_km: 52,
    };
  });
}

export async function deleteMonitoringArea(reservoirId: number, areaId: number) {
  return withLatency(() => {
    ensureReservoir(reservoirId);
    const current = store.areas[getReservoirKey(reservoirId)] || fallbackFeatureCollection();
    current.features = current.features.filter((feature) => Number(feature.properties?.id || 0) !== areaId);
    store.areas[getReservoirKey(reservoirId)] = current;
  });
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
  return withLatency(() => {
    ensureReservoir(reservoirId);
    const from = payload.dateFrom;
    const to = payload.dateTo;
    const satelliteUpper = payload.satellite.toUpperCase();
    const rows = (store.images[getReservoirKey(reservoirId)] || []).filter((image) => {
      const meta = store.image_meta.find((item) => item.image_id === image.id);
      if (!meta) return false;
      return (
        meta.date >= from &&
        meta.date <= to &&
        meta.cloud_pct <= payload.cloudPct &&
        meta.satellite.toUpperCase().includes(satelliteUpper.split('_')[0])
      );
    });
    const maxResults = Math.max(1, Math.min(Number(payload.maxResults || 24), 120));
    return deepClone(rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, maxResults));
  });
}

export async function previewReservoirImage(payload: {
  imageId: string;
  satellite: string;
  polygon: Geometry;
}) {
  return withLatency(() => {
    const meta = store.image_meta.find((item) => item.image_id === payload.imageId);
    if (!meta) {
      return { tileUrl: TILE_TEMPLATES.preview };
    }
    const ctx = store.contexts[getReservoirKey(meta.reservoir_id)];
    const bounds = getBoundsFromGeometry((ctx?.geom_monitoramento || payload.polygon) as Geometry);
    return {
      imageOverlayUrl: makeOverlayDataUrl(`Mock preview ${meta.date} - ${meta.satellite}`, '#0f766e', '#1d4ed8'),
      imageOverlayBounds: bounds as [[number, number], [number, number]],
    };
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
  return withLatency(() => {
    const reservoir = ensureReservoir(reservoirId);
    const cycle = getCycleByImage(reservoirId, payload.imageId) || getLatestCycle(reservoirId);
    if (!cycle) throw new Error('Nao ha ciclos mock para calcular indices.');
    const requested = payload.indices.length ? payload.indices : ['NDVI'];
    const stats: ReservoirIndicesResponse['stats_by_index'] = {};
    const results = requested.map((name) => {
      const upper = name.toUpperCase();
      const mean = metricValueByIndicator(cycle, upper);
      stats[upper] = {
        min: Number((mean - 0.08).toFixed(4)),
        max: Number((mean + 0.09).toFixed(4)),
        mean: Number(mean.toFixed(4)),
      };
      const tileKey = upper.toLowerCase();
      return {
        indexName: upper,
        imageUrl: TILE_TEMPLATES[tileKey] || TILE_TEMPLATES.ndvi,
        downloadUrl: `data:text/plain;charset=utf-8,${encodeURIComponent(`mock-${upper}-${cycle.date}`)}`,
      };
    });
    return {
      analysis_id: pseudoAnalysisId(),
      bounds: getBoundsFromGeometry((payload.polygon || reservoir.geometry) as Geometry),
      results,
      stats_by_index: stats,
      image_date: cycle.date,
    };
  });
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
  return withLatency(() => {
    ensureReservoir(reservoirId);
    const cycle = getCycleByImage(reservoirId, payload.imageId) || getLatestCycle(reservoirId);
    if (!cycle) throw new Error('Nao ha ciclo mock para extracao de espelho dagua.');
    const previous = getCycleBeforeDate(reservoirId, cycle.date);
    const previousArea = previous ? previous.indicators.water_area_ha : null;
    const variation =
      previousArea && previousArea > 0
        ? ((cycle.indicators.water_area_ha - previousArea) / previousArea) * 100
        : null;
    const alertMatch = (store.alerts[getReservoirKey(reservoirId)] || []).find(
      (item) =>
        item.tipo_alerta === 'reducao_espelho_agua' &&
        String(item.data_alerta || '').slice(0, 10) === cycle.date
    );
    return {
      analysis_id: pseudoAnalysisId(),
      area_ha: Number(cycle.indicators.water_area_ha.toFixed(2)),
      previous_area_ha: previousArea !== null ? Number(previousArea.toFixed(2)) : null,
      variacao_percentual: variation !== null ? Number(variation.toFixed(2)) : null,
      tile_url: TILE_TEMPLATES.water,
      water_geojson: deepClone(cycle.water_geojson),
      alert_id: alertMatch?.id ?? null,
    } as ReservoirWaterbodyResult;
  });
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
  return withLatency(() => {
    ensureReservoir(reservoirId);
    const maxPoints = Math.max(2, payload.max_points || 18);
    const indicator = payload.indicator_name.toUpperCase();
    const seriesSource = getReservoirSeries(reservoirId);
    const sourceRows = seriesSource.length
      ? seriesSource
      : getReservoirCycles(reservoirId).map((cycle) => ({
          date: cycle.date,
          ndvi: cycle.indicators.ndvi,
          ndwi: cycle.indicators.ndwi,
          mndwi: cycle.indicators.mndwi,
          ndmi: cycle.indicators.ndmi,
          savi: cycle.indicators.savi,
          turbidity_proxy: cycle.indicators.turbidity_proxy,
          water_area_ha: cycle.indicators.water_area_ha,
          app_ndvi_mean: cycle.app.ndvi_mean,
        }));

    const series = sourceRows
      .filter((row) => row.date >= payload.date_start && row.date <= payload.date_end)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-maxPoints)
      .map((row) => ({
        date: row.date,
        value:
          payload.metric === 'water_area'
            ? Number(row.water_area_ha.toFixed(2))
            : Number(metricValueBySeriesPoint(row, indicator).toFixed(4)),
      }));
    let trend = 'stable';
    if (series.length >= 2) {
      const delta = series[series.length - 1].value - series[0].value;
      if (delta > 0.02) trend = 'up';
      if (delta < -0.02) trend = 'down';
    }
    return {
      analysis_id: pseudoAnalysisId(),
      indicator_name: indicator,
      metric: payload.metric,
      trend,
      series,
    } as ReservoirTimeSeriesResult;
  });
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
  return withLatency(() => {
    ensureReservoir(reservoirId);
    const cycle = getCycleByImage(reservoirId, payload.imageId) || getLatestCycle(reservoirId);
    if (!cycle) throw new Error('Nao ha ciclo mock para classificacao de uso do solo.');
    return {
      analysis_id: pseudoAnalysisId(),
      classification_id: `mock-class-${reservoirId}-${cycle.date}`,
      tile_url: TILE_TEMPLATES.landuse,
      legend: deepClone(cycle.landuse.legend),
      class_stats: deepClone(cycle.landuse.class_stats),
      comparison: deepClone(cycle.landuse.comparison),
    } as ReservoirLandUseResult;
  });
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
  return withLatency(() => {
    ensureReservoir(reservoirId);
    const before = getCycleByImage(reservoirId, payload.beforeImageId);
    const after = getCycleByImage(reservoirId, payload.afterImageId);
    if (!before || !after) throw new Error('As imagens selecionadas nao possuem ciclos mock associados.');

    const gainArea = Math.max(after.change.gain_area_ha, 0.2);
    const lossArea = Math.max(after.change.loss_area_ha, 0.2);
    const totalArea = Math.max(after.change.total_area_ha, 1);
    const alertMatch = (store.alerts[getReservoirKey(reservoirId)] || []).find(
      (item) =>
        item.tipo_alerta === 'aumento_solo_exposto' &&
        String(item.data_alerta || '').slice(0, 10) === after.date
    );
    return {
      analysis_id: pseudoAnalysisId(),
      alert_id: alertMatch?.id ?? null,
      changeGeoJson: deepClone(after.change.change_geojson),
      differenceImageUrl: TILE_TEMPLATES.change,
      gainAreaHa: Number(gainArea.toFixed(2)),
      lossAreaHa: Number(lossArea.toFixed(2)),
      totalAreaHa: Number(totalArea.toFixed(2)),
    } as ReservoirChangeResult;
  });
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
  return withLatency(() => {
    ensureReservoir(reservoirId);
    const cycle = getCycleByImage(reservoirId, payload.imageId) || getLatestCycle(reservoirId);
    if (!cycle) throw new Error('Nao ha ciclo mock para monitoramento da APP.');
    const alertMatch = (store.alerts[getReservoirKey(reservoirId)] || []).find(
      (item) =>
        item.tipo_alerta === 'queda_ndvi_app' &&
        String(item.data_alerta || '').slice(0, 10) === cycle.date
    );
    return {
      analysis_id: pseudoAnalysisId(),
      image_date: cycle.date,
      ndvi_mean: cycle.app.ndvi_mean,
      previous_ndvi_mean: cycle.app.previous_ndvi_mean,
      variacao_pct: cycle.app.variacao_pct,
      alert_id: alertMatch?.id ?? null,
    };
  });
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
  return withLatency(() => {
    ensureReservoir(reservoirId);
    const cycle = getCycleByImage(reservoirId, payload.imageId) || getLatestCycle(reservoirId);
    if (!cycle) throw new Error('Nao ha ciclo mock para proxy de turbidez.');
    const alertMatch = (store.alerts[getReservoirKey(reservoirId)] || []).find(
      (item) =>
        item.tipo_alerta === 'aumento_proxy_turbidez' &&
        String(item.data_alerta || '').slice(0, 10) === cycle.date
    );
    return {
      analysis_id: pseudoAnalysisId(),
      image_date: cycle.date,
      indicator: 'TURBIDITY_PROXY',
      stats: deepClone(cycle.turbidity),
      alert_id: alertMatch?.id ?? null,
    };
  });
}

export async function listReservoirAlerts(reservoirId: number, statusFilter?: string) {
  return withLatency(() => {
    ensureReservoir(reservoirId);
    const rows = deepClone(store.alerts[getReservoirKey(reservoirId)] || []);
    return {
      reservoir_id: reservoirId,
      items: statusFilter ? rows.filter((item) => item.status === statusFilter) : rows,
    };
  });
}

export async function updateAlertStatus(alertId: number, status: string) {
  return withLatency(() => {
    for (const key of Object.keys(store.alerts)) {
      const idx = store.alerts[key].findIndex((item) => item.id === alertId);
      if (idx >= 0) {
        store.alerts[key][idx] = {
          ...store.alerts[key][idx],
          status,
        };
        return { id: alertId, status };
      }
    }
    throw new Error(`Alerta ${alertId} nao encontrado no mock.`);
  });
}

export async function listReservoirHistory(reservoirId: number) {
  return withLatency(() => ({
    reservoir_id: reservoirId,
    items: deepClone(store.history[getReservoirKey(reservoirId)] || []),
  }));
}

export async function listWaterHistory(reservoirId: number) {
  return withLatency(() => ({
    reservoir_id: reservoirId,
    items: deepClone(store.history[getReservoirKey(reservoirId)] || []).filter(
      (item) => String(item.tipo_analise || '').toLowerCase() === 'espelho_agua'
    ),
  }));
}

export async function generateReservoirInsight(
  reservoirId: number,
  payload: { periodo_inicio?: string; periodo_fim?: string; limite_analises?: number }
) {
  return withLatency(() => {
    const reservoir = ensureReservoir(reservoirId);
    const latest = getLatestCycle(reservoirId);
    if (!latest) throw new Error('Nao ha ciclos mock para gerar insight.');
    const activeAlerts = (store.alerts[getReservoirKey(reservoirId)] || []).filter((item) => item.status === 'active');
    const insightObj = {
      reservoir_id: reservoirId,
      period: {
        inicio: payload.periodo_inicio || store.meta.period_start,
        fim: payload.periodo_fim || store.meta.period_end,
      },
      latest_cycle: latest.campaign_name,
      indicadores: {
        ndvi: latest.indicators.ndvi,
        water_area_ha: latest.indicators.water_area_ha,
        turbidity_proxy: latest.indicators.turbidity_proxy,
        app_ndvi: latest.app.ndvi_mean,
      },
      alerts_active: activeAlerts.length,
      confidence: 'medium-high',
    };
    const texto =
      `No periodo ${insightObj.period.inicio} a ${insightObj.period.fim}, o reservatorio ` +
      `${reservoir.properties?.name || reservoirId} apresentou NDVI medio de ${latest.indicators.ndvi.toFixed(3)} ` +
      `e area de agua de ${latest.indicators.water_area_ha.toFixed(2)} ha no ciclo mais recente. ` +
      `O proxy de turbidez ficou em ${latest.indicators.turbidity_proxy.toFixed(4)} e ha ${activeAlerts.length} alertas ativos. ` +
      `Recomenda-se manter acompanhamento mensal e priorizar verificacao de campo nos setores com perda de cobertura ciliar.`;
    return {
      id: pseudoAnalysisId(),
      reservoir_id: reservoirId,
      insight: insightObj,
      texto,
    };
  });
}

export async function getReservoirDashboard() {
  return withLatency(() => computeDashboard());
}

export function getReservoirReportCsvUrl(reservoirId: number, dateStart?: string, dateEnd?: string) {
  const csv = csvReportForReservoir(reservoirId, dateStart, dateEnd);
  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
}

export async function getReservoirReportJson(reservoirId: number, dateStart?: string, dateEnd?: string) {
  return withLatency(() => {
    ensureReservoir(reservoirId);
    const cycles = getReservoirCycles(reservoirId).filter(
      (cycle) => (!dateStart || cycle.date >= dateStart) && (!dateEnd || cycle.date <= dateEnd)
    );
    return {
      reservoir_id: reservoirId,
      meta: {
        generated_at: new Date().toISOString(),
        period_start: dateStart || store.meta.period_start,
        period_end: dateEnd || store.meta.period_end,
      },
      dashboard: computeDashboard(),
      cycles,
      alerts: deepClone(store.alerts[getReservoirKey(reservoirId)] || []),
    };
  });
}
