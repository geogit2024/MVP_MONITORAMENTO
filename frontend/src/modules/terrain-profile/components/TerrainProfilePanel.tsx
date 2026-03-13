import React, { useEffect, useMemo, useRef, useState } from 'react'
import Draggable from 'react-draggable'
import { ResizableBox } from 'react-resizable'
import type { TerrainProfileAnalysisResult, TerrainProfileStatus } from '../types'
import TerrainProfileAIResult from './TerrainProfileAIResult'
import TerrainProfileChart from './TerrainProfileChart'
import TerrainProfileSummary from './TerrainProfileSummary'

type ResizeStopPayload = {
  size: {
    width: number
    height: number
  }
}

interface TerrainProfilePanelProps {
  open: boolean
  status: TerrainProfileStatus
  analysis: TerrainProfileAnalysisResult | null
  errorMessage: string | null
  onClose: () => void
  onClear: () => void
  onRedraw: () => void
  onHoverPoint: (index: number | null) => void
  onSelectPoint: (index: number | null) => void
}

export const TerrainProfilePanel: React.FC<TerrainProfilePanelProps> = ({
  open,
  status,
  analysis,
  errorMessage,
  onClose,
  onClear,
  onRedraw,
  onHoverPoint,
  onSelectPoint,
}) => {
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const [panelSize, setPanelSize] = useState({ width: 980, height: 680 })
  const [chartWidth, setChartWidth] = useState(920)
  const [chartHeight, setChartHeight] = useState(300)
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1366 : window.innerWidth,
    height: typeof window === 'undefined' ? 768 : window.innerHeight,
  }))

  useEffect(() => {
    const handleResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const minConstraints = useMemo<[number, number]>(() => {
    const minWidth = Math.min(560, Math.max(340, viewport.width - 32))
    const minHeight = Math.min(420, Math.max(320, viewport.height - 48))
    return [minWidth, minHeight]
  }, [viewport.height, viewport.width])

  const maxConstraints = useMemo<[number, number]>(() => {
    const maxWidth = Math.max(minConstraints[0], viewport.width - 24)
    const maxHeight = Math.max(minConstraints[1], viewport.height - 28)
    return [maxWidth, maxHeight]
  }, [minConstraints, viewport.height, viewport.width])

  useEffect(() => {
    setPanelSize((current) => {
      const nextWidth = Math.min(Math.max(current.width, minConstraints[0]), maxConstraints[0])
      const nextHeight = Math.min(Math.max(current.height, minConstraints[1]), maxConstraints[1])
      if (nextWidth === current.width && nextHeight === current.height) {
        return current
      }
      return { width: nextWidth, height: nextHeight }
    })
  }, [maxConstraints, minConstraints])

  if (!open) return null

  return (
    <Draggable
      nodeRef={nodeRef}
      handle=".terrain-profile-panel-header"
      bounds=".app-container"
      defaultPosition={{ x: 18, y: 112 }}
    >
      <div ref={nodeRef} className="terrain-profile-panel-shell">
        <ResizableBox
          width={panelSize.width}
          height={panelSize.height}
          minConstraints={minConstraints}
          maxConstraints={maxConstraints}
          onResizeStop={(_event: unknown, data: ResizeStopPayload) => {
            setPanelSize({
              width: Math.min(Math.max(data.size.width, minConstraints[0]), maxConstraints[0]),
              height: Math.min(Math.max(data.size.height, minConstraints[1]), maxConstraints[1]),
            })
          }}
          className="terrain-profile-panel"
          handle={<span className="react-resizable-handle react-resizable-handle-se" title="Redimensionar painel" />}
        >
          <div className="terrain-profile-panel-header">
            <h4>Perfil do Terreno</h4>
            <div className="terrain-profile-panel-actions">
              <button type="button" className="secondary" onClick={onRedraw}>
                Redesenhar
              </button>
              <button type="button" className="danger" onClick={onClear}>
                Limpar
              </button>
              <button type="button" className="secondary" onClick={onClose}>
                Fechar
              </button>
            </div>
          </div>
          <div className="terrain-profile-panel-body">
            {status === 'drawing' && (
              <p className="terrain-profile-placeholder">
                Clique no ponto inicial e em seguida no ponto final sobre o terreno 3D para gerar o perfil.
              </p>
            )}

            {status === 'analyzing' && (
              <p className="terrain-profile-placeholder">Amostrando elevacao e processando metricas...</p>
            )}

            {status === 'error' && (
              <div className="terrain-profile-error">
                <p>{errorMessage || 'Falha na analise do perfil do terreno.'}</p>
              </div>
            )}

            {analysis && (
              <>
                <div className="terrain-profile-main-grid">
                  <TerrainProfileSummary summary={analysis.summary} />
                  <div className="terrain-profile-chart-block">
                    <div className="terrain-profile-chart-size-controls">
                      <label>
                        Largura do grafico: {chartWidth}px
                        <input
                          type="range"
                          min={480}
                          max={2000}
                          step={20}
                          value={chartWidth}
                          onChange={(event) => setChartWidth(Number(event.target.value))}
                        />
                      </label>
                      <label>
                        Altura do grafico: {chartHeight}px
                        <input
                          type="range"
                          min={180}
                          max={640}
                          step={10}
                          value={chartHeight}
                          onChange={(event) => setChartHeight(Number(event.target.value))}
                        />
                      </label>
                    </div>
                    <TerrainProfileChart
                      points={analysis.profilePoints}
                      onHoverPoint={onHoverPoint}
                      onSelectPoint={onSelectPoint}
                      chartHeight={chartHeight}
                      chartWidth={chartWidth}
                    />
                  </div>
                </div>
                <TerrainProfileAIResult description={analysis.aiDescription} warnings={analysis.warnings} />
              </>
            )}
          </div>
        </ResizableBox>
      </div>
    </Draggable>
  )
}

export default TerrainProfilePanel
