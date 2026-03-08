import {
  ArcType,
  Color,
  ConstantProperty,
  HeightReference,
  PolygonHierarchy,
  Viewer,
  Cartesian3,
} from 'cesium'

interface NdviFeatureProperties {
  ndvi_mean: number
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

function colorFromNdvi(ndvi: number) {
  if (ndvi < 0.3) return Color.fromCssColorString('#d73027').withAlpha(0.65)
  if (ndvi < 0.6) return Color.fromCssColorString('#fee08b').withAlpha(0.65)
  return Color.fromCssColorString('#1a9850').withAlpha(0.65)
}

function toCesiumPositions(polygon: number[][]) {
  return polygon.map(([lng, lat]) => Cartesian3.fromDegrees(lng, lat))
}

function normalizePolygons(geometry: NdviFeature['geometry']): number[][][] {
  if (geometry.type === 'Polygon') {
    return [geometry.coordinates as number[][][]]
  }
  return geometry.coordinates as number[][][][]
}

export async function fetchNdvi3dData(apiBaseUrl: string, bbox?: [number, number, number, number]) {
  const query = new URLSearchParams()
  if (bbox) query.set('bbox', bbox.join(','))

  const url = `${apiBaseUrl}/analysis/ndvi_3d${query.toString() ? `?${query.toString()}` : ''}`
  const response = await fetch(url)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Falha ao consultar NDVI 3D: ${response.status} ${text}`)
  }
  return (await response.json()) as NdviFeatureCollection
}

export function clearNdviExtrusionLayer(viewer: Viewer, layerId = 'ndvi-3d') {
  const entitiesToRemove = viewer.entities.values.filter(
    (entity) => entity.properties?.layerId?.getValue() === layerId,
  )
  entitiesToRemove.forEach((entity) => viewer.entities.remove(entity))
}

export function applyNdviExtrusionLayer(
  viewer: Viewer,
  data: NdviFeatureCollection,
  layerId = 'ndvi-3d',
) {
  clearNdviExtrusionLayer(viewer, layerId)

  data.features.forEach((feature, index) => {
    const ndvi = Number(feature.properties?.ndvi_mean ?? 0)
    const height = Math.max(0, ndvi * 500)
    const polygons = normalizePolygons(feature.geometry)

    polygons.forEach((polygon, polygonIndex) => {
      const ring = polygon[0]
      if (!ring || ring.length < 3) return

      viewer.entities.add({
        id: `${layerId}-${index}-${polygonIndex}`,
        polygon: {
          hierarchy: new PolygonHierarchy(toCesiumPositions(ring)),
          heightReference: new ConstantProperty(HeightReference.CLAMP_TO_GROUND),
          extrudedHeight: height,
          extrudedHeightReference: new ConstantProperty(HeightReference.RELATIVE_TO_GROUND),
          perPositionHeight: false,
          arcType: new ConstantProperty(ArcType.GEODESIC),
          material: colorFromNdvi(ndvi),
          outline: true,
          outlineColor: Color.fromCssColorString('#0b1320').withAlpha(0.35),
        },
        properties: {
          layerId,
          ndvi_mean: ndvi,
          area: feature.properties?.area ?? null,
          date: feature.properties?.date ?? null,
        },
      })
    })
  })
}
