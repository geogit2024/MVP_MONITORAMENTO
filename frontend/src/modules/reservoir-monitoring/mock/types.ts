import type { FeatureCollection, Geometry } from 'geojson';
import type {
  ReservoirAlert,
  ReservoirContext,
  ReservoirDashboard,
  ReservoirFeature,
  ReservoirImageInfo,
} from '../types';

export interface ReservoirMockImageMeta {
  image_id: string;
  reservoir_id: number;
  date: string;
  satellite: string;
  cloud_pct: number;
}

export interface ReservoirMockSeriesPoint {
  date: string;
  ndvi: number;
  ndwi: number;
  mndwi: number;
  ndmi: number;
  savi: number;
  turbidity_proxy: number;
  water_area_ha: number;
  app_ndvi_mean: number;
}

export interface ReservoirMockLandUseClassStat {
  class_id: number;
  class_name: string;
  color: string;
  area_ha: number;
  area_pct: number;
}

export interface ReservoirMockCycle {
  id: number;
  reservoir_id: number;
  campaign_name: string;
  date: string;
  image_id: string;
  satellite: string;
  cloud_pct: number;
  indicators: {
    ndvi: number;
    ndwi: number;
    mndwi: number;
    ndmi: number;
    savi: number;
    turbidity_proxy: number;
    water_area_ha: number;
  };
  app: {
    ndvi_mean: number;
    previous_ndvi_mean: number | null;
    variacao_pct: number | null;
  };
  turbidity: {
    min: number;
    max: number;
    mean: number;
  };
  landuse: {
    legend: Array<{ id: number; name: string; color: string }>;
    class_stats: ReservoirMockLandUseClassStat[];
    comparison: {
      soil_exposed_delta_pct: number | null;
      anthropic_delta_pct: number | null;
    };
  };
  change: {
    gain_area_ha: number;
    loss_area_ha: number;
    total_area_ha: number;
    change_geojson: FeatureCollection;
  };
  water_geojson: FeatureCollection;
}

export interface ReservoirMockSeedData {
  meta: {
    generated_at: string;
    months: number;
    period_start: string;
    period_end: string;
  };
  reservoirs: ReservoirFeature[];
  contexts: Record<string, ReservoirContext>;
  areas: Record<string, FeatureCollection>;
  images: Record<string, ReservoirImageInfo[]>;
  image_meta: ReservoirMockImageMeta[];
  timeseries: Record<string, ReservoirMockSeriesPoint[]>;
  cycles: Record<string, ReservoirMockCycle[]>;
  alerts: Record<string, ReservoirAlert[]>;
  history: Record<string, Array<Record<string, unknown>>>;
  dashboard: ReservoirDashboard;
}
