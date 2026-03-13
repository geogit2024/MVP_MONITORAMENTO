import React, { useMemo } from 'react'
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
  type ChartOptions,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import type { TerrainProfilePoint } from '../types'
import { formatDistanceLabel, formatElevationLabel } from '../utils/terrainProfileFormatter'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

interface TerrainProfileChartProps {
  points: TerrainProfilePoint[]
  onHoverPoint: (index: number | null) => void
  onSelectPoint: (index: number | null) => void
  chartHeight: number
  chartWidth: number
}

const findMinMaxIndexes = (points: TerrainProfilePoint[]) => {
  if (!points.length) return { minIndex: -1, maxIndex: -1 }
  let minIndex = 0
  let maxIndex = 0
  points.forEach((point, index) => {
    if (point.elevationMeters < points[minIndex].elevationMeters) minIndex = index
    if (point.elevationMeters > points[maxIndex].elevationMeters) maxIndex = index
  })
  return { minIndex, maxIndex }
}

export const TerrainProfileChart: React.FC<TerrainProfileChartProps> = ({
  points,
  onHoverPoint,
  onSelectPoint,
  chartHeight,
  chartWidth,
}) => {
  const { minIndex, maxIndex } = useMemo(() => findMinMaxIndexes(points), [points])
  const lastIndex = points.length > 0 ? points.length - 1 : -1

  const keyPointButtons = useMemo(
    () => [
      { label: 'Inicio', index: 0 },
      { label: 'Min', index: minIndex },
      { label: 'Max', index: maxIndex },
      { label: 'Fim', index: lastIndex },
    ],
    [lastIndex, maxIndex, minIndex],
  )

  const data = useMemo(
    () => ({
      labels: points.map((point) => formatDistanceLabel(point.distanceMeters)),
      datasets: [
        {
          label: 'Elevacao (m)',
          data: points.map((point) => ({
            x: point.distanceMeters,
            y: point.elevationMeters,
          })),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.18)',
          borderWidth: 2,
          tension: 0.15,
          fill: 'origin',
          pointRadius: (context: { dataIndex: number }) =>
            context.dataIndex === minIndex || context.dataIndex === maxIndex ? 4 : 1.5,
          pointHoverRadius: 6,
          pointBackgroundColor: (context: { dataIndex: number }) => {
            if (context.dataIndex === minIndex) return '#ef4444'
            if (context.dataIndex === maxIndex) return '#22c55e'
            return '#3b82f6'
          },
        },
      ],
    }),
    [maxIndex, minIndex, points],
  )

  const options = useMemo<ChartOptions<'line'>>(
    () => {
      const baseOptions: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'nearest',
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
        },
        title: {
          display: true,
          text: 'Perfil Altimetrico',
          color: '#f8fafc',
          font: { size: 14 },
        },
        tooltip: {
          enabled: true,
          callbacks: {
            title: (items) => {
              if (!items.length) return ''
              const point = points[items[0].dataIndex]
              return `Distancia: ${formatDistanceLabel(point.distanceMeters)}`
            },
            label: (context) => {
              const point = points[context.dataIndex]
              return `Elevacao: ${formatElevationLabel(point.elevationMeters)}`
            },
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          grid: { color: 'rgba(148,163,184,0.18)' },
          ticks: {
            color: '#cbd5e1',
            maxTicksLimit: 8,
            callback: (value) => formatDistanceLabel(Number(value)),
          },
          title: {
            display: true,
            text: 'Distancia acumulada',
            color: '#cbd5e1',
          },
        },
        y: {
          grid: { color: 'rgba(148,163,184,0.18)' },
          ticks: {
            color: '#cbd5e1',
            callback: (value) => `${value} m`,
          },
          title: {
            display: true,
            text: 'Elevacao',
            color: '#cbd5e1',
          },
        },
      },
      onHover: (_event, activeElements) => {
        if (!activeElements.length) {
          onHoverPoint(null)
          return
        }
        onHoverPoint(activeElements[0].index)
      },
      onClick: (_event, activeElements) => {
        if (!activeElements.length) {
          onSelectPoint(null)
          return
        }
        onSelectPoint(activeElements[0].index)
      },
      }

      // Desabilita o plugin global de datalabels para evitar poluicao visual.
      ;(baseOptions.plugins as Record<string, unknown>).datalabels = { display: false }
      return baseOptions
    },
    [onHoverPoint, onSelectPoint, points],
  )

  if (!points.length) {
    return <div className="terrain-profile-chart-empty">Sem dados para exibir o grafico.</div>
  }

  return (
    <div className="terrain-profile-chart-shell" onMouseLeave={() => onHoverPoint(null)}>
      <div className="terrain-profile-chart-actions-line">
        <span>Linha de perfil interativa:</span>
        {keyPointButtons.map((item) => (
          <button
            key={`${item.label}-${item.index}`}
            type="button"
            onClick={() => {
              if (item.index >= 0 && item.index < points.length) {
                onSelectPoint(item.index)
              }
            }}
            disabled={item.index < 0 || item.index >= points.length}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="terrain-profile-chart-scroll">
        <div className="terrain-profile-chart" style={{ width: `${chartWidth}px`, height: `${chartHeight}px` }}>
          <Line data={data} options={options} />
        </div>
      </div>
    </div>
  )
}

export default TerrainProfileChart
