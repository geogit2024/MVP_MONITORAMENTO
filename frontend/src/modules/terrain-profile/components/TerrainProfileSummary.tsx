import React from 'react'
import type { TerrainProfileSummary as TerrainProfileSummaryType } from '../types'
import { formatDistanceLabel, formatElevationLabel } from '../utils/terrainProfileFormatter'

interface TerrainProfileSummaryProps {
  summary: TerrainProfileSummaryType
}

const buildPrimaryMetrics = (summary: TerrainProfileSummaryType) => [
  ['Distancia total', formatDistanceLabel(summary.totalDistanceMeters)],
  ['Cota minima', formatElevationLabel(summary.minElevationMeters)],
  ['Cota maxima', formatElevationLabel(summary.maxElevationMeters)],
  ['Amplitude', formatElevationLabel(summary.elevationRangeMeters)],
  ['Declividade media', `${summary.averageSlopePercent.toFixed(2)}%`],
  ['Classe do relevo', summary.terrainClass],
]

const buildDetailMetrics = (summary: TerrainProfileSummaryType) => [
  ['Elevacao media', formatElevationLabel(summary.averageElevationMeters)],
  ['Declividade maxima', `${summary.maxSlopePercent.toFixed(2)}%`],
  ['Declividade minima', `${summary.minSlopePercent.toFixed(2)}%`],
  ['Subida acumulada', formatDistanceLabel(summary.uphillDistanceMeters)],
  ['Descida acumulada', formatDistanceLabel(summary.downhillDistanceMeters)],
  ['Rupturas de declive', String(summary.slopeBreakCount)],
  ['Segmentos criticos', String(summary.criticalSegmentCount)],
]

export const TerrainProfileSummary: React.FC<TerrainProfileSummaryProps> = ({ summary }) => (
  <div className="terrain-profile-summary">
    <h5>Resumo Numerico</h5>
    <div className="terrain-profile-summary-grid">
      {buildPrimaryMetrics(summary).map(([label, value]) => (
        <div key={label} className="terrain-profile-summary-item">
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
    <div className="terrain-profile-summary-details">
      {buildDetailMetrics(summary).map(([label, value]) => (
        <div key={label} className="terrain-profile-summary-row">
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  </div>
)

export default TerrainProfileSummary
