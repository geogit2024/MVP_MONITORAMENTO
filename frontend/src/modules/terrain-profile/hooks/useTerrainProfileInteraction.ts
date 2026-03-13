import { useCallback, useEffect, useRef } from 'react'
import {
  Cartesian3,
  Color,
  ConstantPositionProperty,
  HeightReference,
  type Entity,
  type Viewer,
} from 'cesium'
import type { TerrainProfilePoint } from '../types'

interface UseTerrainProfileInteractionOptions {
  viewer: Viewer | null
  profilePoints: TerrainProfilePoint[]
  visible: boolean
}

interface UseTerrainProfileInteractionResult {
  setHoveredPointIndex: (index: number | null) => void
  setSelectedPointIndex: (index: number | null) => void
  clearHighlightEntities: () => void
}

const toCartesian = (point: TerrainProfilePoint) =>
  Cartesian3.fromDegrees(point.longitude, point.latitude, point.elevationMeters + 2)

const isViewerUsable = (viewer: Viewer | null): viewer is Viewer => {
  if (!viewer) return false
  return typeof viewer.isDestroyed === 'function' ? !viewer.isDestroyed() : true
}

export const useTerrainProfileInteraction = ({
  viewer,
  profilePoints,
  visible,
}: UseTerrainProfileInteractionOptions): UseTerrainProfileInteractionResult => {
  const hoveredEntityRef = useRef<Entity | null>(null)
  const selectedEntityRef = useRef<Entity | null>(null)

  const ensureEntities = useCallback(() => {
    if (!isViewerUsable(viewer)) return
    if (!hoveredEntityRef.current) {
      try {
        hoveredEntityRef.current = viewer.entities.add({
          show: false,
          point: {
            pixelSize: 8,
            color: Color.fromCssColorString('#ffd166'),
            outlineColor: Color.fromCssColorString('#1f2937'),
            outlineWidth: 1.8,
            heightReference: HeightReference.CLAMP_TO_GROUND,
          },
        })
      } catch (_error) {
        return
      }
    }
    if (!selectedEntityRef.current) {
      try {
        selectedEntityRef.current = viewer.entities.add({
          show: false,
          point: {
            pixelSize: 10,
            color: Color.fromCssColorString('#ef4444'),
            outlineColor: Color.fromCssColorString('#111827'),
            outlineWidth: 2,
            heightReference: HeightReference.CLAMP_TO_GROUND,
          },
        })
      } catch (_error) {
        return
      }
    }
  }, [viewer])

  const clearHighlightEntities = useCallback(() => {
    if (hoveredEntityRef.current) hoveredEntityRef.current.show = false
    if (selectedEntityRef.current) selectedEntityRef.current.show = false
  }, [])

  const setHoveredPointIndex = useCallback(
    (index: number | null) => {
      ensureEntities()
      if (!hoveredEntityRef.current) return
      if (!visible || index === null || index < 0 || index >= profilePoints.length) {
        hoveredEntityRef.current.show = false
        return
      }
      hoveredEntityRef.current.position = new ConstantPositionProperty(toCartesian(profilePoints[index]))
      hoveredEntityRef.current.show = true
    },
    [ensureEntities, profilePoints, visible],
  )

  const setSelectedPointIndex = useCallback(
    (index: number | null) => {
      ensureEntities()
      if (!selectedEntityRef.current) return
      if (!visible || index === null || index < 0 || index >= profilePoints.length) {
        selectedEntityRef.current.show = false
        return
      }
      selectedEntityRef.current.position = new ConstantPositionProperty(toCartesian(profilePoints[index]))
      selectedEntityRef.current.show = true
    },
    [ensureEntities, profilePoints, visible],
  )

  useEffect(() => {
    if (!visible) {
      clearHighlightEntities()
    }
  }, [clearHighlightEntities, visible])

  useEffect(() => {
    return () => {
      if (!isViewerUsable(viewer)) return
      if (hoveredEntityRef.current) {
        try {
          viewer.entities.remove(hoveredEntityRef.current)
        } catch (_error) {
          // Ignore entity cleanup race while switching modes.
        }
      }
      if (selectedEntityRef.current) {
        try {
          viewer.entities.remove(selectedEntityRef.current)
        } catch (_error) {
          // Ignore entity cleanup race while switching modes.
        }
      }
      hoveredEntityRef.current = null
      selectedEntityRef.current = null
    }
  }, [viewer])

  return {
    setHoveredPointIndex,
    setSelectedPointIndex,
    clearHighlightEntities,
  }
}
