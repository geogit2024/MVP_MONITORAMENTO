import React from 'react'
import { getNDVIColor, type NdviClassLabel } from '../layers/NDVIExtrusionLayer'

interface Ndvi3dLegendProps {
  alpha: number
}

const LEGEND_ITEMS: Array<{ range: string; label: NdviClassLabel; ndvi: number }> = [
  { range: '< 0.0', label: 'Agua', ndvi: -0.05 },
  { range: '0.0-0.25', label: 'Solo Exposto', ndvi: 0.12 },
  { range: '0.25-0.50', label: 'Vegetacao Rala', ndvi: 0.38 },
  { range: '>= 0.50', label: 'Vegetacao Densa', ndvi: 0.7 },
]

export default function Ndvi3dLegend({ alpha }: Ndvi3dLegendProps) {
  return (
    <div className="ndvi-3d-legend">
      <h5>Legenda NDVI 3D</h5>
      <ul>
        {LEGEND_ITEMS.map((item) => {
          const color = getNDVIColor(item.ndvi, alpha).toCssColorString()
          return (
            <li key={item.range}>
              <span className="swatch" style={{ background: color }} />
              <span className="range">{item.range}</span>
              <span className="label">{item.label}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
