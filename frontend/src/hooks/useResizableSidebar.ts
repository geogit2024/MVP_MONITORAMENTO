import type { PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type UseResizableSidebarOptions = {
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  minMainContentWidth?: number;
  storageKey: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export default function useResizableSidebar({
  defaultWidth,
  minWidth,
  maxWidth,
  minMainContentWidth = 420,
  storageKey,
}: UseResizableSidebarOptions) {
  const getDynamicMaxWidth = useCallback(() => {
    const viewportWidth = typeof window === 'undefined' ? maxWidth : window.innerWidth;
    const availableWidth = viewportWidth - minMainContentWidth;
    return Math.max(minWidth, Math.min(maxWidth, availableWidth));
  }, [maxWidth, minMainContentWidth, minWidth]);

  const getInitialWidth = useCallback(() => {
    if (typeof window === 'undefined') return defaultWidth;
    const fallbackWidth = clamp(defaultWidth, minWidth, getDynamicMaxWidth());
    const rawValue = window.localStorage.getItem(storageKey);
    const parsed = rawValue ? Number(rawValue) : Number.NaN;
    if (!Number.isFinite(parsed)) return fallbackWidth;
    return clamp(parsed, minWidth, getDynamicMaxWidth());
  }, [defaultWidth, getDynamicMaxWidth, minWidth, storageKey]);

  const [width, setWidth] = useState<number>(getInitialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);
  const activePointerIdRef = useRef<number | null>(null);

  const clampWidth = useCallback(
    (value: number) => clamp(value, minWidth, getDynamicMaxWidth()),
    [getDynamicMaxWidth, minWidth]
  );

  useEffect(() => {
    setWidth((prev) => clampWidth(prev));
  }, [clampWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, String(width));
  }, [storageKey, width]);

  useEffect(() => {
    const handleWindowResize = () => {
      setWidth((prev) => clampWidth(prev));
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [clampWidth]);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    activePointerIdRef.current = null;
    document.body.classList.remove('sidebar-resizing');
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) return;
      const deltaX = event.clientX - startXRef.current;
      const nextWidth = clampWidth(startWidthRef.current + deltaX);
      setWidth(nextWidth);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (activePointerIdRef.current !== null && event.pointerId !== activePointerIdRef.current) return;
      stopResizing();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [clampWidth, isResizing, stopResizing]);

  useEffect(() => {
    return () => {
      document.body.classList.remove('sidebar-resizing');
    };
  }, []);

  const handleResizeStart = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    startXRef.current = event.clientX;
    startWidthRef.current = width;
    activePointerIdRef.current = event.pointerId;
    setIsResizing(true);
    document.body.classList.add('sidebar-resizing');
    if (event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }, [width]);

  const bounds = useMemo(() => ({ minWidth, maxWidth }), [maxWidth, minWidth]);

  return {
    width,
    setWidth,
    isResizing,
    handleResizeStart,
    bounds,
  };
}
