import type { PointerEvent as ReactPointerEvent } from 'react';

type SwipeDividerProps = {
  isEnabled: boolean;
  dividerPercent: number;
  revealSide: 'left' | 'right';
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

export default function SwipeDivider({
  isEnabled,
  dividerPercent,
  revealSide,
  onPointerDown,
}: SwipeDividerProps) {
  if (!isEnabled) return null;

  return (
    <div className="swipe-divider-overlay" aria-hidden>
      <div
        className={`swipe-divider-line reveal-${revealSide}`}
        style={{ left: `${dividerPercent}%` }}
        onPointerDown={onPointerDown}
      >
        <div className="swipe-divider-handle" onPointerDown={onPointerDown}>
          <span className="swipe-divider-handle-icon">||</span>
        </div>
      </div>
    </div>
  );
}
