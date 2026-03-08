import type { PointerEvent as ReactPointerEvent } from 'react';

type SidebarResizeHandleProps = {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  isResizing: boolean;
};

export default function SidebarResizeHandle({ onPointerDown, isResizing }: SidebarResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionar barra lateral"
      className={`sidebar-resize-handle ${isResizing ? 'is-resizing' : ''}`}
      onPointerDown={onPointerDown}
    />
  );
}
