import React from 'react'

interface LandUseControlsProps {
  enabled: boolean
  onEnabledChange: (value: boolean) => void
  showLegend: boolean
  onShowLegendChange: (value: boolean) => void
  heightScale: number
  onHeightScaleChange: (value: number) => void
  alpha: number
  onAlphaChange: (value: number) => void
  featureCount: number
  loading?: boolean
  error?: string | null
}

export default function LandUseControls({
  enabled,
  onEnabledChange,
  showLegend,
  onShowLegendChange,
  heightScale,
  onHeightScaleChange,
  alpha,
  onAlphaChange,
  featureCount,
  loading = false,
  error = null,
}: LandUseControlsProps) {
  return (
    <div className="landuse-3d-controls">
      <label className="split-check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
        />
        Classificacao uso do solo 3D
      </label>

      <label className="split-check">
        <input
          type="checkbox"
          checked={showLegend}
          onChange={(event) => onShowLegendChange(event.target.checked)}
          disabled={!enabled}
        />
        Mostrar legenda
      </label>

      <div className="split-row">
        <label>Ajustar altura: {heightScale.toFixed(1)}x</label>
        <input
          type="range"
          min={0.4}
          max={5}
          step={0.1}
          value={heightScale}
          onChange={(event) => onHeightScaleChange(Number(event.target.value))}
          disabled={!enabled}
        />
      </div>

      <div className="split-row">
        <label>Transparencia: {(alpha * 100).toFixed(0)}%</label>
        <input
          type="range"
          min={0.2}
          max={1}
          step={0.05}
          value={alpha}
          onChange={(event) => onAlphaChange(Number(event.target.value))}
          disabled={!enabled}
        />
      </div>

      <p className="split-meta">Feicoes 3D: {featureCount.toLocaleString('pt-BR')}</p>
      {loading && <p className="split-meta">Carregando volumetria de classificacao...</p>}
      {error && <p className="split-error">{error}</p>}
    </div>
  )
}
