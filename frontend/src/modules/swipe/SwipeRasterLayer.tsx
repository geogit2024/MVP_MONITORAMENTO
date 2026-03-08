import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
// @ts-expect-error - project currently has no @types/leaflet installed
import L from 'leaflet';
import type { SwipeLayerDescriptor } from './types';
import { swipeDebug, swipeDebugWarn } from './swipeDebug';

type SwipeRasterLayerProps = {
  descriptor: SwipeLayerDescriptor | null;
  onLayerReady?: (layer: L.Layer | null) => void;
  paneName?: string;
  paneZIndex?: number;
  forceOpaque?: boolean;
};

export default function SwipeRasterLayer({
  descriptor,
  onLayerReady,
  paneName,
  paneZIndex,
  forceOpaque = false,
}: SwipeRasterLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);
  const paneResizeHandlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!descriptor) {
      swipeDebug('SwipeRasterLayer', 'descriptor:null');
      if (layerRef.current && map.hasLayer(layerRef.current)) {
        map.removeLayer(layerRef.current);
      }
      layerRef.current = null;
      onLayerReady?.(null);
      return;
    }

    let isDisposed = false;
    let layer: L.Layer | null = null;

    const mountLayer = () => {
      if (isDisposed) return;
      const forceOpaqueForSwipePane = forceOpaque || Boolean(paneName && paneName.startsWith('swipe-'));

      if (paneName && !map.getPane(paneName)) {
        map.createPane(paneName);
        swipeDebug('SwipeRasterLayer', 'pane:created', { paneName });
      }
      if (paneName) {
        if (paneResizeHandlerRef.current) {
          map.off('resize', paneResizeHandlerRef.current);
          paneResizeHandlerRef.current = null;
        }
        const pane = map.getPane(paneName);
        if (pane) {
          const size = map.getSize();
          if (typeof paneZIndex === 'number') {
            pane.style.zIndex = String(paneZIndex);
          }
          pane.style.position = 'absolute';
          pane.style.top = '0';
          pane.style.left = '0';
          pane.style.width = `${size.x}px`;
          pane.style.height = `${size.y}px`;
          pane.style.setProperty('pointer-events', 'none', 'important');

          const handlePaneResize = () => {
            const nextSize = map.getSize();
            pane.style.width = `${nextSize.x}px`;
            pane.style.height = `${nextSize.y}px`;
          };
          paneResizeHandlerRef.current = handlePaneResize;
          map.on('resize', handlePaneResize);
        }
        swipeDebug('SwipeRasterLayer', 'pane:resolved', {
          paneName,
          paneExists: Boolean(pane),
          paneZIndex: pane?.style?.zIndex ?? null,
          paneWidth: pane?.style?.width ?? null,
          paneHeight: pane?.style?.height ?? null,
          paneChildren: pane?.childElementCount ?? null,
        });
      }

      if (layerRef.current && map.hasLayer(layerRef.current)) {
        map.removeLayer(layerRef.current);
      }

      if (descriptor.kind === 'tile') {
        const effectiveOpacity = forceOpaqueForSwipePane ? 1 : descriptor.opacity ?? 0.8;
        const tileOptions: L.TileLayerOptions = {
          zIndex: descriptor.zIndex,
          opacity: effectiveOpacity,
          attribution: descriptor.attribution,
          className: descriptor.className,
        };
        if (paneName) {
          tileOptions.pane = paneName;
        }
        layer = L.tileLayer(descriptor.url, tileOptions);
        swipeDebug('SwipeRasterLayer', 'layer:create:tile', {
          id: descriptor.id,
          url: descriptor.url,
          paneName: paneName ?? 'tilePane(default)',
          zIndex: descriptor.zIndex ?? null,
          opacity: effectiveOpacity,
        });
      } else {
        const effectiveOpacity = forceOpaqueForSwipePane ? 1 : descriptor.opacity ?? 0.82;
        const imageOptions: L.ImageOverlayOptions = {
          opacity: effectiveOpacity,
          className: descriptor.className,
        };
        if (paneName) {
          imageOptions.pane = paneName;
        }
        const imageLayer = L.imageOverlay(descriptor.url, descriptor.bounds, imageOptions);
        if (typeof descriptor.zIndex === 'number') {
          imageLayer.setZIndex(descriptor.zIndex);
        }
        layer = imageLayer;
        swipeDebug('SwipeRasterLayer', 'layer:create:image', {
          id: descriptor.id,
          url: descriptor.url,
          paneName: paneName ?? 'overlayPane(default)',
          zIndex: descriptor.zIndex ?? null,
          opacity: effectiveOpacity,
        });
      }

      if (!layer) return;
      layer.once('add', () => {
        const maybeGrid = layer as L.GridLayer;
        const container =
          typeof maybeGrid.getContainer === 'function'
            ? maybeGrid.getContainer()
            : (layer as L.ImageOverlay).getElement?.() ?? null;
        swipeDebug('SwipeRasterLayer', 'layer:add', {
          id: descriptor.id,
          paneName: paneName ?? null,
          containerExists: Boolean(container),
          containerTag: container?.tagName ?? null,
          containerParentClass: container?.parentElement?.className ?? null,
          containerOpacity: container?.style?.opacity ?? null,
          containerZIndex: container?.style?.zIndex ?? null,
          mapHasLayer: map.hasLayer(layer as L.Layer),
        });
      });

      if (descriptor.kind === 'tile') {
        const tileLayer = layer as L.TileLayer;
        tileLayer.once('load', () => {
          const container = tileLayer.getContainer();
          swipeDebug('SwipeRasterLayer', 'layer:tile:load', {
            id: descriptor.id,
            containerExists: Boolean(container),
            tileCount: container?.querySelectorAll('.leaflet-tile').length ?? null,
            paneName: paneName ?? null,
          });
        });
        tileLayer.on('tileerror', (event: any) => {
          swipeDebugWarn('SwipeRasterLayer', 'layer:tile:error', {
            id: descriptor.id,
            paneName: paneName ?? null,
            url: descriptor.url,
            tile: event?.tile?.src ?? null,
            coords: event?.coords ?? null,
            message: event?.error?.message ?? null,
          });
        });
      } else {
        const imageLayer = layer as L.ImageOverlay;
        imageLayer.once('error', () => {
          swipeDebugWarn('SwipeRasterLayer', 'layer:image:error', {
            id: descriptor.id,
            paneName: paneName ?? null,
            url: descriptor.url,
          });
        });
      }

      layer.addTo(map);
      layerRef.current = layer;
      onLayerReady?.(layer);
      swipeDebug('SwipeRasterLayer', 'layer:added-to-map', {
        id: descriptor.id,
        mapReady: true,
        paneName: paneName ?? null,
      });
    };

    map.whenReady(mountLayer);

    return () => {
      isDisposed = true;
      if (layerRef.current && map.hasLayer(layerRef.current)) {
        swipeDebug('SwipeRasterLayer', 'layer:cleanup:remove', { paneName: paneName ?? null });
        map.removeLayer(layerRef.current);
      } else {
        swipeDebugWarn('SwipeRasterLayer', 'layer:cleanup:not-found', { paneName: paneName ?? null });
      }
      layerRef.current = null;
      onLayerReady?.(null);
      if (paneName) {
        if (paneResizeHandlerRef.current) {
          map.off('resize', paneResizeHandlerRef.current);
          paneResizeHandlerRef.current = null;
        }
        const pane = map.getPane(paneName);
        pane?.style.removeProperty('pointer-events');
      }
    };
  }, [descriptor, forceOpaque, map, onLayerReady, paneName, paneZIndex]);

  return null;
}
