import React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Feature, Geometry } from 'geojson'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import {
  ArcType,
  Color,
  createOsmBuildingsAsync,
  Cesium3DTileset,
  ConstantProperty,
  GeoJsonDataSource,
  ColorMaterialProperty,
  HeightReference,
  ImageryLayer,
  Ion,
  SplitDirection,
  UrlTemplateImageryProvider,
} from 'cesium'
import { useCesiumViewer } from './useCesiumViewer'
import {
  applyNdviExtrusionLayer,
  clearNdviExtrusionLayer,
  fetchNdvi3dData,
  type NdviFeatureCollection,
} from './layers/NDVIExtrusionLayer'
import {
  applyDemOverlay,
  applyTerrainLayer,
  clearDemOverlay,
  fetchDemTile,
  setTerrainExaggeration,
} from './layers/TerrainLayer'

interface Globe3DProps {
  className?: string
  style?: React.CSSProperties
  activeAoi?: Feature<Geometry> | null
  terrainExaggeration?: number
  ndviRefreshKey?: number
  ndviMeanFallback?: number | null
  satellite?: string
  temporalImages?: Array<{ id: string; date: string }>
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
}: Globe3DProps) {
  const { containerRef, viewerRef, viewerReady } = useCesiumViewer()
  const aoiDataSourceRef = useRef<GeoJsonDataSource | null>(null)
  const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const cesiumIonToken = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
  const beforeLayerRef = useRef<ImageryLayer | null>(null)
  const afterLayerRef = useRef<ImageryLayer | null>(null)
  const buildingsTilesetRef = useRef<Cesium3DTileset | null>(null)
  const [beforeImageId, setBeforeImageId] = useState<string>('')
  const [afterImageId, setAfterImageId] = useState<string>('')
  const [splitPosition, setSplitPosition] = useState(0.5)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState<string | null>(null)
  const [buildingsStatus, setBuildingsStatus] = useState<'loading' | 'active' | 'inactive'>('loading')
  const [buildingsStatusText, setBuildingsStatusText] = useState('Carregando edificaÃ§Ãµes vetoriais...')
  const [buildingsProvider, setBuildingsProvider] = useState<'osm' | 'google-3d'>('osm')

  const isViewerAlive = (
    viewer: typeof viewerRef.current,
  ): viewer is NonNullable<typeof viewerRef.current> => {
    if (!viewer) return false
    return typeof viewer.isDestroyed === 'function' ? !viewer.isDestroyed() : true
  }

  const canCompare = !!activeAoi && !!satellite && temporalImages.length >= 2

  const defaultBeforeAfter = useMemo(() => {
    if (temporalImages.length < 2) return { before: '', after: '' }
    return { before: temporalImages[0].id, after: temporalImages[temporalImages.length - 1].id }
  }, [temporalImages])

  useEffect(() => {
    if (googleMapsApiKey && buildingsProvider === 'osm') {
      setBuildingsProvider('google-3d')
    }
  }, [googleMapsApiKey, buildingsProvider])

  useEffect(() => {
    if (!beforeImageId && defaultBeforeAfter.before) setBeforeImageId(defaultBeforeAfter.before)
    if (!afterImageId && defaultBeforeAfter.after) setAfterImageId(defaultBeforeAfter.after)
  }, [beforeImageId, afterImageId, defaultBeforeAfter])

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
        tileset.cullWithChildrenBounds = false
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
        viewer.scene.primitives.remove(buildingsTilesetRef.current)
      }
      buildingsTilesetRef.current = null
      setBuildingsStatus('inactive')
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
    void applyTerrainLayer(viewer, 1)
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
      if (aoiDataSourceRef.current && isViewerAlive(viewer)) {
        viewer.dataSources.remove(aoiDataSourceRef.current, true)
      }
      aoiDataSourceRef.current = null
    }

    if (!activeAoi) {
      clearCurrentAoi()
      return
    }

    let cancelled = false

    const loadAoi = async () => {
      clearCurrentAoi()

      const dataSource = await GeoJsonDataSource.load(activeAoi as unknown as object, {
        clampToGround: true,
      })

      if (cancelled || !isViewerAlive(viewer)) return

      dataSource.entities.values.forEach((entity) => {
        if (!entity.polygon) return
        entity.polygon.heightReference = new ConstantProperty(HeightReference.CLAMP_TO_GROUND)
        entity.polygon.extrudedHeight = new ConstantProperty(25)
        entity.polygon.extrudedHeightReference = new ConstantProperty(HeightReference.RELATIVE_TO_GROUND)
        entity.polygon.perPositionHeight = new ConstantProperty(false)
        entity.polygon.arcType = new ConstantProperty(ArcType.GEODESIC)
        entity.polygon.material = new ColorMaterialProperty(
          Color.fromCssColorString('#00c2ff').withAlpha(0.32),
        )
        entity.polygon.outline = new ConstantProperty(true)
        entity.polygon.outlineColor = new ConstantProperty(Color.fromCssColorString('#66e5ff'))
      })

      if (!isViewerAlive(viewer)) return
      viewer.dataSources.add(dataSource)
      aoiDataSourceRef.current = dataSource
      await viewer.flyTo(dataSource, { duration: 1.2 })
    }

    void loadAoi()

    return () => {
      cancelled = true
    }
  }, [activeAoi, viewerReady, viewerRef])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewerReady || !isViewerAlive(viewer)) return
    let cancelled = false

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
        const data = await fetchNdvi3dData(apiBaseUrl, bbox)
        if (cancelled || !isViewerAlive(viewer)) return
        if (data.features.length > 0) {
          applyNdviExtrusionLayer(viewer, data)
          return
        }
        const fallback = buildFallbackCollection()
        if (fallback) applyNdviExtrusionLayer(viewer, fallback)
        else clearNdviExtrusionLayer(viewer)
      } catch (error) {
        if (!cancelled && isViewerAlive(viewer)) {
          console.error('Falha ao carregar camada NDVI 3D:', error)
          const fallback = buildFallbackCollection()
          if (fallback) applyNdviExtrusionLayer(viewer, fallback)
          else clearNdviExtrusionLayer(viewer)
        }
      }
    }

    void loadNdvi3dLayer()

    return () => {
      cancelled = true
    }
  }, [activeAoi, apiBaseUrl, viewerReady, viewerRef, ndviRefreshKey, ndviMeanFallback])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewerReady || !isViewerAlive(viewer)) return
    let cancelled = false

    const loadDemOverlay = async () => {
      try {
        const bbox = computeAoiBbox(activeAoi)
        const demTileUrl = await fetchDemTile(apiBaseUrl, bbox)
        if (cancelled || !isViewerAlive(viewer)) return
        applyDemOverlay(viewer, demTileUrl, 0.35)
      } catch (error) {
        if (!cancelled && isViewerAlive(viewer)) {
          console.error('Falha ao carregar DEM no 3D:', error)
          clearDemOverlay(viewer)
        }
      }
    }

    void loadDemOverlay()

    return () => {
      cancelled = true
    }
  }, [activeAoi, apiBaseUrl, viewerReady, viewerRef])

  const clearComparisonLayers = () => {
    const viewer = viewerRef.current
    if (!isViewerAlive(viewer)) {
      beforeLayerRef.current = null
      afterLayerRef.current = null
      return
    }
    if (beforeLayerRef.current) {
      viewer.imageryLayers.remove(beforeLayerRef.current, true)
      beforeLayerRef.current = null
    }
    if (afterLayerRef.current) {
      viewer.imageryLayers.remove(afterLayerRef.current, true)
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
    viewer.scene.splitPosition = splitPosition
  }, [splitPosition, viewerReady, viewerRef])

  useEffect(() => {
    return () => {
      clearComparisonLayers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={className} style={{ width: '100%', height: '100%', minHeight: '360px', ...style }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <div className="split-compare-card">
        <h4>ComparaÃ§Ã£o Temporal NDVI</h4>
        <div className="split-row">
          <label>Fonte 3D</label>
          <select value={buildingsProvider} onChange={(event) => setBuildingsProvider(event.target.value as 'osm' | 'google-3d')}>
            <option value="google-3d">Google Photorealistic</option>
            <option value="osm">OSM 3D</option>
          </select>
        </div>
        <div className={`buildings-status buildings-status-${buildingsStatus}`}>
          <span>Edificacoes 3D: {buildingsStatusText}</span>
        </div>
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
          {compareLoading ? 'Aplicando...' : 'Aplicar ComparaÃ§Ã£o'}
        </button>
        <div className="split-row">
          <label>DivisÃ£o: {(splitPosition * 100).toFixed(0)}%</label>
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
      </div>
    </div>
  )
}


