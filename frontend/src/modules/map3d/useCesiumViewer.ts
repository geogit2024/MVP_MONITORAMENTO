import { useEffect, useRef, useState } from 'react'
import { Viewer, createWorldTerrainAsync } from 'cesium'

interface UseCesiumViewerOptions {
  onViewerReady?: (viewer: Viewer) => void
}

export function useCesiumViewer(options: UseCesiumViewerOptions = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const [viewerReady, setViewerReady] = useState(false)
  const { onViewerReady } = options

  useEffect(() => {
    let active = true

    const initViewer = async () => {
      if (!containerRef.current || viewerRef.current) return

      const terrainProvider = await createWorldTerrainAsync()
      if (!active || !containerRef.current || viewerRef.current) return

      const viewer = new Viewer(containerRef.current, {
        terrainProvider,
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        infoBox: false,
        selectionIndicator: false,
        shadows: false,
      })

      viewer.scene.globe.depthTestAgainstTerrain = false
      viewerRef.current = viewer
      setViewerReady(true)
      if (onViewerReady) onViewerReady(viewer)
    }

    void initViewer()

    return () => {
      active = false
      if (viewerRef.current) {
        viewerRef.current.destroy()
        viewerRef.current = null
        setViewerReady(false)
      }
    }
  }, [onViewerReady])

  return { containerRef, viewerRef, viewerReady }
}
