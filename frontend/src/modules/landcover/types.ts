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
