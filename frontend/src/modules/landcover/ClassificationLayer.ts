import type { FeatureCollection, Geometry } from 'geojson';
import type {
  LandCoverClassDef,
  LandCoverClassifyResponse,
  LandCoverRefineResponse,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function classifyLandCover(params: {
  aoiGeometry: Geometry;
  trainingSamples: FeatureCollection;
  dateStart: string;
  dateEnd: string;
  classes: LandCoverClassDef[];
}): Promise<LandCoverClassifyResponse> {
  const response = await fetch(`${API_BASE_URL}/analysis/landcover/classify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      aoi: params.aoiGeometry,
      training_samples: params.trainingSamples,
      date_start: params.dateStart,
      date_end: params.dateEnd,
      satellite: 'sentinel2',
      classes: params.classes,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.detail || 'Falha na classificacao LULC.');
  }
  return payload as LandCoverClassifyResponse;
}

export async function fetchLandCoverStats(classificationId: string) {
  const response = await fetch(
    `${API_BASE_URL}/analysis/landcover/stats?classification_id=${encodeURIComponent(classificationId)}`
  );
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.detail || 'Falha ao buscar estatisticas LULC.');
  }
  return payload;
}

export async function refineLandCoverClassification(params: {
  baseClassificationId?: string;
  baseClassificationAsset?: string;
  sourceAoiGeometry?: Geometry;
  dateStart?: string;
  dateEnd?: string;
  classes?: LandCoverClassDef[];
  refinementPolygonGeometry: Geometry;
  newTrainingSamples: FeatureCollection;
}): Promise<LandCoverRefineResponse> {
  const response = await fetch(`${API_BASE_URL}/api/earth-images/refine-classification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base_classification_id: params.baseClassificationId,
      base_classification_asset: params.baseClassificationAsset,
      source_aoi: params.sourceAoiGeometry,
      date_start: params.dateStart,
      date_end: params.dateEnd,
      classes: params.classes,
      refinement_polygon: params.refinementPolygonGeometry,
      new_training_samples: params.newTrainingSamples,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.detail || 'Falha no refinamento da classificacao.');
  }
  return payload as LandCoverRefineResponse;
}
