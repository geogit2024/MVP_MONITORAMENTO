import type { Feature, FeatureCollection, Geometry } from 'geojson';

export interface LandCoverClassDef {
  id: number;
  name: string;
  color: string;
}

export interface LandCoverLegendItem {
  class_id: number;
  class: string;
  color: string;
}

export interface LandCoverStatItem {
  class_id: number;
  class: string;
  area_ha: number;
  color: string;
}

export interface LandCoverClassifyRequest {
  aoi: Geometry;
  training_samples: FeatureCollection;
  date_start: string;
  date_end: string;
  satellite: 'sentinel2';
  classes: LandCoverClassDef[];
}

export interface LandCoverClassifyResponse {
  classification_id: string;
  tile_url: string;
  legend: LandCoverLegendItem[];
  class_stats: LandCoverStatItem[];
  export_url: string;
}

export type LandCoverPolygonStatus = 'suggested' | 'approved' | 'rejected' | 'edited';

export interface LandCoverAIPolygonProperties {
  polygon_id?: string;
  status?: LandCoverPolygonStatus;
  area_ha?: number;
  ndvi_mean?: number;
  ndwi_mean?: number;
  ndbi_mean?: number;
  savi_mean?: number;
  homogeneity_score?: number;
  class_hint?: string;
  class_id?: number;
  class_name?: string;
  color?: string;
  [key: string]: unknown;
}

export interface LandCoverVectorizeRequest {
  aoi: Geometry;
  date_start: string;
  date_end: string;
  satellite: 'sentinel2';
  indices?: string[];
  segment_size: number;
  compactness: number;
  connectivity: 4 | 8;
  min_area_ha: number;
  simplify_meters: number;
  max_segments: number;
  mode: 'advanced_ai';
}

export interface LandCoverVectorizeResponse {
  vectorization_id: string;
  polygons: FeatureCollection<Geometry, LandCoverAIPolygonProperties>;
  summary: {
    total_polygons: number;
    total_area_ha: number;
    min_area_ha: number;
    max_area_ha: number;
  };
  metadata: Record<string, unknown>;
  params_used: Record<string, unknown>;
}

export interface LandCoverClassifyPolygonsRequest {
  polygons: FeatureCollection<Geometry, LandCoverAIPolygonProperties>;
  date_start: string;
  date_end: string;
  satellite: 'sentinel2';
  aoi?: Geometry;
  vectorization_id?: string;
  classes?: LandCoverClassDef[];
  only_statuses?: LandCoverPolygonStatus[];
  persist?: boolean;
}

export interface LandCoverClassifyPolygonsResponse extends LandCoverClassifyResponse {
  polygons: FeatureCollection<Geometry, LandCoverAIPolygonProperties>;
  summary: {
    total_polygons: number;
    total_area_ha: number;
    included_statuses?: string[];
  };
  metadata: Record<string, unknown>;
}

export interface LandCoverRefineRequest {
  base_classification_id?: string;
  base_classification_asset?: string;
  source_aoi?: Geometry;
  date_start?: string;
  date_end?: string;
  classes?: LandCoverClassDef[];
  refinement_polygon: Geometry;
  new_training_samples: FeatureCollection;
}

export interface LandCoverRefineResponse extends LandCoverClassifyResponse {}

export type TrainingSampleFeature = Feature<Geometry, { class_id: number }>;
