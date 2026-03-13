import { Cartesian3, Cartographic, type Viewer } from 'cesium'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TerrainProfileAnalysisResult, TerrainProfileStatus } from '../types'
import { generateTerrainProfileAnalysis } from '../services/terrainProfileService'
import { useTerrainProfileDrawing } from './useTerrainProfileDrawing'
import { useTerrainProfileInteraction } from './useTerrainProfileInteraction'

interface UseTerrainProfileOptions {
  viewer: Viewer | null
  viewerReady: boolean
  apiBaseUrl: string
}

interface UseTerrainProfileResult {
  isToolActive: boolean
  status: TerrainProfileStatus
  analysis: TerrainProfileAnalysisResult | null
  errorMessage: string | null
  isProfileVisible: boolean
  activateTool: () => void
  deactivateTool: () => void
  cancelDrawing: () => void
  redrawProfile: () => void
  clearAnalysis: () => void
  toggleProfileVisibility: () => void
  handleChartHover: (index: number | null) => void
  handleChartSelect: (index: number | null) => void
}

export const useTerrainProfile = ({
  viewer,
  viewerReady,
  apiBaseUrl,
}: UseTerrainProfileOptions): UseTerrainProfileResult => {
  const [isToolActive, setIsToolActive] = useState(false)
  const [status, setStatus] = useState<TerrainProfileStatus>('idle')
  const [analysis, setAnalysis] = useState<TerrainProfileAnalysisResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isProfileVisible, setIsProfileVisible] = useState(true)
  const analysisRequestIdRef = useRef(0)
  const analysisAbortRef = useRef<AbortController | null>(null)

  const isViewerUsable = useCallback((currentViewer: Viewer | null): currentViewer is Viewer => {
    if (!currentViewer) return false
    return typeof currentViewer.isDestroyed === 'function' ? !currentViewer.isDestroyed() : true
  }, [])

  const runAnalysisFromLine = useCallback(
    ({
      startCartographic,
      endCartographic,
    }: {
      startCartographic: Cartographic
      endCartographic: Cartographic
    }) => {
      if (!isViewerUsable(viewer)) return
      const requestId = analysisRequestIdRef.current + 1
      analysisRequestIdRef.current = requestId
      analysisAbortRef.current?.abort()

      const controller = new AbortController()
      analysisAbortRef.current = controller
      setErrorMessage(null)
      setStatus('analyzing')

      void generateTerrainProfileAnalysis({
        viewer,
        startCartographic,
        endCartographic,
        apiBaseUrl,
        signal: controller.signal,
      })
        .then((result) => {
          if (analysisRequestIdRef.current !== requestId) return
          setAnalysis(result)
          setStatus('ready')
          setIsProfileVisible(true)
        })
        .catch((error: unknown) => {
          if (analysisRequestIdRef.current !== requestId) return
          if ((error as { name?: string }).name === 'AbortError') return
          setStatus('error')
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Falha ao gerar perfil do terreno com os dados informados.',
          )
        })
        .finally(() => {
          if (analysisAbortRef.current === controller) {
            analysisAbortRef.current = null
          }
        })
    },
    [apiBaseUrl, isViewerUsable, viewer],
  )

  const handleLineCompleted = useCallback(
    ({ startCartographic, endCartographic }: { startCartographic: Cartographic; endCartographic: Cartographic }) => {
      runAnalysisFromLine({ startCartographic, endCartographic })
    },
    [runAnalysisFromLine],
  )

  const drawing = useTerrainProfileDrawing({
    viewer,
    enabled: viewerReady && isToolActive && status === 'drawing',
    onLineCompleted: handleLineCompleted,
  })

  const profilePoints = useMemo(() => analysis?.profilePoints ?? [], [analysis?.profilePoints])
  const interaction = useTerrainProfileInteraction({
    viewer,
    profilePoints,
    visible: isProfileVisible,
  })

  const activateTool = useCallback(() => {
    analysisAbortRef.current?.abort()
    setIsToolActive(true)
    setStatus('drawing')
    setErrorMessage(null)
    setAnalysis(null)
    setIsProfileVisible(true)
    drawing.clearDrawing()
    interaction.clearHighlightEntities()
  }, [drawing, interaction])

  const deactivateTool = useCallback(() => {
    analysisAbortRef.current?.abort()
    setIsToolActive(false)
    if (status === 'drawing' || status === 'analyzing') {
      setStatus(analysis ? 'ready' : 'idle')
    }
  }, [analysis, status])

  const cancelDrawing = useCallback(() => {
    drawing.cancelDrawing()
    setStatus(analysis ? 'ready' : 'idle')
  }, [analysis, drawing])

  const clearAnalysis = useCallback(() => {
    analysisAbortRef.current?.abort()
    setAnalysis(null)
    setErrorMessage(null)
    setStatus(isToolActive ? 'drawing' : 'idle')
    setIsProfileVisible(true)
    drawing.clearDrawing()
    interaction.clearHighlightEntities()
  }, [drawing, interaction, isToolActive])

  const redrawProfile = useCallback(() => {
    analysisAbortRef.current?.abort()
    setIsToolActive(true)
    setStatus('drawing')
    setErrorMessage(null)
    setAnalysis(null)
    setIsProfileVisible(true)
    drawing.clearDrawing()
    interaction.clearHighlightEntities()
  }, [drawing, interaction])

  const toggleProfileVisibility = useCallback(() => {
    setIsProfileVisible((previous) => !previous)
  }, [])

  const handleChartHover = useCallback(
    (index: number | null) => {
      interaction.setHoveredPointIndex(index)
    },
    [interaction],
  )

  const handleChartSelect = useCallback(
    (index: number | null) => {
      interaction.setSelectedPointIndex(index)
      if (!isViewerUsable(viewer) || index === null || !analysis || index < 0 || index >= analysis.profilePoints.length) return
      const point = analysis.profilePoints[index]
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(point.longitude, point.latitude, point.elevationMeters + 200),
        duration: 0.8,
      })
    },
    [analysis, interaction, isViewerUsable, viewer],
  )

  useEffect(() => {
    drawing.setLineVisibility(isProfileVisible)
  }, [drawing, isProfileVisible])

  useEffect(() => {
    if (!viewerReady) {
      setIsToolActive(false)
      setStatus('idle')
      setAnalysis(null)
      setErrorMessage(null)
      setIsProfileVisible(true)
      analysisAbortRef.current?.abort()
    }
  }, [viewerReady])

  useEffect(() => {
    return () => {
      analysisAbortRef.current?.abort()
    }
  }, [])

  return {
    isToolActive,
    status,
    analysis,
    errorMessage,
    isProfileVisible,
    activateTool,
    deactivateTool,
    cancelDrawing,
    redrawProfile,
    clearAnalysis,
    toggleProfileVisibility,
    handleChartHover,
    handleChartSelect,
  }
}
