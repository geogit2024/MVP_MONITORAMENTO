import type { TerrainProfileSegment, TerrainProfileSummary } from '../types'

export const formatDistanceLabel = (meters: number) => {
  if (!Number.isFinite(meters)) return '--'
  if (Math.abs(meters) >= 1000) return `${(meters / 1000).toFixed(2)} km`
  return `${meters.toFixed(0)} m`
}

export const formatElevationLabel = (meters: number) => {
  if (!Number.isFinite(meters)) return '--'
  return `${meters.toFixed(2)} m`
}

export const buildHeuristicTerrainDescription = (
  summary: TerrainProfileSummary,
  segments: TerrainProfileSegment[],
) => {
  const steepSegments = segments.filter((segment) => Math.abs(segment.slopePercent) >= 18).length
  const featureText =
    summary.features.length > 0
      ? `Feicoes detectadas: ${summary.features.map((item) => item.replace('_', ' ')).join(', ')}.`
      : 'Nao foram detectadas feicoes topograficas marcantes.'

  return [
    `Perfil com predominancia de relevo ${summary.terrainClass} e desnivel de ${summary.elevationRangeMeters.toFixed(1)} m em ${formatDistanceLabel(summary.totalDistanceMeters)}.`,
    `A declividade media foi de ${summary.averageSlopePercent.toFixed(1)}%, com pico de ${Math.max(
      Math.abs(summary.maxSlopePercent),
      Math.abs(summary.minSlopePercent),
    ).toFixed(1)}%.`,
    steepSegments > 0
      ? `Foram observados ${steepSegments} segmentos com declividade elevada, sugerindo maior restricao operacional local.`
      : 'Nao foram observados segmentos com declividade critica.',
    featureText,
  ].join(' ')
}
