import type { Feature, FeatureCollection, Geometry } from 'geojson';

export interface ReservoirFeatureProperties {
  id: number;
  name: string;
  description?: string | null;
}

export type ReservoirFeature = Feature<Geometry, ReservoirFeatureProperties>;

export interface ReservoirContext {
  reservoir_id: number;
  reservatorio_nome: string;
  reservatorio_codigo?: string | null;
  reservatorio_tipo?: string | null;
  orgao_responsavel?: string | null;
  municipio?: string | null;
  estado?: string | null;
  status_monitoramento: string;
  parametros: Record<string, unknown>;
  metadados: Record<string, unknown>;
  geom_monitoramento?: Geometry | null;
  geom_entorno?: Geometry | null;
  geom_app?: Geometry | null;
  geom_bacia_imediata?: Geometry | null;
  updated_at?: string | null;
}

export interface ReservoirImageInfo {
  id: string;
  date: string;
  thumbnailUrl: string;
}

export interface ReservoirIndexResult {
  indexName: string;
  imageUrl: string;
  downloadUrl?: string | null;
  classification?: Record<string, unknown> | null;
}

export interface ReservoirIndicesResponse {
  analysis_id: number;
  bounds: number[][];
  results: ReservoirIndexResult[];
  stats_by_index: Record<string, { min: number | null; max: number | null; mean: number | null }>;
  image_date?: string;
}

export interface ReservoirWaterbodyResult {
  analysis_id: number;
  area_ha: number;
  previous_area_ha: number | null;
  variacao_percentual: number | null;
  tile_url: string;
  water_geojson: FeatureCollection;
  alert_id?: number | null;
}

export interface ReservoirTimeSeriesResult {
  analysis_id: number;
  indicator_name: string;
  metric: string;
  trend: string;
  series: Array<{ date: string; value: number }>;
}

export interface ReservoirLandUseResult {
  analysis_id: number;
  classification_id: string;
  tile_url: string;
  legend: Array<{ id: number; name: string; color: string }>;
  class_stats: Array<{ class_id: number; class_name: string; color: string; area_ha: number; area_pct: number }>;
  comparison: { soil_exposed_delta_pct: number | null; anthropic_delta_pct: number | null };
}

export interface ReservoirChangeResult {
  analysis_id: number;
  alert_id?: number | null;
  changeGeoJson: FeatureCollection;
  differenceImageUrl?: string | null;
  gainAreaHa: number;
  lossAreaHa: number;
  totalAreaHa: number;
}

export interface ReservoirAlert {
  id: number;
  analysis_id?: number | null;
  tipo_alerta: string;
  severidade: string;
  mensagem: string;
  valor_metrica?: number | null;
  valor_limiar?: number | null;
  status: string;
  contexto?: Record<string, unknown>;
  data_alerta?: string | null;
}

export interface ReservoirDashboard {
  total_reservatorios_monitorados: number;
  reservatorios_ativos_monitoramento: number;
  alertas_ativos: number;
  variacao_media_area_alagada_pct: number;
  ocorrencias_por_severidade: Array<{ severidade: string; qtd: number }>;
  ranking_criticidade: Array<{ reservoir_id: number; reservatorio_nome: string; active_alerts: number }>;
}
