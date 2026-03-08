import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import type { SwipeRevealSide } from './types';
import { swipeDebug } from './swipeDebug';

type SwipeLayerElementClipControllerProps = {
  enabled: boolean;
  dividerPercent: number;
  revealSide: SwipeRevealSide;
  paneName: string;
};

const clearPaneClip = (pane: HTMLElement | null) => {
  if (!pane) return;
  pane.style.clip = 'auto';
  pane.style.clipPath = '';
  (pane.style as CSSStyleDeclaration & { webkitClipPath?: string }).webkitClipPath = '';
};

const applyPaneClip = (
  pane: HTMLElement,
  mapWidth: number,
  mapHeight: number,
  dividerPercent: number,
  revealSide: SwipeRevealSide
) => {
  const clampedPercent = Math.max(0, Math.min(100, dividerPercent));
  const dividerPx = Math.round((clampedPercent / 100) * mapWidth);
  const clipLeft = revealSide === 'left' ? 0 : dividerPx;
  const clipRight = revealSide === 'left' ? dividerPx : mapWidth;
  const clipRect = `rect(0px, ${clipRight}px, ${mapHeight}px, ${clipLeft}px)`;
  const clipInset = `inset(0px ${Math.max(0, mapWidth - clipRight)}px 0px ${Math.max(0, clipLeft)}px)`;

  pane.style.position = 'absolute';
  pane.style.top = '0';
  pane.style.left = '0';
  pane.style.width = `${mapWidth}px`;
  pane.style.height = `${mapHeight}px`;
  pane.style.overflow = 'hidden';
  pane.style.setProperty('pointer-events', 'none', 'important');
  pane.style.clip = clipRect;
  pane.style.clipPath = clipInset;
  (pane.style as CSSStyleDeclaration & { webkitClipPath?: string }).webkitClipPath = clipInset;

  return { clampedPercent, dividerPx, clipRect, clipInset };
};

export default function SwipeLayerElementClipController({
  enabled,
  dividerPercent,
  revealSide,
  paneName,
}: SwipeLayerElementClipControllerProps) {
  const map = useMap();

  useEffect(() => {
    let lastLogAt = 0;

    const apply = (source: string) => {
      const pane = map.getPane(paneName);
      if (!pane) return;

      if (!enabled) {
        clearPaneClip(pane);
        swipeDebug('SwipeLayerElementClipController', 'clip:disabled', { source, paneName });
        return;
      }

      const size = map.getSize();
      const { clampedPercent, dividerPx, clipRect, clipInset } = applyPaneClip(
        pane,
        size.x,
        size.y,
        dividerPercent,
        revealSide
      );

      const now = Date.now();
      if (now - lastLogAt > 120) {
        lastLogAt = now;
        const paneRect = pane.getBoundingClientRect();
        swipeDebug('SwipeLayerElementClipController', 'clip:apply', {
          source,
          paneName,
          dividerPercent: clampedPercent,
          dividerPx,
          revealSide,
          clipRect,
          clipInset,
          paneRect: { width: paneRect.width, height: paneRect.height },
          paneChildren: pane.childElementCount,
          paneClassName: pane.className,
        });
      }
    };

    const onMapChange = () => apply('map:event');
    map.on('move', onMapChange);
    map.on('zoom', onMapChange);
    map.on('resize', onMapChange);
    map.on('layeradd', onMapChange);
    map.on('layerremove', onMapChange);

    apply('state:update');

    return () => {
      map.off('move', onMapChange);
      map.off('zoom', onMapChange);
      map.off('resize', onMapChange);
      map.off('layeradd', onMapChange);
      map.off('layerremove', onMapChange);
      clearPaneClip(map.getPane(paneName));
    };
  }, [dividerPercent, enabled, map, paneName, revealSide]);

  return null;
}
