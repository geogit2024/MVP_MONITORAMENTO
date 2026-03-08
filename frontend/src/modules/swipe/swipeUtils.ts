// @ts-expect-error - project currently has no @types/leaflet installed
import L from 'leaflet';
import { SwipeRevealSide } from './types';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const clampSwipePercent = (percent: number) => clamp(percent, 0, 100);

export const clientXToPercent = (clientX: number, container: HTMLElement): number => {
  const rect = container.getBoundingClientRect();
  if (rect.width <= 0) return 50;
  return clampSwipePercent(((clientX - rect.left) / rect.width) * 100);
};

export const getLayerHTMLElement = (layer: L.Layer | null): HTMLElement | null => {
  if (!layer) return null;
  const grid = layer as L.GridLayer;
  if (typeof grid.getContainer === 'function') {
    return grid.getContainer() as HTMLElement | null;
  }
  const image = layer as L.ImageOverlay;
  if (typeof image.getElement === 'function') {
    return image.getElement() as HTMLElement | null;
  }
  return null;
};

export const applySwipeClip = (
  element: HTMLElement | null,
  dividerPercent: number,
  revealSide: SwipeRevealSide
) => {
  if (!element) return;
  const clamped = clampSwipePercent(dividerPercent);
  const insetValue = revealSide === 'left' ? `${100 - clamped}%` : `${clamped}%`;
  const clipPath =
    revealSide === 'left'
      ? `inset(0 ${insetValue} 0 0)`
      : `inset(0 0 0 ${insetValue})`;

  element.style.clipPath = clipPath;
  (element.style as CSSStyleDeclaration & { webkitClipPath?: string }).webkitClipPath = clipPath;
  element.style.willChange = 'clip-path';
};

export const clearSwipeClip = (element: HTMLElement | null) => {
  if (!element) return;
  element.style.clipPath = '';
  (element.style as CSSStyleDeclaration & { webkitClipPath?: string }).webkitClipPath = '';
  element.style.willChange = '';
};
