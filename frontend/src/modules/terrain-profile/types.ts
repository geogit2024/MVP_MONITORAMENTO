export type TerrainProfileStatus = 'idle' | 'drawing' | 'analyzing' | 'ready' | 'error'

export type TerrainReliefClass =
  | 'plano'
  | 'suave ondulado'
  | 'ondulado'
  | 'fortemente ondulado'
  | 'acidentado'

export type TerrainSegmentType = 'flat' | 'uphill' | 'downhill' | 'steep' | 'ridge' | 'valley'

export type TerrainFeatureType =
  | 'topo'
  | 'vale'
  | 'encosta'
  | 'trecho_plano'
  | 'ruptura_declive'
  | 'segmento_critico'

export interface TerrainProfilePoint {
  index: number
  distanceMeters: number
  elevationMeters: number
  longitude: number
  latitude: number
}

export interface TerrainProfileSegment {
  startDistance: number
  endDistance: number
  slopePercent: number
  type: TerrainSegmentType
}

export interface TerrainProfileSummary {
  totalDistanceMeters: number
  minElevationMeters: number
  maxElevationMeters: number
  averageElevationMeters: number
  elevationRangeMeters: number
  averageSlopePercent: number
  maxSlopePercent: number
  minSlopePercent: number
  averageGradePercent: number
  uphillDistanceMeters: number
  downhillDistanceMeters: number
  slopeBreakCount: number
  criticalSegmentCount: number
  terrainClass: TerrainReliefClass
  features: TerrainFeatureType[]
}

export interface TerrainProfileAnalysisResult {
  profilePoints: TerrainProfilePoint[]
  summary: TerrainProfileSummary
  segments: TerrainProfileSegment[]
  aiDescription: string
  warnings: string[]
}

export interface TerrainProfileAIRequest {
  summary: TerrainProfileSummary
  segments: TerrainProfileSegment[]
}

export interface TerrainProfileAIResponse {
  description: string
  source: 'openai' | 'heuristic'
}
