import { ImageryLayer, UrlTemplateImageryProvider, Viewer, createWorldTerrainAsync } from 'cesium'

const demOverlayByViewer = new WeakMap<Viewer, ImageryLayer>()

export async function applyTerrainLayer(viewer: Viewer, exaggeration = 1) {
  const terrainProvider = await createWorldTerrainAsync()
  viewer.terrainProvider = terrainProvider
  viewer.scene.verticalExaggeration = exaggeration
}

export function setTerrainExaggeration(viewer: Viewer, exaggeration: number) {
  viewer.scene.verticalExaggeration = exaggeration
}

export async function fetchDemTile(apiBaseUrl: string, bbox?: [number, number, number, number]) {
  const query = new URLSearchParams()
  if (bbox) query.set('bbox', bbox.join(','))
  const url = `${apiBaseUrl}/analysis/dem${query.toString() ? `?${query.toString()}` : ''}`

  const response = await fetch(url)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Falha ao consultar DEM: ${response.status} ${text}`)
  }

  const data = (await response.json()) as { tileUrl?: string }
  if (!data.tileUrl) throw new Error('Resposta do DEM sem tileUrl')
  return data.tileUrl
}

export function clearDemOverlay(viewer: Viewer) {
  const existing = demOverlayByViewer.get(viewer)
  if (!existing) return
  viewer.imageryLayers.remove(existing, true)
  demOverlayByViewer.delete(viewer)
}

export function applyDemOverlay(viewer: Viewer, tileUrl: string, alpha = 0.35) {
  clearDemOverlay(viewer)
  const layer = viewer.imageryLayers.addImageryProvider(
    new UrlTemplateImageryProvider({ url: tileUrl }),
  )
  layer.alpha = alpha
  demOverlayByViewer.set(viewer, layer)
}
