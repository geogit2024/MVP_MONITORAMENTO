import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  HeightReference,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Entity,
  type Viewer,
} from 'cesium'

interface LineCompletedPayload {
  startCartographic: Cartographic
  endCartographic: Cartographic
}

interface UseTerrainProfileDrawingOptions {
  viewer: Viewer | null
  enabled: boolean
  onLineCompleted: (payload: LineCompletedPayload) => void
}

interface UseTerrainProfileDrawingResult {
  hasLine: boolean
  clearDrawing: () => void
  cancelDrawing: () => void
  setLineVisibility: (visible: boolean) => void
}

const cartographicToCartesian = (cartographic: Cartographic) =>
  Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, cartographic.height || 0)

const isViewerUsable = (viewer: Viewer | null): viewer is Viewer => {
  if (!viewer) return false
  return typeof viewer.isDestroyed === 'function' ? !viewer.isDestroyed() : true
}

export const useTerrainProfileDrawing = ({
  viewer,
  enabled,
  onLineCompleted,
}: UseTerrainProfileDrawingOptions): UseTerrainProfileDrawingResult => {
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null)
  const startCartographicRef = useRef<Cartographic | null>(null)
  const dynamicEndCartographicRef = useRef<Cartographic | null>(null)
  const finalizedLineRef = useRef(false)
  const lineEntityRef = useRef<Entity | null>(null)
  const startMarkerRef = useRef<Entity | null>(null)
  const endMarkerRef = useRef<Entity | null>(null)
  const [hasLine, setHasLine] = useState(false)

  const destroyHandler = useCallback(() => {
    if (handlerRef.current) {
      try {
        handlerRef.current.destroy()
      } catch (_error) {
        // Ignore handler destruction race during Cesium teardown.
      }
      handlerRef.current = null
    }
  }, [])

  const clearDrawing = useCallback(() => {
    const currentViewer = viewer
    if (!isViewerUsable(currentViewer)) {
      lineEntityRef.current = null
      startMarkerRef.current = null
      endMarkerRef.current = null
      startCartographicRef.current = null
      dynamicEndCartographicRef.current = null
      finalizedLineRef.current = false
      setHasLine(false)
      return
    }

    ;[lineEntityRef.current, startMarkerRef.current, endMarkerRef.current].forEach((entity) => {
      if (entity) {
        try {
          currentViewer.entities.remove(entity)
        } catch (_error) {
          // Ignore entity cleanup race while switching modes.
        }
      }
    })

    lineEntityRef.current = null
    startMarkerRef.current = null
    endMarkerRef.current = null
    startCartographicRef.current = null
    dynamicEndCartographicRef.current = null
    finalizedLineRef.current = false
    setHasLine(false)
  }, [viewer])

  const cancelDrawing = useCallback(() => {
    startCartographicRef.current = null
    dynamicEndCartographicRef.current = null
    finalizedLineRef.current = false
    if (lineEntityRef.current && isViewerUsable(viewer)) {
      try {
        viewer.entities.remove(lineEntityRef.current)
      } catch (_error) {
        // Ignore entity cleanup race while switching modes.
      }
      lineEntityRef.current = null
    }
    if (startMarkerRef.current && isViewerUsable(viewer)) {
      try {
        viewer.entities.remove(startMarkerRef.current)
      } catch (_error) {
        // Ignore entity cleanup race while switching modes.
      }
      startMarkerRef.current = null
    }
    if (endMarkerRef.current && isViewerUsable(viewer)) {
      try {
        viewer.entities.remove(endMarkerRef.current)
      } catch (_error) {
        // Ignore entity cleanup race while switching modes.
      }
      endMarkerRef.current = null
    }
    setHasLine(false)
  }, [viewer])

  const setLineVisibility = useCallback((visible: boolean) => {
    if (lineEntityRef.current) lineEntityRef.current.show = visible
    if (startMarkerRef.current) startMarkerRef.current.show = visible
    if (endMarkerRef.current) endMarkerRef.current.show = visible
  }, [])

  useEffect(() => {
    if (!isViewerUsable(viewer) || !enabled) {
      destroyHandler()
      return
    }

    destroyHandler()
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler

    const pickCartographic = (position: Cartesian2): Cartographic | null => {
      const scene = viewer.scene
      let cartesian = scene.pickPositionSupported ? scene.pickPosition(position) : undefined
      if (!cartesian) {
        cartesian = viewer.camera.pickEllipsoid(position, scene.globe.ellipsoid)
      }
      if (!cartesian) return null
      return Cartographic.fromCartesian(cartesian)
    }

    const ensureLineEntity = () => {
      if (!isViewerUsable(viewer)) return null
      if (lineEntityRef.current) return lineEntityRef.current
      let newEntity: Entity
      try {
        newEntity = viewer.entities.add({
          polyline: {
            positions: new CallbackProperty(() => {
              const start = startCartographicRef.current
              if (!start) return []
              const end = dynamicEndCartographicRef.current || start
              return [cartographicToCartesian(start), cartographicToCartesian(end)]
            }, false),
            width: 4,
            material: Color.fromCssColorString('#56ccf2'),
            clampToGround: true,
          },
        })
      } catch (_error) {
        return null
      }
      lineEntityRef.current = newEntity
      setHasLine(true)
      return newEntity
    }

    handler.setInputAction((event: { position: Cartesian2 }) => {
      if (!isViewerUsable(viewer)) return
      const picked = pickCartographic(event.position)
      if (!picked) return

      if (!startCartographicRef.current) {
        startCartographicRef.current = picked
        dynamicEndCartographicRef.current = picked
        finalizedLineRef.current = false

        if (startMarkerRef.current) {
          try {
            viewer.entities.remove(startMarkerRef.current)
          } catch (_error) {
            // Ignore entity replacement race while switching modes.
          }
        }
        try {
          startMarkerRef.current = viewer.entities.add({
            position: cartographicToCartesian(picked),
            point: {
              pixelSize: 10,
              color: Color.fromCssColorString('#00d084'),
              outlineColor: Color.fromCssColorString('#062b20'),
              outlineWidth: 2,
              heightReference: HeightReference.CLAMP_TO_GROUND,
            },
          })
        } catch (_error) {
          return
        }
        
        ensureLineEntity()
        return
      }

      const start = startCartographicRef.current
      dynamicEndCartographicRef.current = picked
      finalizedLineRef.current = true
      destroyHandler()

      if (endMarkerRef.current) {
        try {
          viewer.entities.remove(endMarkerRef.current)
        } catch (_error) {
          // Ignore entity replacement race while switching modes.
        }
      }
      try {
        endMarkerRef.current = viewer.entities.add({
          position: cartographicToCartesian(picked),
          point: {
            pixelSize: 10,
            color: Color.fromCssColorString('#ff8a65'),
            outlineColor: Color.fromCssColorString('#3b1204'),
            outlineWidth: 2,
            heightReference: HeightReference.CLAMP_TO_GROUND,
          },
        })
      } catch (_error) {
        return
      }

      onLineCompleted({
        startCartographic: Cartographic.clone(start),
        endCartographic: Cartographic.clone(picked),
      })
    }, ScreenSpaceEventType.LEFT_CLICK)

    handler.setInputAction((event: { endPosition: Cartesian2 }) => {
      if (!isViewerUsable(viewer)) return
      if (!startCartographicRef.current || finalizedLineRef.current) return
      const picked = pickCartographic(event.endPosition)
      if (!picked) return
      dynamicEndCartographicRef.current = picked
    }, ScreenSpaceEventType.MOUSE_MOVE)

    handler.setInputAction(() => {
      if (!startCartographicRef.current) return
      cancelDrawing()
    }, ScreenSpaceEventType.RIGHT_CLICK)

    return () => {
      destroyHandler()
    }
  }, [cancelDrawing, destroyHandler, enabled, onLineCompleted, viewer])

  useEffect(() => {
    return () => {
      destroyHandler()
      clearDrawing()
    }
  }, [clearDrawing, destroyHandler])

  return {
    hasLine,
    clearDrawing,
    cancelDrawing,
    setLineVisibility,
  }
}
