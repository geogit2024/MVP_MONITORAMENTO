import { ImageryLayer, UrlTemplateImageryProvider, Viewer, createWorldTerrainAsync } from 'cesium'

interface DemOverlayRuntime {
  layer: ImageryLayer
  detachErrorListener?: () => void
}

const demOverlayByViewer = new WeakMap<Viewer, DemOverlayRuntime>()

const isViewerUsable = (viewer: Viewer | null | undefined): viewer is Viewer => {
  if (!viewer) return false
  return typeof viewer.isDestroyed === 'function' ? !viewer.isDestroyed() : true
}

export async function applyTerrainLayer(viewer: Viewer, exaggeration = 1) {
  if (!isViewerUsable(viewer)) return
  const terrainProvider = await createWorldTerrainAsync()
  if (!isViewerUsable(viewer)) return
  viewer.terrainProvider = terrainProvider
  viewer.scene.verticalExaggeration = exaggeration
}

export function setTerrainExaggeration(viewer: Viewer, exaggeration: number) {
  if (!isViewerUsable(viewer)) return
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
  if (!isViewerUsable(viewer)) {
    demOverlayByViewer.delete(viewer)
    return
  }
  const runtime = demOverlayByViewer.get(viewer)
  if (runtime?.detachErrorListener) {
    runtime.detachErrorListener()
  }
  const existing = runtime?.layer
  if (!existing) return
  try {
    viewer.imageryLayers.remove(existing, true)
  } catch (_error) {
    // Ignore teardown race when switching 3D -> 2D and Cesium already disposed internals.
  }
  demOverlayByViewer.delete(viewer)
}

export function applyDemOverlay(
  viewer: Viewer,
  tileUrl: string,
  alpha = 0.35,
  onFatalError?: (message: string) => void,
) {
  if (!isViewerUsable(viewer)) return
  clearDemOverlay(viewer)
  const provider = new UrlTemplateImageryProvider({ url: tileUrl })
  let providerErrorCount = 0
  const removeErrorListener = provider.errorEvent.addEventListener((tileError) => {
    providerErrorCount += 1
    const message =
      typeof tileError?.message === 'string' && tileError.message.length
        ? tileError.message
        : 'falha de tile sem mensagem'
    if (providerErrorCount <= 2) {
      tileError.retry = true
      return
    }
    console.warn('DEM 3D: falha persistente ao carregar tiles.', {
      attempts: providerErrorCount,
      message,
      tileUrl: tileUrl.length > 220 ? `${tileUrl.slice(0, 220)}...<len:${tileUrl.length}>` : tileUrl,
    })
    clearDemOverlay(viewer)
    onFatalError?.('Nao foi possivel exibir o relevo analitico para esta area.')
  })
  const layer = viewer.imageryLayers.addImageryProvider(
    provider,
  )
  layer.alpha = alpha
  demOverlayByViewer.set(viewer, { layer, detachErrorListener: removeErrorListener })
}
