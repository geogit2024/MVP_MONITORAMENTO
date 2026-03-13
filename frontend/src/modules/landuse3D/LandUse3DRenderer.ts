import {
  ArcType,
  Cartographic,
  Color,
  ColorGeometryInstanceAttribute,
  ColorMaterialProperty,
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
import { getLandUseColor, getLandUseHeight } from './LandUseColorRamp'

interface LandUseFeatureGeometry {
  type: 'Polygon' | 'MultiPolygon'
  coordinates: number[][][] | number[][][][]
}

interface LandUseFeatureProperties {
  class_id?: number
  class_name?: string
  area_ha?: number
  area_pct_aoi?: number
  color?: string
  height_m?: number
}

interface LandUseFeature {
  type: 'Feature'
  geometry: LandUseFeatureGeometry
  properties: LandUseFeatureProperties
}

interface LandUse3DMetadata {
  classification_id?: string
  aoi_area_ha?: number
  features_count?: number
  truncated?: boolean
}

export interface LandUseFeatureCollection3D {
  type: 'FeatureCollection'
  features: LandUseFeature[]
  metadata?: LandUse3DMetadata
}

export interface LandUse3DRenderOptions {
  alpha?: number
  heightScale?: number
  primitiveThreshold?: number
}

interface LandUse3DRenderOptionsNormalized {
  alpha: number
  heightScale: number
  primitiveThreshold: number
}

interface LandUseCellRecord {
  id: string
  ring: number[][]
  classId: number
  className: string
  areaHa: number | null
  areaPctAoi: number | null
  thematicHeightM: number
  terrainHeightM: number
}

interface LandUseRuntime {
  layerId: string
  mode: 'entities' | 'primitive'
  options: LandUse3DRenderOptionsNormalized
  cells: LandUseCellRecord[]
  primitive: Primitive | null
}

export interface LandUse3DPickInfo {
  classId: number
  className: string
  areaHa: number | null
  areaPctAoi: number | null
  thematicHeightM: number
  terrainHeightM: number
}

const runtimeByViewer = new WeakMap<Viewer, Map<string, LandUseRuntime>>()
const TERRAIN_SAMPLE_CHUNK_SIZE = 240
const DEFAULT_PRIMITIVE_THRESHOLD = 2000

const isViewerUsable = (viewer: Viewer | null | undefined): viewer is Viewer => {
  if (!viewer) return false
  return typeof viewer.isDestroyed === 'function' ? !viewer.isDestroyed() : true
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const normalizeRenderOptions = (
  options?: LandUse3DRenderOptions,
): LandUse3DRenderOptionsNormalized => ({
  alpha: clamp(Number(options?.alpha ?? 0.76), 0.12, 1),
  heightScale: clamp(Number(options?.heightScale ?? 1), 0.2, 8),
  primitiveThreshold: Math.max(
    1,
    Math.round(Number(options?.primitiveThreshold ?? DEFAULT_PRIMITIVE_THRESHOLD)),
  ),
})

const readPropertyValue = (value: unknown) => {
  if (
    value &&
    typeof value === 'object' &&
    'getValue' in value &&
    typeof (value as { getValue?: unknown }).getValue === 'function'
  ) {
    const property = value as { getValue: (time?: JulianDate) => unknown }
    return property.getValue(JulianDate.now())
  }
  return value
}

const getRuntimeMap = (viewer: Viewer) => {
  const existing = runtimeByViewer.get(viewer)
  if (existing) return existing
  const created = new Map<string, LandUseRuntime>()
  runtimeByViewer.set(viewer, created)
  return created
}

const toCesiumPositions = (ring: number[][], height = 0) =>
  ring.map(([lng, lat]) => Cartesian3.fromDegrees(lng, lat, height))

const normalizePolygons = (geometry: LandUseFeatureGeometry): number[][][][] => {
  if (geometry.type === 'Polygon') return [geometry.coordinates as number[][][]]
  return geometry.coordinates as number[][][][]
}

const centroidOfRing = (ring: number[][]): [number, number] => {
  if (!ring.length) return [0, 0]
  let lngSum = 0
  let latSum = 0
  let valid = 0
  ring.forEach((entry) => {
    if (!Array.isArray(entry) || entry.length < 2) return
    const lng = Number(entry[0])
    const lat = Number(entry[1])
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return
    lngSum += lng
    latSum += lat
    valid += 1
  })
  if (!valid) return [Number(ring[0]?.[0]) || 0, Number(ring[0]?.[1]) || 0]
  return [lngSum / valid, latSum / valid]
}

const createCells = (data: LandUseFeatureCollection3D, layerId: string) => {
  const cells: LandUseCellRecord[] = []
  data.features.forEach((feature, featureIndex) => {
    const classId = Number(feature.properties?.class_id ?? 0)
    const className = String(feature.properties?.class_name ?? `Classe ${classId || 'N/A'}`)
    const areaHaValue = feature.properties?.area_ha
    const areaPctValue = feature.properties?.area_pct_aoi
    const thematicHeight = Number(feature.properties?.height_m)
    const polygons = normalizePolygons(feature.geometry)

    polygons.forEach((polygon, polygonIndex) => {
      const ring = polygon[0]
      if (!ring || ring.length < 3) return

      cells.push({
        id: `${layerId}-${featureIndex}-${polygonIndex}`,
        ring,
        classId,
        className,
        areaHa: Number.isFinite(Number(areaHaValue)) ? Number(areaHaValue) : null,
        areaPctAoi: Number.isFinite(Number(areaPctValue)) ? Number(areaPctValue) : null,
        thematicHeightM: Number.isFinite(thematicHeight)
          ? thematicHeight
          : getLandUseHeight(classId, className),
        terrainHeightM: 0,
      })
    })
  })
  return cells
}

const sampleTerrainForCells = async (viewer: Viewer, cells: LandUseCellRecord[]) => {
  if (!cells.length || !viewer.terrainProvider) return
  for (let offset = 0; offset < cells.length; offset += TERRAIN_SAMPLE_CHUNK_SIZE) {
    const chunk = cells.slice(offset, offset + TERRAIN_SAMPLE_CHUNK_SIZE)
    const points = chunk.map((cell) => {
      const [lng, lat] = centroidOfRing(cell.ring)
      return Cartographic.fromDegrees(lng, lat)
    })
    try {
      const sampled = await sampleTerrainMostDetailed(viewer.terrainProvider, points)
      sampled.forEach((sample, index) => {
        const h = Number(sample.height)
        chunk[index].terrainHeightM = Number.isFinite(h) ? h : 0
      })
    } catch (error) {
      console.warn('LULC 3D: falha ao amostrar relevo para parte das feicoes.', error)
      return
    }
  }
}

const removeRuntimePrimitive = (viewer: Viewer, runtime: LandUseRuntime) => {
  if (!runtime.primitive || !isViewerUsable(viewer)) return
  try {
    viewer.scene.primitives.remove(runtime.primitive)
  } catch (_error) {
    // Ignore cleanup race.
  }
  runtime.primitive = null
}

const renderEntities = (viewer: Viewer, runtime: LandUseRuntime) => {
  runtime.cells.forEach((cell) => {
    const extrusion = cell.thematicHeightM * runtime.options.heightScale
    const baseHeight = cell.terrainHeightM
    const topHeight = baseHeight + extrusion
    const color = getLandUseColor(cell.classId, cell.className, runtime.options.alpha)
    const existing = viewer.entities.getById(cell.id)

    if (existing?.polygon) {
      existing.polygon.hierarchy = new ConstantProperty(new PolygonHierarchy(toCesiumPositions(cell.ring)))
      existing.polygon.height = new ConstantProperty(baseHeight)
      existing.polygon.extrudedHeight = new ConstantProperty(topHeight)
      existing.polygon.perPositionHeight = new ConstantProperty(false)
      existing.polygon.arcType = new ConstantProperty(ArcType.GEODESIC)
      existing.polygon.material = new ColorMaterialProperty(color)
      existing.polygon.outline = new ConstantProperty(false)
    } else {
      viewer.entities.add({
        id: cell.id,
        polygon: {
          hierarchy: new ConstantProperty(new PolygonHierarchy(toCesiumPositions(cell.ring))),
          height: new ConstantProperty(baseHeight),
          extrudedHeight: new ConstantProperty(topHeight),
          perPositionHeight: new ConstantProperty(false),
          arcType: new ConstantProperty(ArcType.GEODESIC),
          material: new ColorMaterialProperty(color),
          outline: new ConstantProperty(false),
        },
        properties: {
          layerId: runtime.layerId,
          class_id: cell.classId,
          class_name: cell.className,
          area_ha: cell.areaHa,
          area_pct_aoi: cell.areaPctAoi,
          thematic_height_m: extrusion,
          terrain_height_m: baseHeight,
        },
      })
    }
  })
}

const renderPrimitive = (viewer: Viewer, runtime: LandUseRuntime) => {
  removeRuntimePrimitive(viewer, runtime)
  const instances = runtime.cells.map((cell) => {
    const extrusion = cell.thematicHeightM * runtime.options.heightScale
    const baseHeight = cell.terrainHeightM
    const topHeight = baseHeight + extrusion
    return new GeometryInstance({
      id: {
        layerId: runtime.layerId,
        class_id: cell.classId,
        class_name: cell.className,
        area_ha: cell.areaHa,
        area_pct_aoi: cell.areaPctAoi,
        thematic_height_m: extrusion,
        terrain_height_m: baseHeight,
      },
      geometry: new PolygonGeometry({
        polygonHierarchy: new PolygonHierarchy(toCesiumPositions(cell.ring)),
        height: baseHeight,
        extrudedHeight: topHeight,
        arcType: ArcType.GEODESIC,
        perPositionHeight: false,
        vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      attributes: {
        color: ColorGeometryInstanceAttribute.fromColor(
          getLandUseColor(cell.classId, cell.className, runtime.options.alpha),
        ),
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
    allowPicking: true,
    compressVertices: true,
    releaseGeometryInstances: false,
  })
  viewer.scene.primitives.add(primitive)
  runtime.primitive = primitive
}

const renderRuntime = (viewer: Viewer, runtime: LandUseRuntime) => {
  if (!isViewerUsable(viewer)) return
  if (runtime.mode === 'primitive') {
    runtime.cells.forEach((cell) => {
      const entity = viewer.entities.getById(cell.id)
      if (!entity) return
      try {
        viewer.entities.remove(entity)
      } catch (_error) {
        // Ignore cleanup race.
      }
    })
    renderPrimitive(viewer, runtime)
    return
  }

  removeRuntimePrimitive(viewer, runtime)
  renderEntities(viewer, runtime)
}

export async function fetchLandUse3DData(
  apiBaseUrl: string,
  classificationId: string,
  options?: { scale?: number; simplifyMeters?: number; maxFeatures?: number },
) {
  const query = new URLSearchParams()
  query.set('classification_id', classificationId)
  if (Number.isFinite(Number(options?.scale))) query.set('scale', String(options?.scale))
  if (Number.isFinite(Number(options?.simplifyMeters)))
    query.set('simplify_meters', String(options?.simplifyMeters))
  if (Number.isFinite(Number(options?.maxFeatures)))
    query.set('max_features', String(options?.maxFeatures))

  const response = await fetch(`${apiBaseUrl}/analysis/landcover/volumetric?${query.toString()}`)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Falha ao consultar volumetria LULC 3D: ${response.status} ${text}`)
  }
  return (await response.json()) as LandUseFeatureCollection3D
}

export function clearLandUse3DLayer(viewer: Viewer, layerId = 'landuse-3d') {
  if (!isViewerUsable(viewer)) return
  const runtimeMap = getRuntimeMap(viewer)
  const runtime = runtimeMap.get(layerId)
  if (runtime) {
    removeRuntimePrimitive(viewer, runtime)
    runtimeMap.delete(layerId)
  }

  const targets = viewer.entities.values.filter(
    (entity) => entity.properties?.layerId?.getValue() === layerId,
  )
  targets.forEach((entity) => {
    try {
      viewer.entities.remove(entity)
    } catch (_error) {
      // Ignore cleanup race.
    }
  })
}

export async function renderLandUse3D(
  viewer: Viewer,
  data: LandUseFeatureCollection3D,
  options?: LandUse3DRenderOptions,
  layerId = 'landuse-3d',
) {
  if (!isViewerUsable(viewer)) return
  const normalized = normalizeRenderOptions(options)
  const runtime: LandUseRuntime = {
    layerId,
    mode: data.features.length > normalized.primitiveThreshold ? 'primitive' : 'entities',
    options: normalized,
    cells: createCells(data, layerId),
    primitive: null,
  }

  clearLandUse3DLayer(viewer, layerId)
  getRuntimeMap(viewer).set(layerId, runtime)
  await sampleTerrainForCells(viewer, runtime.cells)
  if (!isViewerUsable(viewer)) return
  renderRuntime(viewer, runtime)
}

export function updateLandUse3DStyle(
  viewer: Viewer,
  options: LandUse3DRenderOptions,
  layerId = 'landuse-3d',
) {
  if (!isViewerUsable(viewer)) return
  const runtime = getRuntimeMap(viewer).get(layerId)
  if (!runtime) return
  runtime.options = normalizeRenderOptions({
    ...runtime.options,
    ...options,
    primitiveThreshold: runtime.options.primitiveThreshold,
  })
  renderRuntime(viewer, runtime)
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null

const parsePickInfo = (record: Record<string, unknown>): LandUse3DPickInfo => {
  const classId = Number(readPropertyValue(record.class_id))
  const className = String(readPropertyValue(record.class_name) ?? `Classe ${classId || 'N/A'}`)
  const areaHaValue = Number(readPropertyValue(record.area_ha))
  const areaPctValue = Number(readPropertyValue(record.area_pct_aoi))
  const heightValue = Number(readPropertyValue(record.thematic_height_m))
  const terrainValue = Number(readPropertyValue(record.terrain_height_m))

  return {
    classId: Number.isFinite(classId) ? classId : 0,
    className,
    areaHa: Number.isFinite(areaHaValue) ? areaHaValue : null,
    areaPctAoi: Number.isFinite(areaPctValue) ? areaPctValue : null,
    thematicHeightM: Number.isFinite(heightValue) ? heightValue : 0,
    terrainHeightM: Number.isFinite(terrainValue) ? terrainValue : 0,
  }
}

export function extractLandUse3DPickInfo(picked: unknown, layerId = 'landuse-3d') {
  const pickedRecord = asRecord(picked)
  if (!pickedRecord) return null
  const idRecord = asRecord(pickedRecord.id)
  if (!idRecord) return null

  if (idRecord.layerId === layerId) return parsePickInfo(idRecord)

  const propertiesRecord = asRecord(idRecord.properties)
  if (!propertiesRecord) return null
  const entityLayerId = readPropertyValue(propertiesRecord.layerId)
  if (entityLayerId !== layerId) return null
  return parsePickInfo(propertiesRecord)
}
