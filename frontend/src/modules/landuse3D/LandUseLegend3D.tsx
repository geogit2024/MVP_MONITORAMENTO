import React, { useMemo } from 'react'
import {
  getLandUseHeight,
  getLandUseHexColor,
  getLandUseLegendTemplate,
} from './LandUseColorRamp'

interface LandUseLegendInputItem {
  class_id: number
  class: string
  color?: string
}

interface LandUseLegend3DProps {
  alpha: number
  legend?: LandUseLegendInputItem[] | null
}

export default function LandUseLegend3D({ alpha, legend = null }: LandUseLegend3DProps) {
  const entries = useMemo(() => {
    if (!legend || !legend.length) return getLandUseLegendTemplate()
    return legend.map((item) => ({
      classId: Number(item.class_id),
      className: item.class,
      hexColor: item.color || getLandUseHexColor(Number(item.class_id), item.class),
      heightM: getLandUseHeight(Number(item.class_id), item.class),
    }))
  }, [legend])

  return (
    <div className="landuse-3d-legend">
      <h5>Legenda Uso do Solo 3D</h5>
      <ul>
        {entries.map((entry) => (
          <li key={`${entry.classId}-${entry.className}`}>
            <span
              className="swatch"
              style={{ background: entry.hexColor, opacity: Math.max(0.2, Math.min(alpha, 1)) }}
            />
            <span className="label">{entry.className}</span>
            <span className="height">{entry.heightM.toFixed(0)}m</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
