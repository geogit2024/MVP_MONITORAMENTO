import React, { useEffect, useRef } from 'react';
import { ImageInfo } from '../MainApplication';
import './ImageCarousel.css';

const CHANGE_LAYER_ID = 'change-detection-result';

interface TimelineItem {
  id: string;
  date: string;
}

interface ImageCarouselProps {
  images: ImageInfo[];
  selectedIds: string[];
  onSelect: (id: string) => void;
  onPreview: (id: string) => void;
  activeLayerId: string | null;
  timelineItems: TimelineItem[];
  timelineIndex: number;
  timelinePlaying: boolean;
  timelineSpeedMs: number;
  onTimelineIndexChange: (index: number) => void;
  onTimelinePlayToggle: () => void;
  onTimelineSpeedChange: (value: number) => void;
  hasSelectableImages: boolean;
  allSelectableSelected: boolean;
  onSelectAllImages: () => void;
  onDeselectAllImages: () => void;
}

const ImageCarousel: React.FC<ImageCarouselProps> = ({
  images,
  selectedIds,
  onSelect,
  onPreview,
  activeLayerId,
  timelineItems,
  timelineIndex,
  timelinePlaying,
  timelineSpeedMs,
  onTimelineIndexChange,
  onTimelinePlayToggle,
  onTimelineSpeedChange,
  hasSelectableImages,
  allSelectableSelected,
  onSelectAllImages,
  onDeselectAllImages,
}) => {
  const timelineEnabled = timelineItems.length >= 2;
  const currentTimelineLabel = timelineItems[timelineIndex]?.date || '-';
  const currentTimelineImageId = timelineItems[timelineIndex]?.id || null;
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!timelinePlaying || !currentTimelineImageId || !trackRef.current) return;
    const activeThumb = trackRef.current.querySelector(
      `.thumbnail[data-image-id="${currentTimelineImageId}"]`
    ) as HTMLElement | null;
    if (activeThumb) {
      activeThumb.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [timelinePlaying, currentTimelineImageId]);

  return (
    <div className="image-carousel">
      <div className="image-carousel-track" ref={trackRef}>
        {images.map((img) => {
          const isActive = selectedIds.includes(img.id) || activeLayerId === img.id;
          const isIndexLayerItem = img.id.startsWith('index-');
          const isTimelineFrame = currentTimelineImageId === img.id;

          if (img.id === CHANGE_LAYER_ID) {
            return (
              <div
                key={img.id}
                data-image-id={img.id}
                className={`thumbnail ${isActive ? 'selected' : ''}`}
                onClick={() => onSelect(img.id)}
                title="Clique para mostrar/esconder a camada de alteracoes"
              >
                <img src={img.thumbnailUrl} alt="Resultado da Analise" />
                <div className="date-label">{img.date}</div>
              </div>
            );
          }

          if (isIndexLayerItem) {
            return (
              <div
                key={img.id}
                data-image-id={img.id}
                className={`thumbnail ${isActive ? 'selected' : ''}`}
                onClick={() => onSelect(img.id)}
                title={`Mostrar/esconder ${img.date}`}
              >
                <img src={img.thumbnailUrl} alt={`Camada ${img.date}`} />
                <div className="date-label">{img.date}</div>
              </div>
            );
          }

          return (
            <div
              key={img.id}
              data-image-id={img.id}
              className={`thumbnail ${isActive ? 'selected' : ''} ${isTimelineFrame ? 'timeline-current' : ''}`}
              onClick={() => onPreview(img.id)}
              title={`Pre-visualizar imagem de ${img.date}`}
            >
              <img src={img.thumbnailUrl} alt={`Imagem de ${img.date}`} />
              <div className="date-label">{img.date}</div>
              {isTimelineFrame && <div className="timeline-frame-badge">Frame</div>}

              <div
                className="selection-checkbox"
                title="Selecionar para analise temporal"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(img.id);
                }}
              >
                {isActive ? '✓' : ''}
              </div>
            </div>
          );
        })}
      </div>

      <div className="time-slider-toolbar">
        <button
          type="button"
          className="time-play-btn"
          onClick={onTimelinePlayToggle}
          disabled={!timelineEnabled}
          title={timelinePlaying ? 'Pausar animacao temporal' : 'Reproduzir animacao temporal'}
        >
          {timelinePlaying ? 'Pausar' : 'Play'}
        </button>

        <input
          type="range"
          min={0}
          max={Math.max(0, timelineItems.length - 1)}
          step={1}
          value={Math.min(timelineIndex, Math.max(0, timelineItems.length - 1))}
          onChange={(e) => onTimelineIndexChange(Number(e.target.value))}
          disabled={!timelineEnabled}
          className="time-slider"
          title="Time slider das imagens selecionadas"
        />

        <span className="time-label">{currentTimelineLabel}</span>

        <label className="time-speed">
          Vel:
          <select
            value={timelineSpeedMs}
            onChange={(e) => onTimelineSpeedChange(Number(e.target.value))}
            disabled={!timelineEnabled}
          >
            <option value={700}>Rapida</option>
            <option value={1200}>Media</option>
            <option value={1800}>Lenta</option>
          </select>
        </label>

        <button
          type="button"
          className="select-all-btn"
          onClick={allSelectableSelected ? onDeselectAllImages : onSelectAllImages}
          disabled={!hasSelectableImages}
          title={allSelectableSelected ? 'Desmarcar todas as imagens' : 'Marcar todas as imagens'}
        >
          {allSelectableSelected ? 'Desmarcar todas' : 'Marcar todas'}
        </button>
      </div>
    </div>
  );
};

export default ImageCarousel;
