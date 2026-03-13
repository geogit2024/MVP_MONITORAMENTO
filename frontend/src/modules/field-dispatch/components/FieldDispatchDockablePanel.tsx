import React, { useCallback, useRef } from 'react';
import Draggable from 'react-draggable';
import { Resizable, type ResizeCallbackData, type ResizeHandle } from 'react-resizable';

export interface DockablePanelSize {
  width: number;
  height: number;
}

export interface DockablePanelPosition {
  x: number;
  y: number;
}

interface FieldDispatchDockablePanelProps {
  title: string;
  detached: boolean;
  size: DockablePanelSize;
  position: DockablePanelPosition;
  minWidth: number;
  minHeight: number;
  zIndex: number;
  onFocus: () => void;
  onToggleDetached: () => void;
  onPositionChange: (position: DockablePanelPosition) => void;
  onSizeChange: (size: DockablePanelSize) => void;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

export function FieldDispatchDockablePanel({
  title,
  detached,
  size,
  position,
  minWidth,
  minHeight,
  zIndex,
  onFocus,
  onToggleDetached,
  onPositionChange,
  onSizeChange,
  headerActions,
  children,
}: FieldDispatchDockablePanelProps) {
  const nodeRef = useRef<HTMLDivElement | null>(null);

  const handleResize = useCallback(
    (_event: React.SyntheticEvent, data: ResizeCallbackData) => {
      onSizeChange({
        width: Math.max(minWidth, Math.round(data.size.width)),
        height: Math.max(minHeight, Math.round(data.size.height)),
      });
    },
    [minHeight, minWidth, onSizeChange]
  );

  const renderResizeHandle = useCallback(
    (handleAxis: ResizeHandle, ref: React.RefObject<HTMLElement>) => (
      <span
        ref={ref as React.RefObject<HTMLSpanElement>}
        className={`field-dispatch-dockable-panel__resize-handle field-dispatch-dockable-panel__resize-handle--${handleAxis}`}
        onMouseDown={(event) => {
          event.stopPropagation();
          onFocus();
        }}
      />
    ),
    [onFocus]
  );

  const panelMarkup = (
    <div
      className={`field-dispatch-dockable-panel ${detached ? 'is-detached' : 'is-anchored'}`}
      style={{
        width: size.width,
        height: size.height,
        minWidth,
        minHeight,
      }}
      onMouseDown={onFocus}
    >
      <div
        className={`field-dispatch-dockable-panel__header ${detached ? 'is-draggable' : ''}`}
      >
        <h3>{title}</h3>
        <div className="field-dispatch-dockable-panel__actions">
          {headerActions}
          <button
            type="button"
            className="dispatch-button ghost"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onToggleDetached}
          >
            {detached ? 'Acoplar' : 'Desacoplar'}
          </button>
        </div>
      </div>
      <div className="field-dispatch-dockable-panel__body">{children}</div>
    </div>
  );

  const resizablePanelMarkup = (
    <Resizable
      width={size.width}
      height={size.height}
      minConstraints={[minWidth, minHeight]}
      onResize={handleResize}
      resizeHandles={['se']}
      handle={renderResizeHandle}
      handleSize={[18, 18]}
    >
      {panelMarkup}
    </Resizable>
  );

  if (detached) {
    return (
      <Draggable
        nodeRef={nodeRef}
        handle=".field-dispatch-dockable-panel__header"
        bounds="parent"
        position={position}
        onStart={onFocus}
        onDrag={(_event, data) => {
          onPositionChange({ x: data.x, y: data.y });
        }}
      >
        <div
          ref={nodeRef}
          className="field-dispatch-dockable-shell is-detached"
          style={{ zIndex }}
          onMouseDown={onFocus}
        >
          {resizablePanelMarkup}
        </div>
      </Draggable>
    );
  }

  return (
    <div
      ref={nodeRef}
      className="field-dispatch-dockable-shell is-anchored"
      style={{
        zIndex,
        left: position.x,
        top: position.y,
      }}
      onMouseDown={onFocus}
    >
      {resizablePanelMarkup}
    </div>
  );
}

export default FieldDispatchDockablePanel;
