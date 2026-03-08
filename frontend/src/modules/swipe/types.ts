export type SwipeLayerKind = 'tile' | 'imageOverlay';

type SwipeLayerBase = {
  id: string;
  label: string;
  kind: SwipeLayerKind;
  zIndex?: number;
  opacity?: number;
  attribution?: string;
  className?: string;
};

export type SwipeTileLayerDescriptor = SwipeLayerBase & {
  kind: 'tile';
  url: string;
};

export type SwipeImageOverlayDescriptor = SwipeLayerBase & {
  kind: 'imageOverlay';
  url: string;
  bounds: [[number, number], [number, number]];
};

export type SwipeLayerDescriptor = SwipeTileLayerDescriptor | SwipeImageOverlayDescriptor;

export type SwipeRevealSide = 'left' | 'right';

