import type { PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clientXToPercent, clampSwipePercent } from './swipeUtils';
import type { SwipeLayerDescriptor, SwipeRevealSide } from './types';
import { swipeDebug, swipeDebugWarn } from './swipeDebug';

type PersistedSwipeState = {
  leftLayerId: string | null;
  rightLayerId: string | null;
  dividerPercent: number;
  revealSide: SwipeRevealSide;
};

const SWIPE_SESSION_KEY = 'app.map.swipe.state';

const normalizeLayerUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    ['token', 'access_token', 'expires', 'cacheBust', '_ts', 'ts'].forEach((key) => {
      parsed.searchParams.delete(key);
    });
    return `${parsed.origin}${parsed.pathname}?${parsed.searchParams.toString()}`;
  } catch {
    return url;
  }
};

const readPersistedState = (): PersistedSwipeState | null => {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(SWIPE_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedSwipeState;
    return {
      leftLayerId: parsed.leftLayerId ?? null,
      rightLayerId: parsed.rightLayerId ?? null,
      dividerPercent: clampSwipePercent(Number(parsed.dividerPercent ?? 50)),
      revealSide: parsed.revealSide === 'right' ? 'right' : 'left',
    };
  } catch {
    return null;
  }
};

export default function useSwipe(availableLayers: SwipeLayerDescriptor[]) {
  const persisted = useMemo(readPersistedState, []);
  const [isSwipeEnabled, setIsSwipeEnabled] = useState(false);
  const [leftLayerId, setLeftLayerId] = useState<string | null>(persisted?.leftLayerId ?? null);
  const [rightLayerId, setRightLayerId] = useState<string | null>(persisted?.rightLayerId ?? null);
  const [dividerPercent, setDividerPercent] = useState<number>(persisted?.dividerPercent ?? 50);
  const [revealSide, setRevealSide] = useState<SwipeRevealSide>(persisted?.revealSide ?? 'left');
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const lastMoveLogAtRef = useRef(0);

  const layerById = useMemo(() => {
    const map = new Map<string, SwipeLayerDescriptor>();
    availableLayers.forEach((layer) => map.set(layer.id, layer));
    return map;
  }, [availableLayers]);

  const hasAtLeastTwoLayers = availableLayers.length >= 2;
  const leftLayer = leftLayerId ? layerById.get(leftLayerId) ?? null : null;
  const rightLayer = rightLayerId ? layerById.get(rightLayerId) ?? null : null;
  const hasDistinctLayerSources = Boolean(
    !leftLayer ||
      !rightLayer ||
      normalizeLayerUrl(leftLayer.url) !== normalizeLayerUrl(rightLayer.url)
  );
  const canEnableSwipe = Boolean(
    hasAtLeastTwoLayers &&
      leftLayerId &&
      rightLayerId &&
      leftLayerId !== rightLayerId &&
      hasDistinctLayerSources &&
      layerById.has(leftLayerId) &&
      layerById.has(rightLayerId)
  );

  useEffect(() => {
    swipeDebug('useSwipe', 'layers:available', {
      count: availableLayers.length,
      layerIds: availableLayers.map((layer) => layer.id),
    });
    if (!hasAtLeastTwoLayers) {
      setIsSwipeEnabled(false);
      return;
    }

    const first = availableLayers[0]?.id ?? null;
    const second = availableLayers[1]?.id ?? null;

    if (!leftLayerId || !layerById.has(leftLayerId)) {
      setLeftLayerId(first);
    }

    if (!rightLayerId || !layerById.has(rightLayerId) || rightLayerId === leftLayerId) {
      const candidate = availableLayers.find((layer) => layer.id !== (leftLayerId ?? first))?.id ?? second;
      setRightLayerId(candidate ?? null);
    }
  }, [availableLayers, hasAtLeastTwoLayers, layerById, leftLayerId, rightLayerId]);

  useEffect(() => {
    if (isSwipeEnabled && !canEnableSwipe) {
      swipeDebugWarn('useSwipe', 'disable:auto-invalid-selection', {
        leftLayerId,
        rightLayerId,
        hasDistinctLayerSources,
      });
      setIsSwipeEnabled(false);
    }
  }, [canEnableSwipe, hasDistinctLayerSources, isSwipeEnabled, leftLayerId, rightLayerId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload: PersistedSwipeState = {
      leftLayerId,
      rightLayerId,
      dividerPercent: clampSwipePercent(dividerPercent),
      revealSide,
    };
    window.sessionStorage.setItem(SWIPE_SESSION_KEY, JSON.stringify(payload));
  }, [dividerPercent, leftLayerId, revealSide, rightLayerId]);

  const setContainerElement = useCallback((element: HTMLElement | null) => {
    containerRef.current = element;
    swipeDebug('useSwipe', 'container:set', {
      hasElement: Boolean(element),
      width: element?.getBoundingClientRect().width ?? null,
      height: element?.getBoundingClientRect().height ?? null,
    });
  }, []);

  const updateDividerFromClientX = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) {
      swipeDebugWarn('useSwipe', 'divider:update:missing-container', { clientX });
      return;
    }
    const nextPercent = clientXToPercent(clientX, container);
    setDividerPercent(nextPercent);
    const now = Date.now();
    if (now - lastMoveLogAtRef.current > 120) {
      lastMoveLogAtRef.current = now;
      const rect = container.getBoundingClientRect();
      swipeDebug('useSwipe', 'divider:update', {
        clientX,
        nextPercent,
        containerLeft: rect.left,
        containerWidth: rect.width,
      });
    }
  }, []);

  const stopDragging = useCallback(() => {
    setIsDragging(false);
    activePointerIdRef.current = null;
    document.body.classList.remove('swipe-dragging');
    swipeDebug('useSwipe', 'drag:stop', { dividerPercent });
  }, [dividerPercent]);

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) return;
      updateDividerFromClientX(event.clientX);
    };

    const handlePointerEnd = (event: PointerEvent) => {
      if (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) return;
      stopDragging();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [isDragging, stopDragging, updateDividerFromClientX]);

  useEffect(() => () => document.body.classList.remove('swipe-dragging'), []);

  const onDividerPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      activePointerIdRef.current = event.pointerId;
      setIsDragging(true);
      document.body.classList.add('swipe-dragging');
      updateDividerFromClientX(event.clientX);
      swipeDebug('useSwipe', 'drag:start', {
        pointerId: event.pointerId,
        clientX: event.clientX,
        currentPercent: dividerPercent,
      });
      if (event.currentTarget.setPointerCapture) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    },
    [dividerPercent, updateDividerFromClientX]
  );

  const enableSwipe = useCallback(() => {
    if (!canEnableSwipe) return;
    setIsSwipeEnabled(true);
    swipeDebug('useSwipe', 'mode:enable', { leftLayerId, rightLayerId });
  }, [canEnableSwipe, leftLayerId, rightLayerId]);

  const disableSwipe = useCallback(() => {
    setIsSwipeEnabled(false);
    stopDragging();
    swipeDebug('useSwipe', 'mode:disable');
  }, [stopDragging]);

  const resetSwipe = useCallback(() => {
    setDividerPercent(50);
    swipeDebug('useSwipe', 'divider:reset', { to: 50 });
  }, []);
  const swapLayers = useCallback(() => {
    setLeftLayerId((prevLeft) => {
      const nextLeft = rightLayerId;
      setRightLayerId(prevLeft);
      swipeDebug('useSwipe', 'layers:swap', { nextLeft, nextRight: prevLeft });
      return nextLeft;
    });
  }, [rightLayerId]);
  const toggleRevealSide = useCallback(
    () =>
      setRevealSide((prev) => {
        const next = prev === 'left' ? 'right' : 'left';
        swipeDebug('useSwipe', 'reveal:toggle', { from: prev, to: next });
        return next;
      }),
    []
  );

  return {
    availableLayers,
    isSwipeEnabled,
    canEnableSwipe,
    hasAtLeastTwoLayers,
    hasDistinctLayerSources,
    leftLayerId,
    rightLayerId,
    leftLayer,
    rightLayer,
    dividerPercent: clampSwipePercent(dividerPercent),
    revealSide,
    isDragging,
    setContainerElement,
    setLeftLayerId,
    setRightLayerId,
    setDividerPercent: (value: number) => setDividerPercent(clampSwipePercent(value)),
    onDividerPointerDown,
    enableSwipe,
    disableSwipe,
    resetSwipe,
    swapLayers,
    toggleRevealSide,
  };
}
