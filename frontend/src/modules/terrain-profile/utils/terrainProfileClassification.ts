import type {
  TerrainFeatureType,
  TerrainProfileAnalysisResult,
  TerrainProfilePoint,
  TerrainProfileSegment,
  TerrainReliefClass,
} from '../types'
import { mean, roundTo } from './terrainProfileMath'

const FLAT_SLOPE_THRESHOLD_PERCENT = 1.5
const STEEP_SLOPE_THRESHOLD_PERCENT = 18
const CRITICAL_SLOPE_THRESHOLD_PERCENT = 30
const SLOPE_BREAK_DELTA_THRESHOLD_PERCENT = 8
const LOCAL_FEATURE_PROMINENCE_METERS = 2

const classifySegmentType = (slopePercent: number): TerrainProfileSegment['type'] => {
  const absSlope = Math.abs(slopePercent)
  if (absSlope >= STEEP_SLOPE_THRESHOLD_PERCENT) return 'steep'
  if (absSlope <= FLAT_SLOPE_THRESHOLD_PERCENT) return 'flat'
  if (slopePercent > 0) return 'uphill'
  return 'downhill'
}

const classifyTerrainRelief = (averageSlopePercent: number): TerrainReliefClass => {
  const value = Math.abs(averageSlopePercent)
  if (value < 3) return 'plano'
  if (value < 8) return 'suave ondulado'
  if (value < 20) return 'ondulado'
  if (value < 45) return 'fortemente ondulado'
  return 'acidentado'
}

const detectLocalLandforms = (points: TerrainProfilePoint[]): TerrainProfileSegment[] => {
  if (points.length < 3) return []

  const result: TerrainProfileSegment[] = []
  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = points[index - 1]
    const current = points[index]
    const next = points[index + 1]

    const isRidge =
      current.elevationMeters - prev.elevationMeters >= LOCAL_FEATURE_PROMINENCE_METERS &&
      current.elevationMeters - next.elevationMeters >= LOCAL_FEATURE_PROMINENCE_METERS
    const isValley =
      prev.elevationMeters - current.elevationMeters >= LOCAL_FEATURE_PROMINENCE_METERS &&
      next.elevationMeters - current.elevationMeters >= LOCAL_FEATURE_PROMINENCE_METERS

    if (isRidge) {
      result.push({
        startDistance: current.distanceMeters,
        endDistance: current.distanceMeters,
        slopePercent: 0,
        type: 'ridge',
      })
    } else if (isValley) {
      result.push({
        startDistance: current.distanceMeters,
        endDistance: current.distanceMeters,
        slopePercent: 0,
        type: 'valley',
      })
    }
  }
  return result
}

const summarizeFeatures = (
  segments: TerrainProfileSegment[],
  slopeBreakCount: number,
): TerrainFeatureType[] => {
  const features = new Set<TerrainFeatureType>()
  if (segments.some((segment) => segment.type === 'ridge')) features.add('topo')
  if (segments.some((segment) => segment.type === 'valley')) features.add('vale')
  if (segments.some((segment) => segment.type === 'uphill' || segment.type === 'downhill')) {
    features.add('encosta')
  }
  if (segments.some((segment) => segment.type === 'flat')) features.add('trecho_plano')
  if (slopeBreakCount > 0) features.add('ruptura_declive')
  if (segments.some((segment) => Math.abs(segment.slopePercent) >= CRITICAL_SLOPE_THRESHOLD_PERCENT)) {
    features.add('segmento_critico')
  }
  return [...features]
}

export const buildTerrainProfileAnalysis = (
  profilePoints: TerrainProfilePoint[],
): Omit<TerrainProfileAnalysisResult, 'aiDescription'> => {
  if (profilePoints.length < 2) {
    throw new Error('Sao necessarios ao menos dois pontos para calcular o perfil do terreno.')
  }

  const baseSegments: TerrainProfileSegment[] = []
  let uphillDistanceMeters = 0
  let downhillDistanceMeters = 0
  let slopeBreakCount = 0

  for (let index = 1; index < profilePoints.length; index += 1) {
    const previous = profilePoints[index - 1]
    const current = profilePoints[index]
    const deltaDistance = Math.max(0.000001, current.distanceMeters - previous.distanceMeters)
    const deltaElevation = current.elevationMeters - previous.elevationMeters
    const slopePercent = (deltaElevation / deltaDistance) * 100
    const type = classifySegmentType(slopePercent)

    if (slopePercent > FLAT_SLOPE_THRESHOLD_PERCENT) uphillDistanceMeters += deltaDistance
    if (slopePercent < -FLAT_SLOPE_THRESHOLD_PERCENT) downhillDistanceMeters += deltaDistance

    if (index >= 2) {
      const previousSlope = baseSegments[baseSegments.length - 1].slopePercent
      if (Math.abs(slopePercent - previousSlope) >= SLOPE_BREAK_DELTA_THRESHOLD_PERCENT) {
        slopeBreakCount += 1
      }
    }

    baseSegments.push({
      startDistance: previous.distanceMeters,
      endDistance: current.distanceMeters,
      slopePercent,
      type,
    })
  }

  const localLandforms = detectLocalLandforms(profilePoints)
  const segments = [...baseSegments, ...localLandforms]

  const elevations = profilePoints.map((point) => point.elevationMeters)
  const slopes = baseSegments.map((segment) => segment.slopePercent)
  const absSlopes = slopes.map((value) => Math.abs(value))

  const minElevationMeters = Math.min(...elevations)
  const maxElevationMeters = Math.max(...elevations)
  const averageElevationMeters = mean(elevations)
  const averageSlopePercent = mean(absSlopes)
  const maxSlopePercent = slopes.length ? Math.max(...slopes) : 0
  const minSlopePercent = slopes.length ? Math.min(...slopes) : 0
  const totalDistanceMeters = profilePoints[profilePoints.length - 1].distanceMeters
  const criticalSegmentCount = baseSegments.filter(
    (segment) => Math.abs(segment.slopePercent) >= CRITICAL_SLOPE_THRESHOLD_PERCENT,
  ).length

  return {
    profilePoints,
    summary: {
      totalDistanceMeters: roundTo(totalDistanceMeters, 2),
      minElevationMeters: roundTo(minElevationMeters, 2),
      maxElevationMeters: roundTo(maxElevationMeters, 2),
      averageElevationMeters: roundTo(averageElevationMeters, 2),
      elevationRangeMeters: roundTo(maxElevationMeters - minElevationMeters, 2),
      averageSlopePercent: roundTo(averageSlopePercent, 2),
      maxSlopePercent: roundTo(maxSlopePercent, 2),
      minSlopePercent: roundTo(minSlopePercent, 2),
      averageGradePercent: roundTo(averageSlopePercent, 2),
      uphillDistanceMeters: roundTo(uphillDistanceMeters, 2),
      downhillDistanceMeters: roundTo(downhillDistanceMeters, 2),
      slopeBreakCount,
      criticalSegmentCount,
      terrainClass: classifyTerrainRelief(averageSlopePercent),
      features: summarizeFeatures(segments, slopeBreakCount),
    },
    segments,
    warnings: [],
  }
}
