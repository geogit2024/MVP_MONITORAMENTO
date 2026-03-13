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
      try {
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
      } catch (error) {
        if (active) {
          console.error('Falha ao inicializar viewer Cesium:', error)
        }
      }
    }

    void initViewer()

    return () => {
      active = false
      const currentViewer = viewerRef.current
      if (currentViewer) {
        try {
          const alreadyDestroyed =
            typeof currentViewer.isDestroyed === 'function' ? currentViewer.isDestroyed() : false
          if (!alreadyDestroyed) {
            currentViewer.destroy()
          }
        } catch (error) {
          // Avoid breaking mode switches if Cesium has already disposed internals.
          console.warn('Falha ao destruir viewer Cesium durante cleanup:', error)
        } finally {
          viewerRef.current = null
        }
      }
    }
  }, [onViewerReady])

  return { containerRef, viewerRef, viewerReady }
}
