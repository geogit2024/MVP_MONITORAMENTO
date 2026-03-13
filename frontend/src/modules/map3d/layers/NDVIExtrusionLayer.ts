import {
  ArcType,
  Cartographic,
  Color,
  ColorMaterialProperty,
  ColorGeometryInstanceAttribute,
  ConstantProperty,
  GeometryInstance,
  JulianDate,
  PerInstanceColorAppearance,
  PolygonGeometry,
  PolygonHierarchy,
  Primitive,
  Viewer,
  Cartesian3,
  sampleTerrainMostDetailed,
} from 'cesium'

interface NdviFeatureProperties {
  ndvi_mean?: number
  ndvi?: number
  class_id?: number
  class_name?: string
  ndvi_repr?: number
  color?: string
  area?: number
  date?: string
}

interface NdviFeature {
  type: 'Feature'
  geometry: {
    type: 'Polygon' | 'MultiPolygon'
    coordinates: number[][][] | number[][][][]
  }
  properties: NdviFeatureProperties
}

export interface NdviFeatureCollection {
  type: 'FeatureCollection'
  features: NdviFeature[]
}

export const NDVI_VOLUME_MAX_HEIGHT_METERS = 25
const DEFAULT_ALPHA = 0.7
const DEFAULT_VERTICAL_SCALE = 1
const DEFAULT_ANIMATION_FACTOR = 1
const DEFAULT_PRIMITIVE_THRESHOLD = 2000
const TERRAIN_SAMPLE_CHUNK_SIZE = 240

export type NdviClassLabel =
  | 'Agua'
  | 'Solo Exposto'
  | 'Vegetacao Rala'
  | 'Vegetacao Densa'

// Align 3D NDVI colors with 2D dashboard palette.
export const NDVI_2D_CLASS_COLORS = {
  agua: '#4287f5',
  soloExposto: '#d4a276',
  vegetacaoRala: '#a6d96a',
  vegetacaoDensa: '#1a9641',
} as const

export interface NdviLayerRenderOptions {
  alpha?: number
  verticalScale?: number
  animationFactor?: number
  primitiveThreshold?: number
}

interface NormalizedNdviLayerRenderOptions {
  alpha: number
  verticalScale: number
  animationFactor: number
  primitiveThreshold: number
}

interface NdviCellRecord {
  id: string
  ring: number[][]
  ndvi: number
  area: number | null
  date: string | null
  terrainHeight: number
  classLabel: NdviClassLabel
}

interface NdviLayerRuntime {
  layerId: string
  mode: 'entities' | 'primitive'
  cells: NdviCellRecord[]
  options: NormalizedNdviLayerRenderOptions
  primitive: Primitive | null
}

const NDVI_CLASS_ID_TO_LABEL: Record<number, NdviClassLabel> = {
  1: 'Agua',
  2: 'Solo Exposto',
  3: 'Vegetacao Rala',
  4: 'Vegetacao Densa',
}

const NDVI_CLASS_ID_TO_REPR: Record<number, number> = {
  1: -0.05,
  2: 0.12,
  3: 0.38,
  4: 0.7,
}

export interface NdviCellPickInfo {
  ndvi: number
  terrainHeight: number
  volumeHeight: number
  classLabel: NdviClassLabel
  area: number | null
  date: string | null
}

const runtimeByViewer = new WeakMap<Viewer, Map<string, NdviLayerRuntime>>()

function getRuntimeMap(viewer: Viewer) {
  const existing = runtimeByViewer.get(viewer)
  if (existing) return existing
  const created = new Map<string, NdviLayerRuntime>()
  runtimeByViewer.set(viewer, created)
  return created
}

function readPropertyValue(value: unknown): unknown {
  if (value && typeof value === 'object' && 'getValue' in value && typeof (value as { getValue?: unknown }).getValue === 'function') {
    const property = value as { getValue: (time?: JulianDate) => unknown }
    return property.getValue(JulianDate.now())
  }
  return value
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function normalizeOptions(options?: NdviLayerRenderOptions): NormalizedNdviLayerRenderOptions {
  const alpha = clamp(Number(options?.alpha ?? DEFAULT_ALPHA), 0.15, 1)
  const verticalScale = clamp(Number(options?.verticalScale ?? DEFAULT_VERTICAL_SCALE), 0.1, 8)
  const animationFactor = clamp(Number(options?.animationFactor ?? DEFAULT_ANIMATION_FACTOR), 0.05, 1)
  const primitiveThreshold = Math.max(1, Math.round(Number(options?.primitiveThreshold ?? DEFAULT_PRIMITIVE_THRESHOLD)))
  return {
    alpha,
    verticalScale,
    animationFactor,
    primitiveThreshold,
  }
}

export function ndviToHeight(ndvi: number, maxHeight = NDVI_VOLUME_MAX_HEIGHT_METERS) {
  const normalized = clamp(Number(ndvi) || 0, 0, 1)
  return normalized * maxHeight
}

export function classifyNdvi(ndvi: number): NdviClassLabel {
  // Mirrors NDVI thematic interpretation used in 2D charts:
  // Water, bare soil, sparse vegetation, dense vegetation.
  if (ndvi < 0) return 'Agua'
  if (ndvi < 0.25) return 'Solo Exposto'
  if (ndvi < 0.5) return 'Vegetacao Rala'
  return 'Vegetacao Densa'
}

export function getNDVIColor(ndvi: number, alpha = DEFAULT_ALPHA) {
  const normalizedAlpha = clamp(alpha, 0.05, 1)
  if (ndvi < 0) {
    return Color.fromCssColorString(NDVI_2D_CLASS_COLORS.agua).withAlpha(normalizedAlpha)
  }
  if (ndvi < 0.25) {
    return Color.fromCssColorString(NDVI_2D_CLASS_COLORS.soloExposto).withAlpha(normalizedAlpha)
  }
  if (ndvi < 0.5) {
    return Color.fromCssColorString(NDVI_2D_CLASS_COLORS.vegetacaoRala).withAlpha(normalizedAlpha)
  }
  return Color.fromCssColorString(NDVI_2D_CLASS_COLORS.vegetacaoDensa).withAlpha(normalizedAlpha)
}

function toCesiumPositions(polygon: number[][], height = 0) {
  return polygon.map(([lng, lat]) => Cartesian3.fromDegrees(lng, lat, height))
}

function normalizePolygons(geometry: NdviFeature['geometry']): number[][][][] {
  if (geometry.type === 'Polygon') {
    return [geometry.coordinates as number[][][]]
  }
  return geometry.coordinates as number[][][][]
}

const isViewerUsable = (viewer: Viewer | null | undefined): viewer is Viewer => {
  if (!viewer) return false
  return typeof viewer.isDestroyed === 'function' ? !viewer.isDestroyed() : true
}

function centroidOfRing(ring: number[][]): [number, number] {
  if (!ring.length) return [0, 0]
  let lngSum = 0
  let latSum = 0
  let valid = 0
  ring.forEach((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length < 2) return
    const lng = Number(coordinate[0])
    const lat = Number(coordinate[1])
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
    lngSum += lng
    latSum += lat
    valid += 1
  })
  if (!valid) {
    const [firstLng, firstLat] = ring[0] ?? [0, 0]
    return [Number(firstLng) || 0, Number(firstLat) || 0]
  }
  return [lngSum / valid, latSum / valid]
}

function createCells(data: NdviFeatureCollection, layerId: string) {
  const cells: NdviCellRecord[] = []
  data.features.forEach((feature, featureIndex) => {
    const classIdRaw = Number(feature.properties?.class_id)
    const classId = Number.isFinite(classIdRaw) ? Math.round(classIdRaw) : 0
    const classLabelFromId = classId > 0 ? NDVI_CLASS_ID_TO_LABEL[classId] : undefined
    const classNdviFromId = classId > 0 ? NDVI_CLASS_ID_TO_REPR[classId] : undefined
    const ndviRaw =
      classNdviFromId ??
      feature.properties?.ndvi_repr ??
      feature.properties?.ndvi_mean ??
      feature.properties?.ndvi ??
      0
    const ndvi = clamp(Number(ndviRaw) || 0, -1, 1)
    const polygons = normalizePolygons(feature.geometry)
    polygons.forEach((polygon, polygonIndex) => {
      const ring = polygon[0]
      if (!ring || ring.length < 3) return
      cells.push({
        id: `${layerId}-${featureIndex}-${polygonIndex}`,
        ring,
        ndvi,
        area: Number.isFinite(Number(feature.properties?.area))
          ? Number(feature.properties?.area)
          : null,
        date: feature.properties?.date ?? null,
        terrainHeight: 0,
        classLabel: classLabelFromId ?? classifyNdvi(ndvi),
      })
    })
  })
  return cells
}

async function sampleCellsTerrainHeight(viewer: Viewer, cells: NdviCellRecord[]) {
  if (!cells.length) return
  const provider = viewer.terrainProvider
  if (!provider) return

  for (let offset = 0; offset < cells.length; offset += TERRAIN_SAMPLE_CHUNK_SIZE) {
    const chunk = cells.slice(offset, offset + TERRAIN_SAMPLE_CHUNK_SIZE)
    const cartographics = chunk.map((cell) => {
      const [lng, lat] = centroidOfRing(cell.ring)
      return Cartographic.fromDegrees(lng, lat)
    })

    try {
      const sampled = await sampleTerrainMostDetailed(provider, cartographics)
      sampled.forEach((item, index) => {
        const height = Number(item.height)
        chunk[index].terrainHeight = Number.isFinite(height) ? height : 0
      })
    } catch (error) {
      console.warn('NDVI 3D: falha na amostragem de relevo para parte das celulas.', error)
      return
    }
  }
}

function computeVolumeHeight(cell: NdviCellRecord, options: NormalizedNdviLayerRenderOptions) {
  return ndviToHeight(cell.ndvi) * options.verticalScale * options.animationFactor
}

function removePrimitive(viewer: Viewer, runtime: NdviLayerRuntime) {
  if (!runtime.primitive || !isViewerUsable(viewer)) return
  try {
    viewer.scene.primitives.remove(runtime.primitive)
  } catch (_error) {
    // Ignore teardown race during mode switches.
  }
  runtime.primitive = null
}

function renderEntities(viewer: Viewer, runtime: NdviLayerRuntime) {
  runtime.cells.forEach((cell) => {
    const baseHeight = cell.terrainHeight
    const volumeHeight = computeVolumeHeight(cell, runtime.options)
    const extrudedHeight = baseHeight + volumeHeight
    const material = getNDVIColor(cell.ndvi, runtime.options.alpha)
    const existing = viewer.entities.getById(cell.id)

    if (existing?.polygon) {
      existing.polygon.hierarchy = new ConstantProperty(new PolygonHierarchy(toCesiumPositions(cell.ring)))
      existing.polygon.height = new ConstantProperty(baseHeight)
      existing.polygon.extrudedHeight = new ConstantProperty(extrudedHeight)
      existing.polygon.perPositionHeight = new ConstantProperty(false)
      existing.polygon.arcType = new ConstantProperty(ArcType.GEODESIC)
      existing.polygon.material = new ColorMaterialProperty(material)
      // Polygon outlines interfere with terrain draping in Cesium and generate noisy warnings.
      existing.polygon.outline = new ConstantProperty(false)
      existing.polygon.outlineColor = undefined
      return
    }

    viewer.entities.add({
      id: cell.id,
      polygon: {
        hierarchy: new ConstantProperty(new PolygonHierarchy(toCesiumPositions(cell.ring))),
        height: new ConstantProperty(baseHeight),
        extrudedHeight: new ConstantProperty(extrudedHeight),
        perPositionHeight: new ConstantProperty(false),
        arcType: new ConstantProperty(ArcType.GEODESIC),
        material: new ColorMaterialProperty(material),
        outline: new ConstantProperty(false),
      },
      properties: {
        layerId: runtime.layerId,
        ndvi_mean: cell.ndvi,
        ndvi_class: cell.classLabel,
        terrain_height: baseHeight,
        volume_height: volumeHeight,
        area: cell.area,
        date: cell.date,
      },
    })
  })
}

function renderPrimitive(viewer: Viewer, runtime: NdviLayerRuntime) {
  removePrimitive(viewer, runtime)
  const instances = runtime.cells.map((cell) => {
    const baseHeight = cell.terrainHeight
    const volumeHeight = computeVolumeHeight(cell, runtime.options)
    return new GeometryInstance({
      id: {
        layerId: runtime.layerId,
        ndvi_mean: cell.ndvi,
        ndvi_class: cell.classLabel,
        terrain_height: baseHeight,
        volume_height: volumeHeight,
        area: cell.area,
        date: cell.date,
      },
      geometry: new PolygonGeometry({
        polygonHierarchy: new PolygonHierarchy(toCesiumPositions(cell.ring)),
        height: baseHeight,
        extrudedHeight: baseHeight + volumeHeight,
        arcType: ArcType.GEODESIC,
        perPositionHeight: false,
        vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      attributes: {
        color: ColorGeometryInstanceAttribute.fromColor(getNDVIColor(cell.ndvi, runtime.options.alpha)),
      },
    })
  })

  if (!instances.length) return
  const primitive = new Primitive({
    geometryInstances: instances,
    appearance: new PerInstanceColorAppearance({
      closed: true,
      translucent: runtime.options.alpha < 1,
    }),
    asynchronous: true,
    releaseGeometryInstances: false,
    allowPicking: true,
    compressVertices: true,
  })
  viewer.scene.primitives.add(primitive)
  runtime.primitive = primitive
}

function renderRuntime(viewer: Viewer, runtime: NdviLayerRuntime) {
  if (!isViewerUsable(viewer)) return
  if (runtime.mode === 'primitive') {
    runtime.cells.forEach((cell) => {
      const entity = viewer.entities.getById(cell.id)
      if (!entity) return
      try {
        viewer.entities.remove(entity)
      } catch (_error) {
        // Ignore teardown race during mode switches.
      }
    })
    renderPrimitive(viewer, runtime)
    return
  }

  removePrimitive(viewer, runtime)
  renderEntities(viewer, runtime)
}

export async function fetchNdvi3dData(
  apiBaseUrl: string,
  options?: {
    bbox?: [number, number, number, number]
    polygon?: unknown
    satellite?: string
    dateFrom?: string
    dateTo?: string
    cloudPct?: number
    scale?: number
    maxFeatures?: number
    simplifyMeters?: number
  },
) {
  const response = await fetch(`${apiBaseUrl}/analysis/ndvi_3d`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      polygon: options?.polygon ?? null,
      bbox: options?.bbox ?? null,
      dateFrom: options?.dateFrom ?? null,
      dateTo: options?.dateTo ?? null,
      satellite: options?.satellite ?? 'SENTINEL_2A',
      cloudPct: Number.isFinite(Number(options?.cloudPct)) ? Number(options?.cloudPct) : 40,
      scale: Number.isFinite(Number(options?.scale)) ? Number(options?.scale) : 30,
      maxFeatures: Number.isFinite(Number(options?.maxFeatures)) ? Number(options?.maxFeatures) : 2200,
      simplifyMeters: Number.isFinite(Number(options?.simplifyMeters))
        ? Number(options?.simplifyMeters)
        : 20,
    }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Falha ao consultar NDVI 3D: ${response.status} ${text}`)
  }
  return (await response.json()) as NdviFeatureCollection
}

export function clearNdviExtrusionLayer(viewer: Viewer, layerId = 'ndvi-3d') {
  if (!isViewerUsable(viewer)) return
  const runtimeMap = getRuntimeMap(viewer)
  const runtime = runtimeMap.get(layerId)
  if (runtime) {
    removePrimitive(viewer, runtime)
    runtimeMap.delete(layerId)
  }
  const entitiesToRemove = viewer.entities.values.filter(
    (entity) => entity.properties?.layerId?.getValue() === layerId,
  )
  entitiesToRemove.forEach((entity) => {
    try {
      viewer.entities.remove(entity)
    } catch (_error) {
      // Ignore teardown race during mode switch.
    }
  })
}

export function applyNdviExtrusionLayer(
  viewer: Viewer,
  data: NdviFeatureCollection,
  options?: NdviLayerRenderOptions,
  layerId = 'ndvi-3d',
) {
  if (!isViewerUsable(viewer)) return
  const normalizedOptions = normalizeOptions(options)
  const cells = createCells(data, layerId)
  const runtime: NdviLayerRuntime = {
    layerId,
    mode: cells.length > normalizedOptions.primitiveThreshold ? 'primitive' : 'entities',
    cells,
    options: normalizedOptions,
    primitive: null,
  }

  clearNdviExtrusionLayer(viewer, layerId)
  const runtimeMap = getRuntimeMap(viewer)
  runtimeMap.set(layerId, runtime)

  return sampleCellsTerrainHeight(viewer, runtime.cells).then(() => {
    if (!isViewerUsable(viewer)) return
    renderRuntime(viewer, runtime)
  })
}

export function updateNdviExtrusionLayerStyle(
  viewer: Viewer,
  options: NdviLayerRenderOptions,
  layerId = 'ndvi-3d',
) {
  if (!isViewerUsable(viewer)) return
  const runtimeMap = getRuntimeMap(viewer)
  const runtime = runtimeMap.get(layerId)
  if (!runtime) return
  runtime.options = normalizeOptions({
    ...runtime.options,
    ...options,
    primitiveThreshold: runtime.options.primitiveThreshold,
  })
  renderRuntime(viewer, runtime)
}

function asPickRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function parsePickInfo(record: Record<string, unknown>): NdviCellPickInfo | null {
  const layerIdValue = readPropertyValue(record.layerId)
  if (layerIdValue === undefined || layerIdValue === null) return null

  const ndvi = Number(readPropertyValue(record.ndvi_mean))
  const terrainHeight = Number(readPropertyValue(record.terrain_height))
  const volumeHeight = Number(readPropertyValue(record.volume_height))
  const classLabel = String(readPropertyValue(record.ndvi_class) ?? classifyNdvi(ndvi)) as NdviClassLabel
  const areaValue = readPropertyValue(record.area)
  const dateValue = readPropertyValue(record.date)

  return {
    ndvi: Number.isFinite(ndvi) ? ndvi : 0,
    terrainHeight: Number.isFinite(terrainHeight) ? terrainHeight : 0,
    volumeHeight: Number.isFinite(volumeHeight) ? volumeHeight : 0,
    classLabel,
    area: Number.isFinite(Number(areaValue)) ? Number(areaValue) : null,
    date: typeof dateValue === 'string' ? dateValue : null,
  }
}

export function extractNdviPickInfo(picked: unknown, layerId = 'ndvi-3d'): NdviCellPickInfo | null {
  const pickedRecord = asPickRecord(picked)
  if (!pickedRecord) return null
  const idRecord = asPickRecord(pickedRecord.id)
  if (!idRecord) return null

  // Primitive path: metadata is stored directly in pick.id
  if (idRecord.layerId === layerId) {
    return parsePickInfo(idRecord)
  }

  // Entity path: metadata is stored in pick.id.properties
  const propertiesRecord = asPickRecord(idRecord.properties)
  if (!propertiesRecord) return null

  const layerFromEntity = readPropertyValue(propertiesRecord.layerId)
  if (layerFromEntity !== layerId) return null
  return parsePickInfo(propertiesRecord)
}
