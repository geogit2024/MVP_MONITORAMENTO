import React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Feature, Geometry } from 'geojson'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import {
  Cartesian3,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  createOsmBuildingsAsync,
  Cesium3DTileset,
  GeoJsonDataSource,
  ImageryLayer,
  Ion,
  ScreenSpaceEventType,
  SplitDirection,
  UrlTemplateImageryProvider,
} from 'cesium'
import { useCesiumViewer } from './useCesiumViewer'
import {
  applyNdviExtrusionLayer,
  clearNdviExtrusionLayer,
  extractNdviPickInfo,
  fetchNdvi3dData,
  type NdviCellPickInfo,
  type NdviFeatureCollection,
  updateNdviExtrusionLayerStyle,
} from './layers/NDVIExtrusionLayer'
import {
  applyDemOverlay,
  applyTerrainLayer,
  clearDemOverlay,
  fetchDemTile,
  setTerrainExaggeration,
} from './layers/TerrainLayer'
import TerrainProfilePanel from '../terrain-profile/components/TerrainProfilePanel'
import TerrainProfileToolbarAction from '../terrain-profile/components/TerrainProfileToolbarAction'
import { useTerrainProfile } from '../terrain-profile/hooks/useTerrainProfile'
import Ndvi3dLegend from './components/Ndvi3dLegend'
import {
  clearLandUse3DLayer,
  extractLandUse3DPickInfo,
  fetchLandUse3DData,
  renderLandUse3D,
  type LandUse3DPickInfo,
  type LandUseFeatureCollection3D,
  updateLandUse3DStyle,
} from '../landuse3D/LandUse3DRenderer'
import LandUseLegend3D from '../landuse3D/LandUseLegend3D'
import LandUseControls from '../landuse3D/LandUseControls'
import '../terrain-profile/terrainProfile.css'

interface Globe3DProps {
  className?: string
  style?: React.CSSProperties
  activeAoi?: Feature<Geometry> | null
  terrainExaggeration?: number
  ndviRefreshKey?: number
  ndviMeanFallback?: number | null
  satellite?: string
  temporalImages?: Array<{ id: string; date: string }>
  showToolsBar?: boolean
  differenceLayerUrl?: string | null
  showDifferenceLayer?: boolean
  landCoverClassificationId?: string | null
  landCoverLegend?: Array<{ class_id: number; class: string; color?: string }>
  showLandCoverLayer?: boolean
}

export default function Globe3D({
  className,
  style,
  activeAoi = null,
  terrainExaggeration = 1,
  ndviRefreshKey = 0,
  ndviMeanFallback = null,
  satellite = '',
  temporalImages = [],
  showToolsBar = false,
  differenceLayerUrl = null,
  showDifferenceLayer = false,
  landCoverClassificationId = null,
  landCoverLegend = [],
  showLandCoverLayer = false,
}: Globe3DProps) {
  const { containerRef, viewerRef, viewerReady } = useCesiumViewer()
  const aoiDataSourceRef = useRef<GeoJsonDataSource | null>(null)
  const aoiBoundaryEntitiesRef = useRef<string[]>([])
  const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const cesiumIonToken = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
  const beforeLayerRef = useRef<ImageryLayer | null>(null)
  const afterLayerRef = useRef<ImageryLayer | null>(null)
  const differenceLayerRef = useRef<ImageryLayer | null>(null)
  const differenceLayerErrorCleanupRef = useRef<(() => void) | null>(null)
  const buildingsTilesetRef = useRef<Cesium3DTileset | null>(null)
  const [beforeImageId, setBeforeImageId] = useState<string>('')
  const [afterImageId, setAfterImageId] = useState<string>('')
  const [splitPosition, setSplitPosition] = useState(0.5)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState<string | null>(null)
  const [ndviVolumetricEnabled, setNdviVolumetricEnabled] = useState(true)
  const [ndviChange3dEnabled, setNdviChange3dEnabled] = useState(true)
  const [ndviVolumeScale, setNdviVolumeScale] = useState(1)
  const [ndviAlpha, setNdviAlpha] = useState(0.7)
  const [ndviEvolutionEnabled, setNdviEvolutionEnabled] = useState(false)
  const [ndviEvolutionFactor, setNdviEvolutionFactor] = useState(1)
  const [ndviEvolutionPlaying, setNdviEvolutionPlaying] = useState(false)
  const [ndviRenderedCells, setNdviRenderedCells] = useState(0)
  const [selectedNdviCell, setSelectedNdviCell] = useState<NdviCellPickInfo | null>(null)
  const [landUse3dEnabled, setLandUse3dEnabled] = useState(true)
  const [landUse3dShowLegend, setLandUse3dShowLegend] = useState(true)
  const [landUse3dHeightScale, setLandUse3dHeightScale] = useState(1)
  const [landUse3dAlpha, setLandUse3dAlpha] = useState(0.76)
  const [landUse3dLoading, setLandUse3dLoading] = useState(false)
  const [landUse3dError, setLandUse3dError] = useState<string | null>(null)
  const [landUse3dFeatureCount, setLandUse3dFeatureCount] = useState(0)
  const [selectedLandUseCell, setSelectedLandUseCell] = useState<LandUse3DPickInfo | null>(null)
  const [terrainOverlayWarning, setTerrainOverlayWarning] = useState<string | null>(null)
  const [buildingsStatus, setBuildingsStatus] = useState<'loading' | 'active' | 'inactive'>('loading')
  const [buildingsStatusText, setBuildingsStatusText] = useState('Carregando edificaÃ§Ãµes vetoriais...')
  const [buildingsProvider, setBuildingsProvider] = useState<'osm' | 'google-3d'>('osm')
  const terrainProfile = useTerrainProfile({
    viewer: viewerRef.current,
    viewerReady,
    apiBaseUrl,
  })

  const isViewerAlive = (
    viewer: typeof viewerRef.current,
  ): viewer is NonNullable<typeof viewerRef.current> => {
    if (!viewer) return false
    return typeof viewer.isDestroyed === 'function' ? !viewer.isDestroyed() : true
  }

  const canCompare = !!activeAoi && !!satellite && temporalImages.length >= 2

  const normalizeTileTemplateUrl = (url: string | null | undefined): string | null => {
    if (!url) return null
    return url
      .replace(/%7B/gi, '{')
      .replace(/%7D/gi, '}')
      .replace(/&#123;/g, '{')
      .replace(/&#125;/g, '}')
  }

  const compactLogValue = (value: string | null | undefined, max = 220) => {
    if (!value) return null
    if (value.length <= max) return value
    return `${value.slice(0, max)}...<len:${value.length}>`
  }

  const extractAoiBoundaryRings = (feature: Feature<Geometry>): number[][][] => {
    const geometry = feature.geometry
    if (!geometry) return []
    if (geometry.type === 'Polygon') {
      const firstRing = geometry.coordinates?.[0]
      return Array.isArray(firstRing) ? [firstRing as number[][]] : []
    }
    if (geometry.type === 'MultiPolygon') {
      return geometry.coordinates
        .map((polygon) => polygon?.[0])
        .filter((ring): ring is number[][] => Array.isArray(ring) && ring.length >= 3)
    }
    return []
  }

  const defaultBeforeAfter = useMemo(() => {
    if (temporalImages.length < 2) return { before: '', after: '' }
    return { before: temporalImages[0].id, after: temporalImages[temporalImages.length - 1].id }
  }, [temporalImages])
  const ndviAnimationFactor = ndviEvolutionEnabled ? ndviEvolutionFactor : 1

  const countNdviCells = (collection: NdviFeatureCollection) => {
    let total = 0
    collection.features.forEach((feature) => {
      if (feature.geometry.type === 'Polygon') {
        total += 1
        return
      }
      total += Array.isArray(feature.geometry.coordinates) ? feature.geometry.coordinates.length : 0
    })
    return total
  }

  const countLandUseCells = (collection: LandUseFeatureCollection3D) => {
    let total = 0
    collection.features.forEach((feature) => {
      if (feature.geometry.type === 'Polygon') {
        total += 1
        return
      }
      total += Array.isArray(feature.geometry.coordinates) ? feature.geometry.coordinates.length : 0
    })
    return total
  }

  useEffect(() => {
    if (!beforeImageId && defaultBeforeAfter.before) setBeforeImageId(defaultBeforeAfter.before)
    if (!afterImageId && defaultBeforeAfter.after) setAfterImageId(defaultBeforeAfter.after)
  }, [beforeImageId, afterImageId, defaultBeforeAfter])

  useEffect(() => {
    if (ndviEvolutionEnabled) {
      setNdviEvolutionFactor((current) => (current <= 0 ? 0.05 : current))
      return
    }
    setNdviEvolutionPlaying(false)
    setNdviEvolutionFactor(1)
  }, [ndviEvolutionEnabled])

  useEffect(() => {
    if (!ndviEvolutionEnabled || !ndviEvolutionPlaying) return
    const timer = window.setInterval(() => {
      setNdviEvolutionFactor((previous) => {
        const next = previous + 0.06
        return next > 1 ? 0.08 : next
      })
    }, 280)
    return () => {
      window.clearInterval(timer)
    }
  }, [ndviEvolutionEnabled, ndviEvolutionPlaying])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewerReady || !isViewerAlive(viewer)) return
    let cancelled = false

    const loadVectorBuildings = async () => {
      try {
        let tileset: Cesium3DTileset
        if (buildingsProvider === 'google-3d') {
          if (!googleMapsApiKey) {
            setBuildingsStatus('inactive')
            setBuildingsStatusText('Inativo: defina VITE_GOOGLE_MAPS_API_KEY para Google 3D Tiles.')
            return
          }
          tileset = await Cesium3DTileset.fromUrl(
            `https://tile.googleapis.com/v1/3dtiles/root.json?key=${googleMapsApiKey}`,
          )
        } else {
          if (cesiumIonToken) {
            Ion.defaultAccessToken = cesiumIonToken
          } else {
            setBuildingsStatus('inactive')
            setBuildingsStatusText('Inativo: defina VITE_CESIUM_ION_TOKEN para habilitar edificacoes 3D.')
            return
          }
          tileset = await createOsmBuildingsAsync()
        }

        if (cancelled || !isViewerAlive(viewer)) return
        // Improves refinement to reduce missing/placeholder buildings while navigating.
        tileset.maximumScreenSpaceError = 6
        tileset.skipLevelOfDetail = false
        tileset.immediatelyLoadDesiredLevelOfDetail = true
        tileset.dynamicScreenSpaceError = false
        tileset.preloadFlightDestinations = true
        tileset.preferLeaves = true
        tileset.cullRequestsWhileMoving = false
        tileset.cullRequestsWhileMovingMultiplier = 0
        viewer.scene.primitives.add(tileset)
        buildingsTilesetRef.current = tileset
        setBuildingsStatus('active')
        if (buildingsProvider === 'google-3d') {
          setBuildingsStatusText('Ativo (Google Photorealistic 3D Tiles)')
        } else {
          setBuildingsStatusText('Ativo (OSM 3D - cobertura depende da base de dados)')
        }
      } catch (error) {
        console.error('Falha ao carregar edificaÃ§Ãµes 3D vetoriais (OSM Buildings):', error)
        if (!cancelled && isViewerAlive(viewer)) {
          setBuildingsStatus('inactive')
          setBuildingsStatusText('Inativo: falha ao carregar fonte 3D selecionada.')
        }
      }
    }

    setBuildingsStatus('loading')
    setBuildingsStatusText('Carregando fonte 3D...')
    void loadVectorBuildings()

    return () => {
      cancelled = true
      if (buildingsTilesetRef.current && isViewerAlive(viewer)) {
        try {
          viewer.scene.primitives.remove(buildingsTilesetRef.current)
        } catch (_error) {
          // Ignore teardown race during 3D -> 2D switch.
        }
      }
      buildingsTilesetRef.current = null
    }
  }, [viewerReady, viewerRef, cesiumIonToken, googleMapsApiKey, buildingsProvider])

  const computeAoiBbox = (feature: Feature<Geometry> | null): [number, number, number, number] | undefined => {
    if (!feature) return undefined
    const coordinates: Array<[number, number]> = []

    const walk = (node: unknown) => {
      if (!Array.isArray(node)) return
      if (node.length >= 2 && typeof node[0] === 'number' && typeof node[1] === 'number') {
        coordinates.push([node[0], node[1]])
        return
      }
      node.forEach((child) => walk(child))
    }

    walk((feature.geometry as unknown as { coordinates?: unknown }).coordinates)
    if (!coordinates.length) return undefined

    let minLng = Number.POSITIVE_INFINITY
    let minLat = Number.POSITIVE_INFINITY
    let maxLng = Number.NEGATIVE_INFINITY
    let maxLat = Number.NEGATIVE_INFINITY

    coordinates.forEach(([lng, lat]) => {
      minLng = Math.min(minLng, lng)
      minLat = Math.min(minLat, lat)
      maxLng = Math.max(maxLng, lng)
      maxLat = Math.max(maxLat, lat)
    })

    return [minLng, minLat, maxLng, maxLat]
  }

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewerReady || !isViewerAlive(viewer)) return
    let cancelled = false

    void applyTerrainLayer(viewer, 1).catch((error) => {
      if (!cancelled) {
        console.warn('Falha ao aplicar terrain provider no modo 3D:', error)
      }
    })

    return () => {
      cancelled = true
    }
  }, [viewerReady, viewerRef])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewerReady || !isViewerAlive(viewer)) return
    setTerrainExaggeration(viewer, terrainExaggeration)
  }, [viewerReady, terrainExaggeration, viewerRef])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewerReady || !isViewerAlive(viewer)) return

    const clearCurrentAoi = () => {
      aoiBoundaryEntitiesRef.current.forEach((entityId) => {
        if (!isViewerAlive(viewer)) return
        const entity = viewer.entities.getById(entityId)
        if (!entity) return
        try {
          viewer.entities.remove(entity)
        } catch (_error) {
          // Ignore teardown race during 3D -> 2D switch.
        }
      })
      aoiBoundaryEntitiesRef.current = []

      if (aoiDataSourceRef.current && isViewerAlive(viewer)) {
        try {
          viewer.dataSources.remove(aoiDataSourceRef.current, true)
        } catch (_error) {
          // Ignore teardown race during 3D -> 2D switch.
        }
      }
      aoiDataSourceRef.current = null
    }

    if (!activeAoi) {
      clearCurrentAoi()
      return
    }

    let cancelled = false

    const loadAoi = async () => {
      try {
        clearCurrentAoi()

        const dataSource = await GeoJsonDataSource.load(activeAoi as unknown as object, {
          clampToGround: true,
          fill: Color.fromCssColorString('#00c2ff').withAlpha(0.16),
          stroke: Color.fromCssColorString('#000000').withAlpha(0),
          strokeWidth: 0,
        })

        if (cancelled || !isViewerAlive(viewer)) return

        dataSource.entities.values.forEach((entity) => {
          if (!entity.polygon) return
          // Drape AOI fill on terrain without outline to avoid Cesium terrain-outline warnings.
          entity.polygon.material = new ColorMaterialProperty(
            Color.fromCssColorString('#00c2ff').withAlpha(0.16),
          )
          entity.polygon.outline = new ConstantProperty(false)
        })

        if (!isViewerAlive(viewer)) return
        try {
          viewer.dataSources.add(dataSource)
        } catch (_error) {
          return
        }
        aoiDataSourceRef.current = dataSource

        // Render AOI boundary as independent ground-clamped polyline (supported on terrain).
        extractAoiBoundaryRings(activeAoi).forEach((ring, ringIndex) => {
          if (!ring || ring.length < 3 || !isViewerAlive(viewer)) return
          const closedRing = (() => {
            const [firstLng, firstLat] = ring[0] ?? []
            const [lastLng, lastLat] = ring[ring.length - 1] ?? []
            if (firstLng === lastLng && firstLat === lastLat) return ring
            return [...ring, ring[0]]
          })()
          const positions = closedRing.map(([lng, lat]) => Cartesian3.fromDegrees(lng, lat))
          const boundary = viewer.entities.add({
            id: `aoi-boundary-${ringIndex}`,
            polyline: {
              positions,
              width: 2.2,
              clampToGround: true,
              material: Color.fromCssColorString('#66e5ff').withAlpha(0.95),
            },
          })
          if (boundary?.id) {
            aoiBoundaryEntitiesRef.current.push(String(boundary.id))
          }
        })

        try {
          await viewer.flyTo(dataSource, { duration: 1.2 })
        } catch (_error) {
          // Ignore flyTo cancellation/teardown race.
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Falha ao renderizar AOI no modo 3D:', error)
        }
      }
    }

    void loadAoi()

    return () => {
      cancelled = true
    }
  }, [activeAoi, viewerReady, viewerRef])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewerReady || !isViewerAlive(viewer)) return
    const screenHandler = viewer.screenSpaceEventHandler
    if (!screenHandler) return

    const previousLeftClick = screenHandler.getInputAction(ScreenSpaceEventType.LEFT_CLICK)
    const onLeftClick = (movement: { position?: unknown }) => {
      if (typeof previousLeftClick === 'function') previousLeftClick(movement as never)
      if (!movement?.position || !isViewerAlive(viewer)) return
      const picked = viewer.scene.pick(movement.position as never)
      const landUseInfo = extractLandUse3DPickInfo(picked, 'landuse-3d')
      if (landUseInfo) {
        setSelectedLandUseCell(landUseInfo)
        setSelectedNdviCell(null)
        return
      }

      if (!ndviVolumetricEnabled) {
        setSelectedNdviCell(null)
        return
      }

      const ndviInfo = extractNdviPickInfo(picked, 'ndvi-3d')
      setSelectedNdviCell(ndviInfo)
      if (!ndviInfo) setSelectedLandUseCell(null)
    }

    screenHandler.setInputAction(onLeftClick as never, ScreenSpaceEventType.LEFT_CLICK)
    return () => {
      if (!isViewerAlive(viewer)) return
      if (typeof previousLeftClick === 'function') {
        screenHandler.setInputAction(previousLeftClick, ScreenSpaceEventType.LEFT_CLICK)
      } else {
        screenHandler.removeInputAction(ScreenSpaceEventType.LEFT_CLICK)
      }
    }
  }, [viewerReady, viewerRef, ndviVolumetricEnabled, landUse3dEnabled])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewerReady || !isViewerAlive(viewer)) return
    let cancelled = false

    if (!ndviVolumetricEnabled) {
      clearNdviExtrusionLayer(viewer)
      setSelectedNdviCell(null)
      setNdviRenderedCells(0)
      return
    }

    const buildFallbackCollection = (): NdviFeatureCollection | null => {
      if (!activeAoi || ndviMeanFallback === null || Number.isNaN(ndviMeanFallback)) return null
      const geometry = activeAoi.geometry
      if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return null
      return {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: geometry as NdviFeatureCollection['features'][number]['geometry'],
            properties: {
              ndvi_mean: ndviMeanFallback,
              date: new Date().toISOString().slice(0, 10),
            },
          },
        ],
      }
    }

    const loadNdvi3dLayer = async () => {
      try {
        const bbox = computeAoiBbox(activeAoi)
        const data = await fetchNdvi3dData(apiBaseUrl, {
          bbox,
          polygon: activeAoi?.geometry ?? null,
          satellite,
          scale: 30,
          maxFeatures: 2200,
          simplifyMeters: 20,
        })
        if (cancelled || !isViewerAlive(viewer)) return
        if (data.features.length > 0) {
          setNdviRenderedCells(countNdviCells(data))
          await applyNdviExtrusionLayer(viewer, data, {
            alpha: ndviAlpha,
            verticalScale: ndviVolumeScale,
            animationFactor: ndviAnimationFactor,
          })
          return
        }
        const fallback = buildFallbackCollection()
        if (fallback) {
          setNdviRenderedCells(countNdviCells(fallback))
          await applyNdviExtrusionLayer(viewer, fallback, {
            alpha: ndviAlpha,
            verticalScale: ndviVolumeScale,
            animationFactor: ndviAnimationFactor,
          })
        } else {
          clearNdviExtrusionLayer(viewer)
          setNdviRenderedCells(0)
        }
      } catch (error) {
        if (!cancelled && isViewerAlive(viewer)) {
          console.error('Falha ao carregar camada NDVI 3D:', error)
          const fallback = buildFallbackCollection()
          if (fallback) {
            setNdviRenderedCells(countNdviCells(fallback))
            await applyNdviExtrusionLayer(viewer, fallback, {
              alpha: ndviAlpha,
              verticalScale: ndviVolumeScale,
              animationFactor: ndviAnimationFactor,
            })
          } else {
            clearNdviExtrusionLayer(viewer)
            setNdviRenderedCells(0)
          }
        }
      }
    }

    void loadNdvi3dLayer()

    return () => {
      cancelled = true
    }
  }, [
    activeAoi,
    apiBaseUrl,
    viewerReady,
    viewerRef,
    ndviRefreshKey,
    ndviMeanFallback,
    ndviVolumetricEnabled,
    satellite,
  ])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewerReady || !isViewerAlive(viewer) || !ndviVolumetricEnabled) return
    updateNdviExtrusionLayerStyle(viewer, {
      alpha: ndviAlpha,
      verticalScale: ndviVolumeScale,
      animationFactor: ndviAnimationFactor,
    })
  }, [
    viewerReady,
    viewerRef,
    ndviVolumetricEnabled,
    ndviAlpha,
    ndviVolumeScale,
    ndviAnimationFactor,
  ])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewerReady || !isViewerAlive(viewer)) return
    let cancelled = false

    const shouldRenderLandUse3D =
      landUse3dEnabled && Boolean(showLandCoverLayer) && Boolean(landCoverClassificationId)

    if (!shouldRenderLandUse3D) {
      clearLandUse3DLayer(viewer)
      setLandUse3dFeatureCount(0)
      setLandUse3dError(null)
      setSelectedLandUseCell(null)
      return
    }

    const loadLandUse3D = async () => {
      try {
        setLandUse3dLoading(true)
        setLandUse3dError(null)
        const data = await fetchLandUse3DData(apiBaseUrl, String(landCoverClassificationId), {
          scale: 30,
          simplifyMeters: 12,
          maxFeatures: 3000,
        })
        if (cancelled || !isViewerAlive(viewer)) return
        setLandUse3dFeatureCount(countLandUseCells(data))
        await renderLandUse3D(
          viewer,
          data,
          { alpha: landUse3dAlpha, heightScale: landUse3dHeightScale },
          'landuse-3d',
        )
      } catch (error: any) {
        if (cancelled || !isViewerAlive(viewer)) return
        console.error('Falha ao renderizar classificacao uso do solo em 3D:', error)
        clearLandUse3DLayer(viewer)
        setLandUse3dFeatureCount(0)
        setLandUse3dError(error?.message || 'Falha ao carregar classificacao 3D.')
      } finally {
        if (!cancelled) setLandUse3dLoading(false)
      }
    }

    void loadLandUse3D()

    return () => {
      cancelled = true
    }
  }, [
    viewerReady,
    viewerRef,
    apiBaseUrl,
    landUse3dEnabled,
    showLandCoverLayer,
    landCoverClassificationId,
  ])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewerReady || !isViewerAlive(viewer) || !landUse3dEnabled) return
    updateLandUse3DStyle(
      viewer,
      {
        alpha: landUse3dAlpha,
        heightScale: landUse3dHeightScale,
      },
      'landuse-3d',
    )
  }, [viewerReady, viewerRef, landUse3dEnabled, landUse3dAlpha, landUse3dHeightScale])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewerReady || !isViewerAlive(viewer)) return
    let cancelled = false

    const loadDemOverlay = async () => {
      try {
        const bbox = computeAoiBbox(activeAoi)
        const demTileUrl = await fetchDemTile(apiBaseUrl, bbox)
        if (cancelled || !isViewerAlive(viewer)) return
        setTerrainOverlayWarning(null)
        applyDemOverlay(viewer, demTileUrl, 0.35, (message) => {
          setTerrainOverlayWarning(message)
        })
      } catch (error) {
        if (!cancelled && isViewerAlive(viewer)) {
          console.error('Falha ao carregar DEM no 3D:', error)
          clearDemOverlay(viewer)
          setTerrainOverlayWarning('Nao foi possivel carregar a camada de relevo.')
        }
      }
    }

    void loadDemOverlay()

    return () => {
      cancelled = true
    }
  }, [activeAoi, apiBaseUrl, viewerReady, viewerRef])

  const clearDifferenceLayer = () => {
    const viewer = viewerRef.current
    if (differenceLayerErrorCleanupRef.current) {
      differenceLayerErrorCleanupRef.current()
      differenceLayerErrorCleanupRef.current = null
    }
    if (!isViewerAlive(viewer)) {
      differenceLayerRef.current = null
      return
    }
    if (!differenceLayerRef.current) return
    try {
      viewer.imageryLayers.remove(differenceLayerRef.current, true)
    } catch (_error) {
      // Ignore teardown race during 3D -> 2D switch.
    }
    differenceLayerRef.current = null
  }

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewerReady || !isViewerAlive(viewer)) return

    const normalizedDifferenceLayerUrl = normalizeTileTemplateUrl(differenceLayerUrl)
    const shouldDisplayDifferenceLayer =
      Boolean(normalizedDifferenceLayerUrl) &&
      Boolean(showDifferenceLayer) &&
      (!showToolsBar || ndviChange3dEnabled)

    if (!shouldDisplayDifferenceLayer || !normalizedDifferenceLayerUrl) {
      clearDifferenceLayer()
      return
    }

    clearDifferenceLayer()
    try {
      console.info('3D: aplicando camada de diferenca', {
        showDifferenceLayer,
        ndviChange3dEnabled,
        normalizedDifferenceLayerUrl: compactLogValue(normalizedDifferenceLayerUrl),
      })
      const provider = new UrlTemplateImageryProvider({ url: normalizedDifferenceLayerUrl })
      let providerErrorCount = 0
      const providerErrorListener = provider.errorEvent.addEventListener((tileError) => {
        providerErrorCount += 1
        const shortMessage =
          typeof tileError?.message === 'string' && tileError.message.length
            ? tileError.message
            : 'falha de tile sem mensagem'
        if (providerErrorCount <= 2) {
          // Controlled retry for transient tile service failures.
          tileError.retry = true
          return
        }
        console.warn('3D: camada de diferenca com falha persistente de tile.', {
          attempts: providerErrorCount,
          message: shortMessage,
          url: compactLogValue(normalizedDifferenceLayerUrl),
        })
        clearDifferenceLayer()
      })
      differenceLayerErrorCleanupRef.current = () => {
        try {
          providerErrorListener()
        } catch (_error) {
          // Ignore listener teardown race when switching modes/layers.
        }
      }
      const layer = viewer.imageryLayers.addImageryProvider(
        provider,
      )
      layer.alpha = 0.95
      viewer.imageryLayers.raiseToTop(layer)
      differenceLayerRef.current = layer
    } catch (error) {
      console.error('Falha ao carregar camada de diferenca no modo 3D:', error)
      clearDifferenceLayer()
    }

    return () => {
      clearDifferenceLayer()
    }
  }, [
    viewerReady,
    viewerRef,
    differenceLayerUrl,
    showDifferenceLayer,
    ndviChange3dEnabled,
    showToolsBar,
  ])

  const clearComparisonLayers = () => {
    const viewer = viewerRef.current
    if (!isViewerAlive(viewer)) {
      beforeLayerRef.current = null
      afterLayerRef.current = null
      return
    }
    if (beforeLayerRef.current) {
      try {
        viewer.imageryLayers.remove(beforeLayerRef.current, true)
      } catch (_error) {
        // Ignore teardown race during 3D -> 2D switch.
      }
      beforeLayerRef.current = null
    }
    if (afterLayerRef.current) {
      try {
        viewer.imageryLayers.remove(afterLayerRef.current, true)
      } catch (_error) {
        // Ignore teardown race during 3D -> 2D switch.
      }
      afterLayerRef.current = null
    }
  }

  const fetchNdviTileForImage = async (imageId: string) => {
    const response = await fetch(`${apiBaseUrl}/api/earth-images/indices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageId,
        satellite,
        polygon: activeAoi?.geometry,
        indices: ['NDVI'],
      }),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Falha ao gerar NDVI temporal: ${response.status} ${text}`)
    }
    const data = (await response.json()) as { results?: Array<{ indexName: string; imageUrl: string }> }
    const ndviResult = (data.results || []).find((item) => item.indexName.toUpperCase() === 'NDVI')
    if (!ndviResult?.imageUrl) throw new Error('Resposta sem tile NDVI.')
    return ndviResult.imageUrl
  }

  const applyTemporalSplit = async () => {
    const viewer = viewerRef.current
    if (!isViewerAlive(viewer) || !canCompare || !beforeImageId || !afterImageId) return
    if (beforeImageId === afterImageId) {
      setCompareError('Selecione duas datas diferentes para comparar.')
      return
    }
    setCompareLoading(true)
    setCompareError(null)
    try {
      const [beforeTile, afterTile] = await Promise.all([
        fetchNdviTileForImage(beforeImageId),
        fetchNdviTileForImage(afterImageId),
      ])

      clearComparisonLayers()

      if (!isViewerAlive(viewer)) return
      const beforeLayer = viewer.imageryLayers.addImageryProvider(
        new UrlTemplateImageryProvider({ url: beforeTile }),
      )
      const afterLayer = viewer.imageryLayers.addImageryProvider(
        new UrlTemplateImageryProvider({ url: afterTile }),
      )

      beforeLayer.splitDirection = SplitDirection.LEFT
      afterLayer.splitDirection = SplitDirection.RIGHT
      beforeLayer.alpha = 0.95
      afterLayer.alpha = 0.95
      viewer.scene.splitPosition = splitPosition

      beforeLayerRef.current = beforeLayer
      afterLayerRef.current = afterLayer
    } catch (error: any) {
      setCompareError(error?.message || 'Falha ao aplicar comparaÃ§Ã£o temporal.')
      clearComparisonLayers()
    } finally {
      setCompareLoading(false)
    }
  }

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewerReady || !isViewerAlive(viewer)) return
    try {
      viewer.scene.splitPosition = splitPosition
    } catch (_error) {
      // Ignore scene update race during 3D -> 2D switch.
    }
  }, [splitPosition, viewerReady, viewerRef])

  useEffect(() => {
    return () => {
      clearComparisonLayers()
      clearDifferenceLayer()
      const viewer = viewerRef.current
      if (isViewerAlive(viewer)) {
        if (aoiDataSourceRef.current) {
          try {
            viewer.dataSources.remove(aoiDataSourceRef.current, true)
          } catch (_error) {
            // Ignore teardown race.
          }
          aoiDataSourceRef.current = null
        }
        aoiBoundaryEntitiesRef.current.forEach((entityId) => {
          const entity = viewer.entities.getById(entityId)
          if (!entity) return
          try {
            viewer.entities.remove(entity)
          } catch (_error) {
            // Ignore teardown race.
          }
        })
        aoiBoundaryEntitiesRef.current = []
        clearNdviExtrusionLayer(viewer)
        clearLandUse3DLayer(viewer)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={className} style={{ width: '100%', height: '100%', minHeight: '360px', ...style }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <TerrainProfileToolbarAction
        enabled={terrainProfile.isToolActive}
        status={terrainProfile.status}
        hasAnalysis={Boolean(terrainProfile.analysis)}
        isProfileVisible={terrainProfile.isProfileVisible}
        onActivate={terrainProfile.activateTool}
        onDeactivate={terrainProfile.deactivateTool}
        onCancelDrawing={terrainProfile.cancelDrawing}
        onRedraw={terrainProfile.redrawProfile}
        onClear={terrainProfile.clearAnalysis}
        onToggleVisibility={terrainProfile.toggleProfileVisibility}
      />
      <TerrainProfilePanel
        open={
          (terrainProfile.isToolActive && terrainProfile.status !== 'drawing') ||
          terrainProfile.status === 'error'
        }
        status={terrainProfile.status}
        analysis={terrainProfile.analysis}
        errorMessage={terrainProfile.errorMessage}
        onClose={terrainProfile.deactivateTool}
        onClear={terrainProfile.clearAnalysis}
        onRedraw={terrainProfile.redrawProfile}
        onHoverPoint={terrainProfile.handleChartHover}
        onSelectPoint={terrainProfile.handleChartSelect}
      />
      {showToolsBar && (
        <div className="split-compare-card">
          <h4>Comparacao Temporal NDVI</h4>
          <div className="split-row">
            <label>Fonte 3D</label>
            <select
              value={buildingsProvider}
              onChange={(event) => setBuildingsProvider(event.target.value as 'osm' | 'google-3d')}
            >
              <option value="google-3d">Google Photorealistic</option>
              <option value="osm">OSM 3D</option>
            </select>
          </div>
          <div className={`buildings-status buildings-status-${buildingsStatus}`}>
            <span>Edificacoes 3D: {buildingsStatusText}</span>
          </div>
          {terrainOverlayWarning && <p className="split-error">{terrainOverlayWarning}</p>}
          <div className="split-row">
            <label>Antes</label>
            <select
              value={beforeImageId}
              onChange={(event) => setBeforeImageId(event.target.value)}
              disabled={!canCompare || compareLoading}
            >
              <option value="">Selecione</option>
              {temporalImages.map((img) => (
                <option key={`before-${img.id}`} value={img.id}>
                  {img.date}
                </option>
              ))}
            </select>
          </div>
          <div className="split-row">
            <label>Depois</label>
            <select
              value={afterImageId}
              onChange={(event) => setAfterImageId(event.target.value)}
              disabled={!canCompare || compareLoading}
            >
              <option value="">Selecione</option>
              {temporalImages.map((img) => (
                <option key={`after-${img.id}`} value={img.id}>
                  {img.date}
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={() => void applyTemporalSplit()} disabled={!canCompare || compareLoading}>
            {compareLoading ? 'Aplicando...' : 'Aplicar Comparacao'}
          </button>
          <div className="split-row">
            <label>Divisao: {(splitPosition * 100).toFixed(0)}%</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={splitPosition}
              onChange={(event) => setSplitPosition(Number(event.target.value))}
              disabled={compareLoading}
            />
          </div>
          {compareError && <p className="split-error">{compareError}</p>}

          <div className="split-divider" />
          <h4>Visualizacao 3D</h4>
          <label className="split-check">
            <input
              type="checkbox"
              checked={ndviVolumetricEnabled}
              onChange={(event) => setNdviVolumetricEnabled(event.target.checked)}
            />
            NDVI volumetrico
          </label>
          <label className="split-check">
            <input
              type="checkbox"
              checked={ndviChange3dEnabled}
              onChange={(event) => setNdviChange3dEnabled(event.target.checked)}
            />
            Deteccao de mudanca 3D
          </label>
          <label className="split-check">
            <input
              type="checkbox"
              checked={ndviEvolutionEnabled}
              onChange={(event) => setNdviEvolutionEnabled(event.target.checked)}
              disabled={!ndviVolumetricEnabled}
            />
            NDVI evolution
          </label>

          <div className="split-row">
            <label>Exagero vertical volume: {ndviVolumeScale.toFixed(1)}x</label>
            <input
              type="range"
              min={0.5}
              max={4}
              step={0.1}
              value={ndviVolumeScale}
              onChange={(event) => setNdviVolumeScale(Number(event.target.value))}
              disabled={!ndviVolumetricEnabled}
            />
          </div>

          <div className="split-row">
            <label>Transparencia: {(ndviAlpha * 100).toFixed(0)}%</label>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={ndviAlpha}
              onChange={(event) => setNdviAlpha(Number(event.target.value))}
              disabled={!ndviVolumetricEnabled}
            />
          </div>

          {ndviEvolutionEnabled && (
            <>
              <div className="split-row">
                <label>Fator temporal: {(ndviEvolutionFactor * 100).toFixed(0)}%</label>
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.01}
                  value={ndviEvolutionFactor}
                  onChange={(event) => setNdviEvolutionFactor(Number(event.target.value))}
                />
              </div>
              <button
                type="button"
                onClick={() => setNdviEvolutionPlaying((value) => !value)}
                disabled={!ndviVolumetricEnabled}
              >
                {ndviEvolutionPlaying ? 'Pausar evolution' : 'Animar evolution'}
              </button>
            </>
          )}

          <p className="split-meta">
            Celulas: {ndviRenderedCells.toLocaleString('pt-BR')} {ndviRenderedCells > 2000 ? '(Primitive)' : '(Entity)'}
          </p>
          {ndviChange3dEnabled && (
            <p className="split-note">
              Modo de mudanca 3D ativo: camadas de mudanca volumetrica podem ser adicionadas na comparacao temporal.
            </p>
          )}

          {ndviVolumetricEnabled && <Ndvi3dLegend alpha={ndviAlpha} />}

          <div className="split-divider" />
          <h4>Uso do Solo 3D</h4>
          <LandUseControls
            enabled={landUse3dEnabled}
            onEnabledChange={setLandUse3dEnabled}
            showLegend={landUse3dShowLegend}
            onShowLegendChange={setLandUse3dShowLegend}
            heightScale={landUse3dHeightScale}
            onHeightScaleChange={setLandUse3dHeightScale}
            alpha={landUse3dAlpha}
            onAlphaChange={setLandUse3dAlpha}
            featureCount={landUse3dFeatureCount}
            loading={landUse3dLoading}
            error={landUse3dError}
          />
          {landUse3dEnabled && landUse3dShowLegend && (
            <LandUseLegend3D alpha={landUse3dAlpha} legend={landCoverLegend} />
          )}
          {selectedLandUseCell && (
            <div className="ndvi-cell-card landuse-cell-card">
              <h5>Classe Uso do Solo 3D</h5>
              <p>Classe: {selectedLandUseCell.className}</p>
              <p>ID: {selectedLandUseCell.classId}</p>
              {selectedLandUseCell.areaHa !== null && (
                <p>Area: {selectedLandUseCell.areaHa.toFixed(2)} ha</p>
              )}
              {selectedLandUseCell.areaPctAoi !== null && (
                <p>Percentual AOI: {selectedLandUseCell.areaPctAoi.toFixed(2)}%</p>
              )}
              <p>Altura tematica: {selectedLandUseCell.thematicHeightM.toFixed(1)} m</p>
              <p>Altitude terreno: {selectedLandUseCell.terrainHeightM.toFixed(1)} m</p>
            </div>
          )}

          {selectedNdviCell && (
            <div className="ndvi-cell-card">
              <h5>Celula NDVI 3D</h5>
              <p>NDVI: {selectedNdviCell.ndvi.toFixed(2)}</p>
              <p>Altitude terreno: {selectedNdviCell.terrainHeight.toFixed(1)} m</p>
              <p>Altura volume: {selectedNdviCell.volumeHeight.toFixed(1)} m</p>
              <p>Classe: {selectedNdviCell.classLabel}</p>
              {selectedNdviCell.area !== null && <p>Area: {selectedNdviCell.area.toFixed(2)} ha</p>}
              {selectedNdviCell.date && <p>Data: {selectedNdviCell.date}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}


