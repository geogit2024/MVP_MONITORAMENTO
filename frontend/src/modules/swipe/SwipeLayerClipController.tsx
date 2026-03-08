import { useCallback, useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import type { SwipeRevealSide } from './types';
import { swipeDebug } from './swipeDebug';

type SwipeLayerClipControllerProps = {
  enabled: boolean;
  dividerPercent: number;
  revealSide: SwipeRevealSide;
  paneName: string;
};

export default function SwipeLayerClipController({
  enabled,
  dividerPercent,
  revealSide,
  paneName,
}: SwipeLayerClipControllerProps) {
  const map = useMap();
  const paneRef = useRef<HTMLElement | null>(null);
  const enabledRef = useRef(enabled);
  const dividerPercentRef = useRef(dividerPercent);
  const revealSideRef = useRef<SwipeRevealSide>(revealSide);
  const lastApplyLogAtRef = useRef(0);
  const hasClipPathSupportRef = useRef(
    typeof CSS !== 'undefined' &&
      typeof CSS.supports === 'function' &&
      CSS.supports('clip-path', 'inset(0 0 0 0)')
  );

  const setClipPath = (pane: HTMLElement, value: string) => {
    pane.style.clipPath = value;
    (pane.style as CSSStyleDeclaration & { webkitClipPath?: string }).webkitClipPath = value;
  };

  const setClipRect = (pane: HTMLElement, mapWidth: number, mapHeight: number, dividerPx: number, side: SwipeRevealSide) => {
    const clampedX = Math.max(0, Math.min(mapWidth, dividerPx));
    const clipRect =
      side === 'left'
        ? `rect(0px, ${clampedX}px, ${mapHeight}px, 0px)`
        : `rect(0px, ${mapWidth}px, ${mapHeight}px, ${clampedX}px)`;
    pane.style.clip = clipRect;
    return clipRect;
  };

  const clearElementClip = (element: HTMLElement) => {
    element.style.clip = 'auto';
    element.style.clipPath = '';
    (element.style as CSSStyleDeclaration & { webkitClipPath?: string }).webkitClipPath = '';
    (
      element.style as CSSStyleDeclaration & {
        webkitMaskImage?: string;
        webkitMaskSize?: string;
        webkitMaskRepeat?: string;
        webkitMaskPosition?: string;
      }
    ).webkitMaskImage = '';
    (
      element.style as CSSStyleDeclaration & {
        webkitMaskImage?: string;
        webkitMaskSize?: string;
        webkitMaskRepeat?: string;
        webkitMaskPosition?: string;
      }
    ).webkitMaskSize = '';
    (
      element.style as CSSStyleDeclaration & {
        webkitMaskImage?: string;
        webkitMaskSize?: string;
        webkitMaskRepeat?: string;
        webkitMaskPosition?: string;
      }
    ).webkitMaskRepeat = '';
    (
      element.style as CSSStyleDeclaration & {
        webkitMaskImage?: string;
        webkitMaskSize?: string;
        webkitMaskRepeat?: string;
        webkitMaskPosition?: string;
      }
    ).webkitMaskPosition = '';
    element.style.maskImage = '';
    element.style.maskSize = '';
    element.style.maskRepeat = '';
    element.style.maskPosition = '';
  };

  const applyElementClip = (
    element: HTMLElement,
    mapWidth: number,
    mapHeight: number,
    dividerPx: number,
    side: SwipeRevealSide,
    insetClip: string
  ) => {
    const clipRect = setClipRect(element, mapWidth, mapHeight, dividerPx, side);
    setClipPath(element, insetClip);
    return clipRect;
  };

  const setPaneViewportSize = (pane: HTMLElement, mapWidth: number, mapHeight: number) => {
    pane.style.width = `${Math.max(0, mapWidth)}px`;
    pane.style.height = `${Math.max(0, mapHeight)}px`;
  };

  const applyMask = (element: HTMLElement, mapWidth: number, dividerPx: number, side: SwipeRevealSide) => {
    const clampedX = Math.max(0, Math.min(mapWidth, dividerPx));
    const gradient =
      side === 'left'
        ? `linear-gradient(to right, rgba(0,0,0,1) 0px, rgba(0,0,0,1) ${clampedX}px, rgba(0,0,0,0) ${clampedX}px, rgba(0,0,0,0) ${mapWidth}px)`
        : `linear-gradient(to right, rgba(0,0,0,0) 0px, rgba(0,0,0,0) ${clampedX}px, rgba(0,0,0,1) ${clampedX}px, rgba(0,0,0,1) ${mapWidth}px)`;

    element.style.maskImage = gradient;
    element.style.maskSize = `${mapWidth}px 100%`;
    element.style.maskRepeat = 'no-repeat';
    element.style.maskPosition = '0 0';
    (
      element.style as CSSStyleDeclaration & {
        webkitMaskImage?: string;
        webkitMaskSize?: string;
        webkitMaskRepeat?: string;
        webkitMaskPosition?: string;
      }
    ).webkitMaskImage = gradient;
    (
      element.style as CSSStyleDeclaration & {
        webkitMaskImage?: string;
        webkitMaskSize?: string;
        webkitMaskRepeat?: string;
        webkitMaskPosition?: string;
      }
    ).webkitMaskSize = `${mapWidth}px 100%`;
    (
      element.style as CSSStyleDeclaration & {
        webkitMaskImage?: string;
        webkitMaskSize?: string;
        webkitMaskRepeat?: string;
        webkitMaskPosition?: string;
      }
    ).webkitMaskRepeat = 'no-repeat';
    (
      element.style as CSSStyleDeclaration & {
        webkitMaskImage?: string;
        webkitMaskSize?: string;
        webkitMaskRepeat?: string;
        webkitMaskPosition?: string;
      }
    ).webkitMaskPosition = '0 0';
    return gradient;
  };

  const parseTranslate3d = (transform: string): { x: number; y: number } | null => {
    const match = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px,\s*[-\d.]+px\)/.exec(transform);
    if (match) {
      return { x: Number(match[1]), y: Number(match[2]) };
    }
    const fallbackMatch = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(transform);
    if (fallbackMatch) {
      return { x: Number(fallbackMatch[1]), y: Number(fallbackMatch[2]) };
    }
    return null;
  };

  const clearTileLevelClip = (pane: HTMLElement) => {
    const tiles = pane.querySelectorAll('.leaflet-tile');
    tiles.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      node.style.visibility = '';
      node.style.clipPath = '';
      (node.style as CSSStyleDeclaration & { webkitClipPath?: string }).webkitClipPath = '';
    });
    const overlays = pane.querySelectorAll('.leaflet-image-layer');
    overlays.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      node.style.visibility = '';
      node.style.clipPath = '';
      (node.style as CSSStyleDeclaration & { webkitClipPath?: string }).webkitClipPath = '';
    });
  };

  const applyTileLevelClip = (
    pane: HTMLElement,
    mapWidth: number,
    dividerPx: number,
    side: SwipeRevealSide
  ) => {
    const clipLeft = side === 'left' ? 0 : dividerPx;
    const clipRight = side === 'left' ? dividerPx : mapWidth;
    let clippedTiles = 0;

    const tiles = pane.querySelectorAll('.leaflet-tile');
    tiles.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      const transform = node.style.transform || '';
      const parsed = parseTranslate3d(transform);
      if (!parsed) return;

      const tileWidth = node.clientWidth || node.offsetWidth || 256;
      const tileLeft = parsed.x;
      const tileRight = parsed.x + tileWidth;
      const visibleLeft = Math.max(tileLeft, clipLeft);
      const visibleRight = Math.min(tileRight, clipRight);
      const visibleWidth = visibleRight - visibleLeft;

      if (visibleWidth <= 0) {
        node.style.visibility = 'hidden';
        node.style.clipPath = '';
        (node.style as CSSStyleDeclaration & { webkitClipPath?: string }).webkitClipPath = '';
        clippedTiles += 1;
        return;
      }

      node.style.visibility = 'visible';
      const insetLeft = Math.max(0, clipLeft - tileLeft);
      const insetRight = Math.max(0, tileRight - clipRight);
      const tileClip = `inset(0 ${insetRight}px 0 ${insetLeft}px)`;
      node.style.clipPath = tileClip;
      (node.style as CSSStyleDeclaration & { webkitClipPath?: string }).webkitClipPath = tileClip;
    });

    return {
      totalTiles: tiles.length,
      clippedTiles,
    };
  };

  const applyClip = useCallback(
    (source: string) => {
      const pane = paneRef.current;
      if (!pane) return;

      if (!enabledRef.current) {
        clearElementClip(pane);
        const paneChildren = Array.from(pane.children).filter(
          (child): child is HTMLElement => child instanceof HTMLElement
        );
        paneChildren.forEach(clearElementClip);
        clearTileLevelClip(pane);
        return;
      }

      const clampedPercent = Math.max(0, Math.min(100, dividerPercentRef.current));
      const size = map.getSize();
      const dividerPx = Math.round((clampedPercent / 100) * size.x);
      const currentRevealSide = revealSideRef.current;
      const clipInsetValue =
        currentRevealSide === 'left'
          ? `inset(0 ${100 - clampedPercent}% 0 0)`
          : `inset(0 0 0 ${clampedPercent}%)`;

      // Leaflet panes can end up with 0x0 when width/height use percentages.
      setPaneViewportSize(pane, size.x, size.y);

      // Apply to pane and layer containers to avoid browser-specific pane clipping issues.
      const paneChildren = Array.from(pane.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement
      );
      const paneClipRect = applyElementClip(
        pane,
        size.x,
        size.y,
        dividerPx,
        currentRevealSide,
        clipInsetValue
      );
      const paneMask = applyMask(pane, size.x, dividerPx, currentRevealSide);
      const tileContainers = pane.querySelectorAll('.leaflet-tile-container');
      tileContainers.forEach((node) => {
        if (node instanceof HTMLElement) {
          applyElementClip(node, size.x, size.y, dividerPx, currentRevealSide, clipInsetValue);
          applyMask(node, size.x, dividerPx, currentRevealSide);
        }
      });
      const tileLevelClip = applyTileLevelClip(pane, size.x, dividerPx, currentRevealSide);
      const childClipRects = paneChildren.map((child) =>
        applyElementClip(child, size.x, size.y, dividerPx, currentRevealSide, clipInsetValue)
      );

      const now = Date.now();
      if (now - lastApplyLogAtRef.current > 120) {
        lastApplyLogAtRef.current = now;
        const rect = pane.getBoundingClientRect();
        const sampleTile = pane.querySelector('.leaflet-tile') as HTMLElement | null;
        swipeDebug('SwipeLayerClipController', 'clip:apply', {
          paneName,
          source,
          dividerPercent: clampedPercent,
          dividerPx,
          revealSide: currentRevealSide,
          hasClipPathSupport: hasClipPathSupportRef.current,
          paneClipRect: pane.style.clip,
          paneComputedClipRect: paneClipRect,
          paneMask,
          childClipRects,
          paneChildTags: paneChildren.map((child) => child.tagName),
          clipInsetValue,
          paneRect: { width: rect.width, height: rect.height },
          paneChildren: pane.childElementCount,
          tileContainerCount: tileContainers.length,
          tileCount: pane.querySelectorAll('.leaflet-tile').length,
          tileLevelClip,
          sampleTileOpacity: sampleTile?.style?.opacity ?? null,
          sampleTileTransform: sampleTile?.style?.transform ?? null,
        });
      }
    },
    [map, paneName]
  );

  useEffect(() => {
    const pane = map.getPane(paneName) ?? map.createPane(paneName);
    paneRef.current = pane;
    pane.style.setProperty('pointer-events', 'none', 'important');
    pane.style.setProperty('overflow', 'hidden', 'important');
    pane.style.zIndex = '460';
    pane.style.position = 'absolute';
    pane.style.top = '0';
    pane.style.left = '0';
    const initialSize = map.getSize();
    setPaneViewportSize(pane, initialSize.x, initialSize.y);
    swipeDebug('SwipeLayerClipController', 'pane:setup', {
      paneName,
      paneChildren: pane.childElementCount,
      zIndex: pane.style.zIndex,
      paneWidth: pane.style.width,
      paneHeight: pane.style.height,
    });

    const handleMapChange = () => applyClip('map:event');
    map.on('move', handleMapChange);
    map.on('zoom', handleMapChange);
    map.on('resize', handleMapChange);
    map.on('layeradd', handleMapChange);
    map.on('layerremove', handleMapChange);

    const observer =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => applyClip('pane:mutation'))
        : null;
    observer?.observe(pane, { childList: true, subtree: false });

    applyClip('pane:setup');

    return () => {
      swipeDebug('SwipeLayerClipController', 'cleanup', { paneName });
      map.off('move', handleMapChange);
      map.off('zoom', handleMapChange);
      map.off('resize', handleMapChange);
      map.off('layeradd', handleMapChange);
      map.off('layerremove', handleMapChange);
      observer?.disconnect();
      clearElementClip(pane);
      const paneChildren = Array.from(pane.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement
      );
      paneChildren.forEach(clearElementClip);
      const tileContainers = pane.querySelectorAll('.leaflet-tile-container');
      tileContainers.forEach((node) => {
        if (node instanceof HTMLElement) {
          clearElementClip(node);
        }
      });
      clearTileLevelClip(pane);
      pane.style.removeProperty('overflow');
      pane.style.removeProperty('pointer-events');
      pane.style.removeProperty('width');
      pane.style.removeProperty('height');
      if (paneRef.current === pane) {
        paneRef.current = null;
      }
    };
  }, [applyClip, map, paneName]);

  useEffect(() => {
    enabledRef.current = enabled;
    dividerPercentRef.current = dividerPercent;
    revealSideRef.current = revealSide;

    if (!enabled) {
      swipeDebug('SwipeLayerClipController', 'clip:disabled', { paneName });
    }
    applyClip('state:update');
  }, [applyClip, dividerPercent, enabled, paneName, revealSide]);

  return null;
}
