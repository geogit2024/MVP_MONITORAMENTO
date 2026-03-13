import {
  Cartographic,
  EllipsoidGeodesic,
  Math as CesiumMath,
  sampleTerrainMostDetailed,
  type TerrainProvider,
} from 'cesium'
import type { TerrainProfilePoint } from '../types'
import { clamp, haversineDistanceMeters } from './terrainProfileMath'

interface ResolveSampleCountInput {
  lineLengthMeters: number
  preferredSampleCount?: number
  minSamples?: number
  maxSamples?: number
}

interface SampleTerrainProfileInput {
  terrainProvider: TerrainProvider
  start: Cartographic
  end: Cartographic
  preferredSampleCount?: number
  minSamples?: number
  maxSamples?: number
}

export interface SampleTerrainProfileResult {
  points: TerrainProfilePoint[]
  totalDistanceMeters: number
  sampleCount: number
  invalidElevationCount: number
}

const DEFAULT_MIN_SAMPLES = 50
const DEFAULT_MAX_SAMPLES = 200
const DEFAULT_PREFERRED_SAMPLES = 100
const METERS_PER_SAMPLE_TARGET = 30

export const resolveAdaptiveSampleCount = ({
  lineLengthMeters,
  preferredSampleCount,
  minSamples = DEFAULT_MIN_SAMPLES,
  maxSamples = DEFAULT_MAX_SAMPLES,
}: ResolveSampleCountInput) => {
  if (preferredSampleCount && Number.isFinite(preferredSampleCount)) {
    return clamp(Math.round(preferredSampleCount), minSamples, maxSamples)
  }

  if (!Number.isFinite(lineLengthMeters) || lineLengthMeters <= 0) {
    return clamp(DEFAULT_PREFERRED_SAMPLES, minSamples, maxSamples)
  }

  const adaptiveCount = Math.round(lineLengthMeters / METERS_PER_SAMPLE_TARGET)
  return clamp(adaptiveCount, minSamples, maxSamples)
}

const sanitizeElevations = (values: number[]) => {
  const sanitized = [...values]
  const validIndexes = sanitized
    .map((value, index) => ({ value, index }))
    .filter((item) => Number.isFinite(item.value))
    .map((item) => item.index)

  if (!validIndexes.length) {
    return {
      elevations: sanitized.map(() => 0),
      invalidElevationCount: sanitized.length,
    }
  }

  let invalidCount = 0

  for (let index = 0; index < sanitized.length; index += 1) {
    if (Number.isFinite(sanitized[index])) continue
    invalidCount += 1

    const prevIndex = validIndexes.filter((validIndex) => validIndex < index).pop()
    const nextIndex = validIndexes.find((validIndex) => validIndex > index)

    if (prevIndex === undefined && nextIndex !== undefined) {
      sanitized[index] = sanitized[nextIndex]
      continue
    }
    if (nextIndex === undefined && prevIndex !== undefined) {
      sanitized[index] = sanitized[prevIndex]
      continue
    }
    if (prevIndex !== undefined && nextIndex !== undefined) {
      const span = nextIndex - prevIndex
      const progress = span === 0 ? 0 : (index - prevIndex) / span
      sanitized[index] =
        sanitized[prevIndex] + (sanitized[nextIndex] - sanitized[prevIndex]) * progress
      continue
    }

    sanitized[index] = 0
  }

  return {
    elevations: sanitized,
    invalidElevationCount: invalidCount,
  }
}

export const sampleTerrainProfileLine = async ({
  terrainProvider,
  start,
  end,
  preferredSampleCount,
  minSamples = DEFAULT_MIN_SAMPLES,
  maxSamples = DEFAULT_MAX_SAMPLES,
}: SampleTerrainProfileInput): Promise<SampleTerrainProfileResult> => {
  const geodesic = new EllipsoidGeodesic(start, end)
  const totalDistanceMeters = geodesic.surfaceDistance || 0
  const sampleCount = Math.max(
    2,
    resolveAdaptiveSampleCount({
      lineLengthMeters: totalDistanceMeters,
      preferredSampleCount,
      minSamples,
      maxSamples,
    }),
  )

  const fractions = Array.from({ length: sampleCount }, (_, index) =>
    sampleCount === 1 ? 0 : index / (sampleCount - 1),
  )

  const cartographics = fractions.map((fraction) => {
    if (fraction <= 0) return Cartographic.clone(start)
    if (fraction >= 1) return Cartographic.clone(end)
    return geodesic.interpolateUsingFraction(fraction)
  })

  const sampledCartographics = await sampleTerrainMostDetailed(terrainProvider, cartographics)
  const rawElevations = sampledCartographics.map((cartographic) => cartographic.height)
  const { elevations, invalidElevationCount } = sanitizeElevations(rawElevations)

  let cumulativeDistance = 0
  const points = sampledCartographics.map((cartographic, index) => {
    const longitude = CesiumMath.toDegrees(cartographic.longitude)
    const latitude = CesiumMath.toDegrees(cartographic.latitude)

    if (index > 0) {
      const prev = sampledCartographics[index - 1]
      cumulativeDistance += haversineDistanceMeters(
        CesiumMath.toDegrees(prev.longitude),
        CesiumMath.toDegrees(prev.latitude),
        longitude,
        latitude,
      )
    }

    return {
      index,
      distanceMeters: cumulativeDistance,
      elevationMeters: elevations[index],
      longitude,
      latitude,
    }
  })

  return {
    points,
    totalDistanceMeters: Math.max(totalDistanceMeters, cumulativeDistance),
    sampleCount,
    invalidElevationCount,
  }
}
